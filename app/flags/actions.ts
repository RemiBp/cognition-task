import { registerAction } from "@/platform/actions";
import { ConflictError } from "@/platform/rbac";
import { z } from "zod";

/**
 * Deliberately a different policy shape from KYC and refunds: admin-only, no
 * maker-checker. The point of a platform is that each app declares its own
 * risk posture and still inherits the same audit trail.
 */
export const toggleFlag = registerAction<{
  flagId: string;
  expectedVersion: number;
  enabled: boolean;
}>({
  key: "feature_flag.toggle",
  resource: "feature_flag",
  roles: ["admin"],
  schema: z.object({
    flagId: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
    enabled: z.boolean(),
  }),
  resourceId: ({ flagId }) => flagId,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  describe: ({ enabled }) => `${enabled ? "Enable" : "Disable"} flag`,
  subject: async ({ flagId }, client) => {
    const flag = await client.featureFlag.findUnique({
      where: { id: flagId },
      select: { key: true, environment: true },
    });
    return flag ? `${flag.key} · ${flag.environment}` : undefined;
  },
  before: ({ flagId }, client) => client.featureFlag.findUnique({ where: { id: flagId } }),
  apply: async ({ flagId, expectedVersion, enabled }, ctx) => {
    // The compare-and-set also covers a toggle that lands on the value the
    // record already holds: the version still has to match.
    const changed = await ctx.tx.featureFlag.updateMany({
      where: { id: flagId, version: expectedVersion },
      data: { enabled, rolloutPercent: enabled ? 100 : 0, version: expectedVersion + 1 },
    });
    if (changed.count !== 1) {
      throw new ConflictError(
        "This flag changed since the page was loaded. Reload and review the current state.",
      );
    }
    const updated = await ctx.tx.featureFlag.findUniqueOrThrow({ where: { id: flagId } });
    ctx.snapshot(updated);
    return updated;
  },
});
