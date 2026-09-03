import { registerAction } from "@/platform/actions";
import { db } from "@/platform/db";
import { z } from "zod";

type DecidePayload = { caseId: string; decision: "approved" | "rejected" };

export const decideKycCase = registerAction<DecidePayload>({
  key: "kyc_case.decide",
  resource: "kyc_case",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({ caseId: z.string().min(1), decision: z.enum(["approved", "rejected"]) }),
  resourceId: ({ caseId }) => caseId,
  requiresApproval: true,
  describe: ({ caseId, decision }) => `Mark KYC case …${caseId.slice(-6)} as ${decision}`,
  before: ({ caseId }) => db.kycCase.findUnique({ where: { id: caseId } }),
  apply: async ({ caseId, decision }, ctx) => {
    const updated = await db.kycCase.update({
      where: { id: caseId },
      data: { status: decision },
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const escalateKycCase = registerAction<{ caseId: string }>({
  key: "kyc_case.escalate",
  resource: "kyc_case",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({ caseId: z.string().min(1) }),
  resourceId: ({ caseId }) => caseId,
  describe: ({ caseId }) => `Escalate KYC case …${caseId.slice(-6)}`,
  before: ({ caseId }) => db.kycCase.findUnique({ where: { id: caseId } }),
  apply: async ({ caseId }, ctx) => {
    const updated = await db.kycCase.update({
      where: { id: caseId },
      data: { status: "escalated" },
    });
    ctx.snapshot(updated);
    return updated;
  },
});
