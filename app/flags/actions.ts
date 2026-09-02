import { registerAction } from "@/platform/actions";
import { db } from "@/platform/db";
import { z } from "zod";

/**
 * Deliberately a different policy shape from KYC and refunds: admin-only, no
 * maker-checker. The point of a platform is that each app declares its own
 * risk posture and still inherits the same audit trail.
 */
export const toggleFlag = registerAction<{ flagId: string; enabled: boolean }>({
  key: "feature_flag.toggle",
  resource: "feature_flag",
  roles: ["admin"],
  schema: z.object({ flagId: z.string().min(1), enabled: z.boolean() }),
  resourceId: ({ flagId }) => flagId,
  describe: ({ flagId, enabled }) =>
    `${enabled ? "Enable" : "Disable"} flag …${flagId.slice(-6)}`,
  before: ({ flagId }) => db.featureFlag.findUnique({ where: { id: flagId } }),
  apply: async ({ flagId, enabled }, ctx) => {
    const updated = await db.featureFlag.update({
      where: { id: flagId },
      data: { enabled, rolloutPercent: enabled ? 100 : 0 },
    });
    ctx.snapshot(updated);
    return updated;
  },
});
