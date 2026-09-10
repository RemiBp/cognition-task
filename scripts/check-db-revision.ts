/**
 * Runs before `npm run setup`. A database created before the policy revision
 * cannot take the new required columns, and `prisma db push` answers that with
 * an offer to drop it. Stop first and point at the upgrade instead, so nobody
 * reaches for --force-reset on data they wanted to keep.
 *
 * It looks at every column the revision adds, not one of them: an upgrade that
 * stopped halfway leaves some present and some missing, and treating that as
 * finished is how a half-upgraded database reaches `db push`.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) process.exit(0);

const db = new PrismaClient();

type Column = { name: string };

/** Columns this revision adds, by table. */
const EXPECTED: Record<string, string[]> = {
  KycCase: ["reference", "evidenceSummary", "reasoning", "isDemo", "version", "updatedAt"],
  Refund: ["reasoning", "version"],
  Dispute: ["reasoning", "version"],
  FeatureFlag: ["version"],
  ApprovalRequest: ["payloadHash", "requestKey", "targetVersion", "subject", "activeKey"],
};

async function tables(): Promise<Set<string>> {
  const rows = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table'`,
  );
  return new Set(rows.map((row) => row.name));
}

async function main() {
  const present = await tables();
  if (!present.has("KycCase")) return;

  const missing: string[] = [];
  const found: string[] = [];
  for (const [table, expected] of Object.entries(EXPECTED)) {
    if (!present.has(table)) continue;
    const columns = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("${table}")`);
    const names = new Set(columns.map((column) => column.name));
    for (const column of expected) {
      (names.has(column) ? found : missing).push(`${table}.${column}`);
    }
  }
  if (missing.length === 0) return;

  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS count FROM "KycCase"`,
  );
  const partial = found.length > 0;

  console.error(
    `${url} holds ${count} case(s) and is ${partial ? "part way through" : "on the schema from before"} the policy revision.\n` +
      `Missing: ${missing.join(", ")}.\n` +
      (partial ? "An earlier upgrade did not finish. Running it again is safe.\n" : "") +
      "\nSetup would ask to drop this database. Keep the data and upgrade in place instead:\n\n" +
      "  npm run upgrade && npm run db:push\n\n" +
      "The upgrade adds those columns and fills them in: case references, record versions and\n" +
      "the approval reservation keys. It stops before writing anything if a proposal that is\n" +
      "still open could not be decided afterwards, and tells you how to release it.\n\n" +
      "Or, if this database is disposable, recreate it explicitly:\n\n" +
      "  npx prisma db push --force-reset && npm run db:seed\n",
  );
  process.exitCode = 1;
}

main().finally(() => db.$disconnect());
