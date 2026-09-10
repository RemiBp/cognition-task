/**
 * Runs the walkthrough on the demo case through the real action path: Sam
 * escalates, Priya records reasoning and proposes approval, Alex approves as a
 * different person. Nothing here bypasses policy, approvals or audit.
 *
 *   npm run demo:journey
 *
 * It refuses to touch anything but an isolated demo database, so a populated
 * development or production database is never advanced by running it.
 */
import "@/platform/registry";
import { execute } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { db } from "@/platform/db";
import { DEMO_CASE_ID } from "@/platform/demo";
import { PEOPLE, demoCase } from "@/prisma/fixtures";

const url = process.env.DATABASE_URL ?? "";
if (!/demo\.db/.test(url)) {
  console.error(
    `Refusing to run: DATABASE_URL is ${url || "unset"}.\n` +
      'Run it against an isolated demo database, for example:\n' +
      '  DATABASE_URL="file:./demo.db" npm run demo:journey',
  );
  process.exit(1);
}

async function main() {
  for (const person of Object.values(PEOPLE)) {
    await db.user.upsert({ where: { id: person.id }, create: person, update: {} });
  }
  await db.kycCase.upsert({
    where: { id: DEMO_CASE_ID },
    create: demoCase(),
    update: {},
  });

  await execute(
    "kyc_case.escalate",
    {
      caseId: DEMO_CASE_ID,
      expectedVersion: 0,
      reasoning:
        "Adverse media hit looks like a name collision, but the risk score is 76. Escalating for senior review rather than clearing it myself.",
    },
    PEOPLE.sam,
  );

  await execute(
    "kyc_case.decide",
    {
      caseId: DEMO_CASE_ID,
      expectedVersion: 1,
      decision: "approved",
      reasoning:
        "The 2019 article gives no date of birth, so it cannot be matched on that. It names a different nationality from the one declared, sanctions and PEP screening are clean, and no other article repeats the allegation. On that balance I read it as a different person and propose approval.",
      intentKey: "demo-journey-priya-proposal",
    },
    PEOPLE.priya,
  );

  const proposal = await db.approvalRequest.findFirstOrThrow({
    where: { resource: "kyc_case", resourceId: DEMO_CASE_ID, status: "pending" },
  });
  await decide(proposal.id, "approved", PEOPLE.alex, "Reviewed the collision check independently.");

  const settled = await db.kycCase.findUniqueOrThrow({ where: { id: DEMO_CASE_ID } });
  console.log(
    `${settled.reference} · ${settled.customerName} → ${settled.status} (version ${settled.version})`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
