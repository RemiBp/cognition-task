import { registerAction } from "@/platform/actions";
import { db } from "@/platform/db";
import { z } from "zod";

const money = (cents: number, currency: string) =>
  `${(cents / 100).toFixed(2)} ${currency}`;

export const approveRefund = registerAction<{ refundId: string }>({
  key: "refund.approve",
  resource: "refund",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({ refundId: z.string().min(1) }),
  resourceId: ({ refundId }) => refundId,
  requiresApproval: true,
  describe: ({ refundId }) => `Approve refund …${refundId.slice(-6)}`,
  before: ({ refundId }) => db.refund.findUnique({ where: { id: refundId } }),
  apply: async ({ refundId }, ctx) => {
    const refund = await db.refund.findUniqueOrThrow({ where: { id: refundId } });
    const updated = await db.refund.update({
      where: { id: refundId },
      data: {
        status: "approved",
        // Stands in for the payment processor call. In production this is the
        // integration a Power Apps connector would have covered.
        processorRef: `psp_${refund.orderId.toLowerCase()}_${money(
          refund.amountCents,
          refund.currency,
        ).replace(/[^a-z0-9]/gi, "")}`,
      },
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const rejectRefund = registerAction<{ refundId: string }>({
  key: "refund.reject",
  resource: "refund",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({ refundId: z.string().min(1) }),
  resourceId: ({ refundId }) => refundId,
  describe: ({ refundId }) => `Reject refund …${refundId.slice(-6)}`,
  before: ({ refundId }) => db.refund.findUnique({ where: { id: refundId } }),
  apply: async ({ refundId }, ctx) => {
    const updated = await db.refund.update({
      where: { id: refundId },
      data: { status: "rejected" },
    });
    ctx.snapshot(updated);
    return updated;
  },
});
