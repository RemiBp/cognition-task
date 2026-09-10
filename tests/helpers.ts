import { db } from "@/platform/db";
import type { Actor } from "@/platform/rbac";

export const actors = {
  viewer: { id: "viewer", email: "viewer@test.dev", name: "Viewer", role: "viewer" },
  analyst: { id: "analyst", email: "analyst@test.dev", name: "Analyst", role: "analyst" },
  analyst2: { id: "analyst2", email: "analyst2@test.dev", name: "Analyst Two", role: "analyst" },
  approver: { id: "approver", email: "approver@test.dev", name: "Approver", role: "approver" },
  admin: { id: "admin", email: "admin@test.dev", name: "Admin", role: "admin" },
} satisfies Record<string, Actor>;

/** Truncates the isolated test database only; never a development database. */
export async function reset() {
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
