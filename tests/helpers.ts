import { db } from "@/platform/db";
import type { Actor } from "@/platform/rbac";

export const actors = {
  viewer: { id: "viewer", email: "viewer@test.dev", name: "Viewer", role: "viewer" },
  analyst: { id: "analyst", email: "analyst@test.dev", name: "Analyst", role: "analyst" },
  analyst2: { id: "analyst2", email: "analyst2@test.dev", name: "Analyst Two", role: "analyst" },
  approver: { id: "approver", email: "approver@test.dev", name: "Approver", role: "approver" },
  admin: { id: "admin", email: "admin@test.dev", name: "Admin", role: "admin" },
} satisfies Record<string, Actor>;

/**
 * The throwaway databases these tests are allowed to empty. Running one test
 * file by hand, without the `test` script that sets DATABASE_URL, would
 * otherwise truncate whatever database the environment happens to point at,
 * `dev.db` included.
 */
const DISPOSABLE = [/^file:\.\/test\.db$/, /^file:.*[/\\]test\.db$/];

/** Truncates the isolated test database only; never a development database. */
export async function reset() {
  const url = process.env.DATABASE_URL ?? "";
  if (!DISPOSABLE.some((pattern) => pattern.test(url))) {
    throw new Error(
      `Refusing to empty ${url || "an unset DATABASE_URL"}. The tests only run against the ` +
        'throwaway test.db: use `npm test`, or DATABASE_URL="file:./test.db".',
    );
  }
  await db.auditLog.deleteMany();
  await db.approvalRequest.deleteMany();
  await db.kycCase.deleteMany();
  await db.refund.deleteMany();
  await db.dispute.deleteMany();
  await db.featureFlag.deleteMany();
  await db.user.deleteMany();
  await db.user.createMany({ data: Object.values(actors) });
}

export function seedCase(overrides: Record<string, unknown> = {}) {
  return db.kycCase.create({
    data: {
      id: "kyc-1",
      reference: "KYC-TEST-001",
      customerName: "Test Customer",
      country: "FR",
      riskScore: 80,
      documentType: "passport",
      evidenceSummary: "Synthetic test file. No document is stored.",
      ...overrides,
    },
  });
}
