import { registerAction } from "@/platform/actions";
import type { DbClient } from "@/platform/db";
import { ConflictError } from "@/platform/rbac";
import { z } from "zod";

const money = (cents: number, currency: string) =>
  `${(cents / 100).toFixed(2)} ${currency}`;

type RefundPayload = { refundId: string; expectedVersion: number };

const schema = z.object({
  refundId: z.string().min(1),
  expectedVersion: z.number().int().nonnegative(),
});

async function refundSubject(refundId: string, client: DbClient) {
  const record = await client.refund.findUnique({
    where: { id: refundId },
    select: { orderId: true, customerName: true, amountCents: true, currency: true },
  });
  return record
    ? `${record.orderId} · ${record.customerName} · ${money(record.amountCents, record.currency)}`
    : undefined;
}

async function updateRefund(
  client: DbClient,
  refundId: string,
  expectedVersion: number,
  data: { status: string; processorRef?: string },
) {
  const changed = await client.refund.updateMany({
    where: { id: refundId, version: expectedVersion },
    data: { ...data, version: expectedVersion + 1 },
  });
  if (changed.count !== 1) {
    throw new ConflictError(
      "This refund changed since the page was loaded. Reload and review the current state.",
    );
  }
  return client.refund.findUniqueOrThrow({ where: { id: refundId } });
}

export const approveRefund = registerAction<RefundPayload>({
  key: "refund.approve",
  resource: "refund",
  roles: ["analyst", "approver", "admin"],
  schema,
  resourceId: ({ refundId }) => refundId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  requiresApproval: true,
  describe: () => "Approve refund",
  subject: ({ refundId }, client) => refundSubject(refundId, client),
  before: ({ refundId }, client) => client.refund.findUnique({ where: { id: refundId } }),
  apply: async ({ refundId, expectedVersion }, ctx) => {
    const refund = await ctx.tx.refund.findUniqueOrThrow({ where: { id: refundId } });
    const updated = await updateRefund(ctx.tx, refundId, expectedVersion, {
      status: "approved",
      // Stands in for the payment processor call. The transaction guarantees
      // the local records agree; it says nothing about the money leaving.
      processorRef: `psp_${refund.orderId.toLowerCase()}_${money(
        refund.amountCents,
        refund.currency,
      ).replace(/[^a-z0-9]/gi, "")}`,
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const rejectRefund = registerAction<RefundPayload>({
  key: "refund.reject",
  resource: "refund",
  roles: ["analyst", "approver", "admin"],
  schema,
  resourceId: ({ refundId }) => refundId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  describe: () => "Reject refund",
  subject: ({ refundId }, client) => refundSubject(refundId, client),
  before: ({ refundId }, client) => client.refund.findUnique({ where: { id: refundId } }),
  apply: async ({ refundId, expectedVersion }, ctx) => {
    const updated = await updateRefund(ctx.tx, refundId, expectedVersion, {
      status: "rejected",
    });
    ctx.snapshot(updated);
    return updated;
  },
});
