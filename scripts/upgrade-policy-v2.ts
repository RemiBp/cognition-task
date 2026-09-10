/**
 * Brings a database created before the policy/consistency revision up to the
 * current schema without dropping anything.
 *
 *   npm run upgrade   # then: npm run db:push
 *
 * Stop the application before running either command. The old revision can
 * still decide a pending proposal while this runs, and a decision landing
 * between the read and the write is a race this script can only detect, not
 * prevent: `--release-incompatible` refuses to overwrite a row that has been
 * decided in the meantime, and reports it instead.
 *
 * The revision adds required and unique columns (case reference, approval
 * payload hash and request key, record versions). Applying it with `prisma db
 * push` alone would fail, or ask to reset, on a populated database. This script
 * adds the columns with safe defaults and backfills them first, so the push
 * that follows is a no-op on the data.
 *
 * Everything it could refuse is checked before it writes anything, because a
 * refusal halfway through leaves a database that is neither revision. The
 * checks it makes are about proposals that are still open: a pending proposal
 * whose payload cannot satisfy the current action schema would be undecidable
 * after the upgrade, holding a reservation on a record nobody can act on. The
 * script does not invent the missing fields, in particular not a reason
 * somebody never wrote. It reports them, and `--release-incompatible` rejects
 * those proposals on the old revision so the work can be proposed again after
 * the upgrade.
 */
import "@/platform/registry";
import { canonicalPayloadHash, getAction } from "@/platform/actions";
import { db } from "@/platform/db";

type ColumnInfo = { name: string };

type LegacyApproval = {
  id: string;
  createdAt?: string;
  action: string;
  resource: string;
  resourceId: string | null;
  payload: string;
  status: string;
  requestedById: string;
};

const releaseIncompatible = process.argv.includes("--release-incompatible");

async function columns(table: string): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<ColumnInfo[]>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map((row) => row.name));
}

async function tableExists(table: string) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
  );
  return rows.length > 0;
}

async function addColumn(table: string, name: string, definition: string) {
  // Databases from different points in the project's history hold different
  // tables; a missing one is not an error here, `db push` creates it.
  if (!(await tableExists(table))) return false;
  const existing = await columns(table);
  if (existing.has(name)) return false;
  await db.$executeRawUnsafe(`ALTER TABLE "${table}" ADD COLUMN "${name}" ${definition}`);
  console.log(`added ${table}.${name}`);
  return true;
}

/** The transport identifier a legacy row never carried; not a business field. */
const legacyIntentKey = (id: string) => `legacy-intent-${id}`;

/**
 * Why this pending proposal could not be decided after the upgrade, or null.
 * The answer comes from the action's own schema, so it stays true as the
 * actions change.
 */
function incompatibility(approval: LegacyApproval): string | null {
  let payload: unknown;
  try {
    payload = JSON.parse(approval.payload);
  } catch {
    return "its payload is not valid JSON";
  }
  if (!payload || typeof payload !== "object") return "its payload is not an object";

  let action;
  try {
    action = getAction(approval.action);
  } catch {
    return `the action ${approval.action} no longer exists`;
  }

  const candidate = {
    intentKey: legacyIntentKey(approval.id),
    ...(payload as Record<string, unknown>),
  };
  const parsed = action.schema.safeParse(candidate);
  if (parsed.success) return null;
  return parsed.error.issues
    .map((issue) => `${issue.path.join(".") || "payload"}: ${issue.message}`)
    .join("; ");
}

/** Read-only. Runs before any DDL or DML, so a refusal changes nothing. */
async function preflight(): Promise<{ blockers: string[]; approvals: LegacyApproval[] }> {
  const blockers: string[] = [];
  if (!(await tableExists("ApprovalRequest"))) return { blockers, approvals: [] };

  const existing = await columns("ApprovalRequest");
  const select = ["id", "action", "resource", "payload", "status", "requestedById"];
  if (existing.has("resourceId")) select.push("resourceId");
  if (existing.has("createdAt")) select.push("createdAt");
  // Which of several proposals on one record is kept has to be the same on
  // every run, so the order is stated rather than left to the engine.
  const order = existing.has("createdAt") ? `"createdAt", "id"` : `"id"`;

  const pending = await db.$queryRawUnsafe<LegacyApproval[]>(
    `SELECT ${select.map((name) => `"${name}"`).join(", ")} FROM "ApprovalRequest"
     WHERE "status" = 'pending' ORDER BY ${order}`,
  );

  const orphans = pending.filter((row) => !row.resourceId);
  if (orphans.length > 0) {
    blockers.push(
      `${orphans.length} pending approval(s) have no resource id: ${orphans
        .map((row) => row.id)
        .join(", ")}. A proposal cannot hold a reservation on a record it does not name.`,
    );
  }

  const undecidable = pending
    .filter((row) => row.resourceId)
    .map((row) => ({ row, why: incompatibility(row) }))
    .filter((item): item is { row: LegacyApproval; why: string } => item.why !== null);
  if (undecidable.length > 0) {
    blockers.push(
      `${undecidable.length} pending approval(s) could not be decided after the upgrade:\n` +
        undecidable.map((item) => `    ${item.row.id} (${item.row.action}) ${item.why}`).join("\n"),
    );
  }

  const reservations = new Map<string, string[]>();
  for (const row of pending) {
    if (!row.resourceId) continue;
    const key = `${row.resource}:${row.resourceId}`;
    reservations.set(key, [...(reservations.get(key) ?? []), row.id]);
  }
  const contested = [...reservations.entries()].filter(([, ids]) => ids.length > 1);
  if (contested.length > 0) {
    blockers.push(
      `${contested.length} record(s) have more than one pending approval, and the new schema ` +
        `allows one: ${contested.map(([key, ids]) => `${key} (${ids.join(", ")})`).join("; ")}.`,
    );
  }

  return { blockers, approvals: pending };
}

/**
 * Rejects the proposals the preflight named, on the old revision, writing only
 * to the approval rows. The records they targeted are left exactly as they
 * are, which is what rejecting a proposal means here, so the same decision can
 * be proposed again after the upgrade.
 */
async function releaseBlockedProposals(pending: LegacyApproval[]) {
  const doomed = pending.filter((row) => !row.resourceId || incompatibility(row) !== null);
  const contested = new Map<string, LegacyApproval[]>();
  for (const row of pending) {
    if (!row.resourceId || incompatibility(row) !== null) continue;
    const key = `${row.resource}:${row.resourceId}`;
    contested.set(key, [...(contested.get(key) ?? []), row]);
  }
  // Where a record has several open proposals, the first in the deterministic
  // order the preflight read them in is kept and the rest are released: the
  // schema allows exactly one.
  for (const rows of contested.values()) {
    if (rows.length > 1) doomed.push(...rows.slice(1));
  }

  let released = 0;
  const skipped: string[] = [];
  for (const row of doomed) {
    // Compare-and-set on the status the preflight saw. If the old application
    // approved this proposal in between, its domain change is already applied
    // and overwriting the row with 'rejected' would describe an approval as a
    // rejection.
    const changed = await db.$executeRawUnsafe(
      `UPDATE "ApprovalRequest"
       SET "status" = 'rejected', "decidedAt" = CURRENT_TIMESTAMP,
           "decisionNote" = 'Released by the policy revision upgrade: this proposal predates the current action contract and was never decided. The record was not changed; propose it again if it still applies.'
       WHERE "id" = ? AND "status" = 'pending'`,
      row.id,
    );
    if (changed === 1) released += 1;
    else skipped.push(row.id);
  }
  console.log(`released ${released} pending proposal(s); no record was changed`);
  if (skipped.length > 0) {
    console.log(
      `skipped ${skipped.length} proposal(s) decided while this ran, left as they are: ` +
        `${skipped.join(", ")}. Stop the application, then run the upgrade again.`,
    );
  }
  return released;
}

async function main() {
  if (!(await tableExists("KycCase"))) {
    console.log("Nothing to upgrade: this database has no tables yet. Run npm run setup.");
    return;
  }

  const { blockers, approvals } = await preflight();

  if (releaseIncompatible) {
    if (approvals.length === 0) {
      console.log("Nothing to release: no pending approvals.");
    } else {
      await releaseBlockedProposals(approvals);
    }
    console.log("Now run: npm run upgrade");
    return;
  }

  if (blockers.length > 0) {
    throw new Error(
      `This database cannot be upgraded as it stands. Nothing has been changed.\n\n` +
        blockers.map((line) => `  - ${line}`).join("\n") +
        `\n\nStop the application, then decide those proposals on the current revision, or ` +
        `release them without touching the records they targeted:\n\n` +
        `  npm run upgrade -- --release-incompatible\n\n` +
        `Releasing rejects the proposals, which leaves every record as it is. The same ` +
        `decisions can be proposed again, with the reasons their authors write then.`,
    );
  }

  for (const [table, name, definition] of [
    ["KycCase", "reference", "TEXT"],
    ["KycCase", "evidenceSummary", "TEXT"],
    ["KycCase", "reasoning", "TEXT"],
    ["KycCase", "isDemo", "BOOLEAN NOT NULL DEFAULT 0"],
    ["KycCase", "version", "INTEGER NOT NULL DEFAULT 0"],
    ["KycCase", "updatedAt", "DATETIME"],
    ["Refund", "reasoning", "TEXT"],
    ["Refund", "version", "INTEGER NOT NULL DEFAULT 0"],
    ["Dispute", "reasoning", "TEXT"],
    ["Dispute", "version", "INTEGER NOT NULL DEFAULT 0"],
    ["FeatureFlag", "version", "INTEGER NOT NULL DEFAULT 0"],
    ["ApprovalRequest", "payloadHash", "TEXT"],
    ["ApprovalRequest", "requestKey", "TEXT"],
    ["ApprovalRequest", "targetVersion", "INTEGER NOT NULL DEFAULT 0"],
    ["ApprovalRequest", "subject", "TEXT"],
    ["ApprovalRequest", "activeKey", "TEXT NOT NULL DEFAULT 'active'"],
  ] as const) {
    await addColumn(table, name, definition);
  }

  await db.$executeRawUnsafe(
    `UPDATE "KycCase" SET "updatedAt" = COALESCE("updatedAt", "submittedAt")`,
  );
  // References become unique in the new schema, so a derived value has to be
  // proven unique here rather than assumed: rowid disambiguates collisions.
  await db.$executeRawUnsafe(
    `UPDATE "KycCase" SET "reference" = 'KYC-LEGACY-' || substr("id", -8) WHERE "reference" IS NULL`,
  );
  await db.$executeRawUnsafe(
    `UPDATE "KycCase" SET "reference" = "reference" || '-' || rowid
     WHERE "reference" IN (SELECT "reference" FROM "KycCase" GROUP BY "reference" HAVING COUNT(*) > 1)`,
  );
  await db.$executeRawUnsafe(
    `UPDATE "ApprovalRequest" SET "resourceId" = 'legacy-unknown' WHERE "resourceId" IS NULL OR "resourceId" = ''`,
  );

  // Hashes are derived per row rather than in SQL, so they match exactly what
  // the running application would compute for the same request.
  const stale = await db.$queryRawUnsafe<LegacyApproval[]>(
    `SELECT "id", "action", "resource", "resourceId", "payload", "status", "requestedById"
     FROM "ApprovalRequest" WHERE "payloadHash" IS NULL OR "requestKey" IS NULL`,
  );

  for (const approval of stale) {
    const parsed = JSON.parse(approval.payload) as Record<string, unknown>;
    // The intent key is a transport identifier, so a pending row can be given
    // one without inventing anything a person was supposed to write.
    const payload =
      approval.status === "pending" && typeof parsed.intentKey !== "string"
        ? { intentKey: legacyIntentKey(approval.id), ...parsed }
        : parsed;
    const payloadHash = canonicalPayloadHash(approval.action, payload);
    // Request keys address one attempt at runtime, and there is no record of
    // the attempt a historical row belonged to; the id keeps them distinct.
    const requestKey = `legacy:${approval.id}`;
    const activeKey = approval.status === "pending" ? "active" : approval.id;
    await db.$executeRawUnsafe(
      `UPDATE "ApprovalRequest" SET "payload" = ?, "payloadHash" = ?, "requestKey" = ?, "activeKey" = ? WHERE "id" = ?`,
      JSON.stringify(payload),
      payloadHash,
      requestKey,
      activeKey,
      approval.id,
    );
  }

  console.log(`Backfilled ${stale.length} approval request(s). Now run: npm run db:push`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
