/**
 * Runs before `npm run setup`. A database created before the policy revision
 * cannot take the new required columns, and `prisma db push` answers that with
 * an offer to drop it. Stop first and point at the upgrade instead, so nobody
 * reaches for --force-reset on data they wanted to keep.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!url.startsWith("file:")) process.exit(0);

const db = new PrismaClient();

type Column = { name: string };

async function main() {
  const tables = await db.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'KycCase'`,
  );
  if (tables.length === 0) return;

  const columns = await db.$queryRawUnsafe<Column[]>(`PRAGMA table_info("KycCase")`);
  if (columns.some((column) => column.name === "reference")) return;

  const [{ count }] = await db.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*) AS count FROM "KycCase"`,
  );

  console.error(
    `${url} holds ${count} case(s) on the schema from before the policy revision.\n` +
      "Setup would ask to drop it. Keep the data and upgrade in place instead:\n\n" +
      "  npm run upgrade && npm run db:push\n\n" +
      "Or, if this database is disposable, recreate it explicitly:\n\n" +
      "  npx prisma db push --force-reset && npm run db:seed\n",
  );
  process.exitCode = 1;
}

main().finally(() => db.$disconnect());
