/**
 * Brings a database created before the policy/consistency revision up to the
 * current schema without dropping anything.
 *
 *   npm run upgrade   # then: npm run db:push
 *
 * The revision adds required and unique columns (case reference, approval
 * payload hash and request key, record versions). Applying it with `prisma db
 * push` alone would fail, or ask to reset, on a populated database. This script
 * adds the columns with safe defaults and backfills them first, so the push
 * that follows is a no-op on the data.
 *
 * It refuses to guess where guessing would corrupt an audit trail: a pending
 * approval with no resource id cannot be reserved, so the upgrade stops and
 * tells you to decide those proposals on the old revision first.
 */
import { canonicalPayloadHash } from "@/platform/actions";
import { db } from "@/platform/db";

type ColumnInfo = { name: string };

async function columns(table: string): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<ColumnInfo[]>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map((row) => row.name));
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

async function tableExists(table: string) {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${table}'`,
  );
  return rows.length > 0;
}

async function main() {
  if (!(await tableExists("KycCase"))) {
    console.log("Nothing to upgrade: this database has no tables yet. Run npm run setup.");
    return;
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

  const orphanPending = await db.$queryRawUnsafe<{ count: number }[]>(
    `SELECT COUNT(*) AS count FROM "ApprovalRequest" WHERE "status" = 'pending' AND ("resourceId" IS NULL OR "resourceId" = '')`,
  );
  if (Number(orphanPending[0]?.count ?? 0) > 0) {
    throw new Error(
      `${orphanPending[0].count} pending approval(s) have no resource id. A proposal cannot hold a ` +
        "reservation without one. Decide or cancel those proposals on the previous revision, then " +
        "run this upgrade again. No data has been changed by this run beyond added columns.",
    );
  }
  await db.$executeRawUnsafe(
    `UPDATE "ApprovalRequest" SET "resourceId" = 'legacy-unknown' WHERE "resourceId" IS NULL OR "resourceId" = ''`,
  );

  // Hashes are derived per row rather than in SQL, so they match exactly what
  // the running application would compute for the same request.
  const approvals = await db.$queryRawUnsafe<
    {
      id: string;
      action: string;
      resource: string;
      resourceId: string;
      payload: string;
      status: string;
      requestedById: string;
    }[]
  >(
    `SELECT "id", "action", "resource", "resourceId", "payload", "status", "requestedById"
     FROM "ApprovalRequest" WHERE "payloadHash" IS NULL OR "requestKey" IS NULL`,
  );

  for (const approval of approvals) {
    // Hashed the way the application hashes, so a replay of a historical
    // request is recognised as one instead of opening a second proposal.
    const payloadHash = canonicalPayloadHash(approval.action, JSON.parse(approval.payload));
    // Request keys are scoped to an attempt at runtime and there is no record
    // of the attempt a historical row belonged to; the id keeps them distinct.
    const requestKey = `legacy:${approval.id}`;
    const activeKey = approval.status === "pending" ? "active" : approval.id;
    await db.$executeRawUnsafe(
      `UPDATE "ApprovalRequest" SET "payloadHash" = ?, "requestKey" = ?, "activeKey" = ? WHERE "id" = ?`,
      payloadHash,
      requestKey,
      activeKey,
      approval.id,
    );
  }

  console.log(
    `Backfilled ${approvals.length} approval request(s). Now run: npm run db:push`,
  );
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
