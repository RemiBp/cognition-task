/**
 * Decides an approval against whatever database DATABASE_URL names, in a
 * child process. The upgrade tests use it to prove that a proposal which was
 * pending before the revision is still decidable through the application after
 * it, which cannot be checked from the test process: that one is already
 * connected to its own throwaway database.
 *
 *   DATABASE_URL=file:/path/to.db npx tsx tests/decide-out-of-process.ts <approvalId> <actorId>
 */
import "@/platform/registry";
import { decide } from "@/platform/approvals";
import { db } from "@/platform/db";

const [approvalId, actorId] = process.argv.slice(2);

async function main() {
  const actor = await db.user.findUniqueOrThrow({ where: { id: actorId } });
  await decide(approvalId, "approved", {
    id: actor.id,
    email: actor.email,
    name: actor.name,
    role: actor.role as "viewer" | "analyst" | "approver" | "admin",
  });
  console.log("decided");
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
