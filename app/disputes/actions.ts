import { INTENT_KEY, registerAction } from "@/platform/actions";
import type { DbClient } from "@/platform/db";
import { ConflictError } from "@/platform/rbac";
import { z } from "zod";

type DisputePayload = { disputeId: string; expectedVersion: number };
/** Approvals also carry the submit intent, so a retry cannot become a second proposal. */
type DisputeApprovalPayload = DisputePayload & { intentKey: string };

const schema = z.object({
  disputeId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

const approvalSchema = schema.extend({ intentKey: INTENT_KEY });

async function disputeSubject(disputeId: string, client: DbClient) {
  const record = await client.dispute.findUnique({
    where: { id: disputeId },
    select: { reference: true, customerName: true, amountCents: true, currency: true },
  });
  return record
    ? `${record.reference} · ${record.customerName} · ${(record.amountCents / 100).toFixed(2)} ${record.currency}`
    : undefined;
}

async function updateDispute(
  client: DbClient,
  disputeId: string,
  expectedVersion: number,
  data: { status: string; processorRef?: string },
) {
  const changed = await client.dispute.updateMany({
    where: { id: disputeId, version: expectedVersion },
    data: { ...data, version: expectedVersion + 1 },
  });
  if (changed.count !== 1) {
    throw new ConflictError(
      "This dispute changed since the page was loaded. Reload and review the current state.",
    );
  }
  return client.dispute.findUniqueOrThrow({ where: { id: disputeId } });
}

export const refundDispute = registerAction<DisputeApprovalPayload>({
  key: "dispute.refund",
  resource: "dispute",
  roles: ["analyst", "approver", "admin"],
  schema: approvalSchema,
  resourceId: ({ disputeId }) => disputeId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  intentKey: ({ intentKey }) => intentKey,
  requiresApproval: true,
  describe: () => "Refund dispute",
  subject: ({ disputeId }, client) => disputeSubject(disputeId, client),
  before: ({ disputeId }, client) => client.dispute.findUnique({ where: { id: disputeId } }),
  apply: async ({ disputeId, expectedVersion }, ctx) => {
    const dispute = await ctx.tx.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    const updated = await updateDispute(ctx.tx, disputeId, expectedVersion, {
      status: "refunded",
      // Simulated processor reference; no money moves in this prototype.
      processorRef: `psp_${dispute.reference.toLowerCase()}`,
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const closeDispute = registerAction<DisputePayload>({
  key: "dispute.close",
  resource: "dispute",
  roles: ["admin"],
  schema,
  resourceId: ({ disputeId }) => disputeId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  describe: () => "Close dispute without refunding",
  subject: ({ disputeId }, client) => disputeSubject(disputeId, client),
  before: ({ disputeId }, client) => client.dispute.findUnique({ where: { id: disputeId } }),
  apply: async ({ disputeId, expectedVersion }, ctx) => {
    const updated = await updateDispute(ctx.tx, disputeId, expectedVersion, {
      status: "closed",
    });
    ctx.snapshot(updated);
    return updated;
  },
});
