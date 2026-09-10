import { INTENT_KEY, registerAction } from "@/platform/actions";
import { db, type DbClient } from "@/platform/db";
import { ConflictError } from "@/platform/rbac";
import { z } from "zod";

const reasoning = z.string().trim().min(1, "A written reason is required").max(1000);

type DecidePayload = {
  caseId: string;
  expectedVersion: number;
  decision: "approved" | "rejected";
  reasoning: string;
  /** One submit intent; every retry of it carries the same value. */
  intentKey: string;
};

async function caseSubject(caseId: string, client: DbClient) {
  const record = await client.kycCase.findUnique({
    where: { id: caseId },
    select: { reference: true, customerName: true },
  });
  return record ? `${record.reference} · ${record.customerName}` : undefined;
}

/**
 * Compare-and-set on `version`. A tab that loaded the case before someone else
 * acted on it carries the old version and is refused rather than applied.
 */
async function updateCase(
  client: DbClient,
  caseId: string,
  expectedVersion: number,
  data: { status?: string; reasoning: string },
) {
  const changed = await client.kycCase.updateMany({
    where: { id: caseId, version: expectedVersion },
    data: { ...data, version: expectedVersion + 1 },
  });
  if (changed.count !== 1) {
    throw new ConflictError(
      "This case changed since the page was loaded. Reload and review the current state.",
    );
  }
  return client.kycCase.findUniqueOrThrow({ where: { id: caseId } });
}

export const decideKycCase = registerAction<DecidePayload>({
  key: "kyc_case.decide",
  resource: "kyc_case",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({
    caseId: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
    decision: z.enum(["approved", "rejected"]),
    reasoning,
    intentKey: INTENT_KEY,
  }),
  resourceId: ({ caseId }) => caseId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  intentKey: ({ intentKey }) => intentKey,
  requiresApproval: true,
  describe: ({ decision }) => `Mark KYC case as ${decision}`,
  subject: ({ caseId }, client) => caseSubject(caseId, client),
  before: ({ caseId }, client) => client.kycCase.findUnique({ where: { id: caseId } }),
  apply: async ({ caseId, decision, expectedVersion, reasoning: note }, ctx) => {
    const updated = await updateCase(ctx.tx, caseId, expectedVersion, {
      status: decision,
      reasoning: note,
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const escalateKycCase = registerAction<{
  caseId: string;
  expectedVersion: number;
  reasoning: string;
}>({
  key: "kyc_case.escalate",
  resource: "kyc_case",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({
    caseId: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
    reasoning,
  }),
  resourceId: ({ caseId }) => caseId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  describe: () => "Escalate KYC case for senior review",
  subject: ({ caseId }, client) => caseSubject(caseId, client),
  before: ({ caseId }, client) => client.kycCase.findUnique({ where: { id: caseId } }),
  apply: async ({ caseId, expectedVersion, reasoning: note }, ctx) => {
    const updated = await updateCase(ctx.tx, caseId, expectedVersion, {
      status: "escalated",
      reasoning: note,
    });
    ctx.snapshot(updated);
    return updated;
  },
});

/** Used by the detail page to show what a reviewer is deciding on. */
export function kycCaseByIdentifier(identifier: string) {
  return db.kycCase.findFirst({
    where: { OR: [{ id: identifier }, { reference: identifier }] },
  });
}
