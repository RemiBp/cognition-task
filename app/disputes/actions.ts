import { registerAction } from "@/platform/actions";
import { db } from "@/platform/db";
import { z } from "zod";

export const refundDispute = registerAction<{ disputeId: string }>({
  key: "dispute.refund",
  resource: "dispute",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({ disputeId: z.string().min(1) }),
  resourceId: ({ disputeId }) => disputeId,
  requiresApproval: true,
  describe: ({ disputeId }) => `Refund dispute …${disputeId.slice(-6)}`,
  before: ({ disputeId }) => db.dispute.findUnique({ where: { id: disputeId } }),
  apply: async ({ disputeId }, ctx) => {
    const dispute = await db.dispute.findUniqueOrThrow({ where: { id: disputeId } });
    const updated = await db.dispute.update({
      where: { id: disputeId },
      data: {
        status: "refunded",
        // Stands in for the processor call a Power Apps connector would cover.
        processorRef: `psp_${dispute.reference.toLowerCase()}`,
      },
    });
    ctx.snapshot(updated);
    return updated;
  },
});

export const closeDispute = registerAction<{ disputeId: string }>({
  key: "dispute.close",
  resource: "dispute",
  roles: ["admin"],
  schema: z.object({ disputeId: z.string().min(1) }),
  resourceId: ({ disputeId }) => disputeId,
  describe: ({ disputeId }) => `Close dispute …${disputeId.slice(-6)}`,
  before: ({ disputeId }) => db.dispute.findUnique({ where: { id: disputeId } }),
  apply: async ({ disputeId }, ctx) => {
    const updated = await db.dispute.update({
      where: { id: disputeId },
      data: { status: "closed" },
    });
    ctx.snapshot(updated);
    return updated;
  },
});
