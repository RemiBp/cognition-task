import { randomUUID } from "crypto";
import { db, type DbClient } from "./db";
import { execute, getAction, writeAudit } from "./actions";
import { loadPolicyState } from "./policy";
import { ConflictError, PolicyError, requireCan, type Actor } from "./rbac";

export async function pendingApprovals() {
  return db.approvalRequest.findMany({
    where: { status: "pending" },
    include: { requestedBy: true },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
  });
}

export async function decidedApprovals(take = 20) {
  return db.approvalRequest.findMany({
    where: { status: { not: "pending" } },
    include: { requestedBy: true, decidedBy: true },
    orderBy: [{ decidedAt: "desc" }, { id: "asc" }],
    take,
  });
}

/** The proposal currently holding the reservation on a record, if any. */
export async function activeProposalFor(resource: string, resourceId: string) {
  return db.approvalRequest.findFirst({
    where: { resource, resourceId, activeKey: "active" },
    include: { requestedBy: true },
  });
}

export async function activeProposalsFor(resource: string, resourceIds: string[]) {
  const rows = await db.approvalRequest.findMany({
    where: { resource, resourceId: { in: resourceIds }, activeKey: "active" },
    include: { requestedBy: true },
  });
  return new Map(rows.map((row) => [row.resourceId, row]));
}

export type DecisionEligibility = {
  /** Version of the record the proposal was composed against. */
  targetVersion: number;
  /** Version the record is at now, or null if it is gone. */
  currentVersion: number | null;
  mayApprove: boolean;
  /** Why approval is unavailable, in the words the queue shows. */
  reason?: string;
};

/**
 * One answer for the queue and for `decide()`, so a control that is rendered
 * disabled and a request that arrives anyway are refused for the same reason.
 *
 * Rejecting stays available whatever the versions are: a proposal written
 * against an older state is exactly the one a reviewer should be able to
 * clear, and rejecting changes no record.
 */
export async function decisionEligibility(
  request: { resource: string; resourceId: string; targetVersion: number },
  client: DbClient = db,
): Promise<DecisionEligibility> {
  const state = await loadPolicyState(request.resource, request.resourceId, client);
  const currentVersion = state.record?.version ?? null;
  if (currentVersion === null) {
    return {
      targetVersion: request.targetVersion,
      currentVersion,
      mayApprove: false,
      reason: "The record this proposal targets no longer exists.",
    };
  }
  if (currentVersion !== request.targetVersion) {
    return {
      targetVersion: request.targetVersion,
      currentVersion,
      mayApprove: false,
      reason: `Written against version ${request.targetVersion}, the record is now at version ${currentVersion}. Reject it and let the proposer review the current state.`,
    };
  }
  return { targetVersion: request.targetVersion, currentVersion, mayApprove: true };
}

/**
 * Maker-checker: the decider must hold `approval.decide` and must not be the
 * person who proposed the change, whatever their role. Self-approval is the
 * failure mode auditors look for first, so it is enforced here rather than in
 * each app.
 *
 * The claim, the domain change and the audit entries commit together. An
 * approval that races another approval loses the compare-and-set and produces
 * no second effect.
 */
export async function decide(
  approvalId: string,
  decision: "approved" | "rejected",
  actor: Actor,
  note?: string,
) {
  try {
    requireCan(actor, "approval.decide");
  } catch (error) {
    // A refused decision is the attempt worth reading later, so it is recorded
    // before the refusal is returned. Nothing about the proposal is looked up
    // or written here: someone without the permission learns only that their
    // own call was refused, and the entry holds only what they sent.
    await writeAudit({
      actor,
      action: "approval.decide",
      resource: "approval",
      resourceId: approvalId,
      outcome: "denied",
      reason: `${decision} attempted without approval.decide`,
      requestId: randomUUID(),
    });
    throw error;
  }

  const request = await db.approvalRequest.findUnique({ where: { id: approvalId } });
  if (!request) throw new ConflictError("Approval request not found.");
  if (request.status !== "pending") {
    throw new ConflictError("This proposal has already been decided.");
  }

  if (request.requestedById === actor.id) {
    await writeAudit({
      actor,
      action: request.action,
      resource: request.resource,
      resourceId: request.resourceId,
      outcome: "denied",
      reason: "self-approval refused",
      requestId: randomUUID(),
    });
    throw new PolicyError(
      "You proposed this change, so you cannot decide it. Maker-checker requires a second person.",
    );
  }

  getAction(request.action); // fail loudly if an app was removed

  if (decision === "approved") {
    // The same answer the queue used to disable the button, so a forged
    // approval of a stale proposal is refused with the reason the reviewer
    // would have read, rather than a bare version conflict from the apply.
    const eligibility = await decisionEligibility(request);
    if (!eligibility.mayApprove) {
      await writeAudit({
        actor,
        action: request.action,
        resource: request.resource,
        resourceId: request.resourceId,
        outcome: "denied",
        reason: "approval of a stale proposal refused",
        requestId: randomUUID(),
      });
      throw new ConflictError(eligibility.reason ?? "This proposal can no longer be approved.");
    }
  }

  try {
    await db.$transaction(async (client) => {

      // Compare-and-set the pending state, and release the reservation in the
      // same statement: `activeKey` moves off "active" so the record accepts a
      // new proposal once this one is rejected.
      const claimed = await client.approvalRequest.updateMany({
        where: { id: approvalId, status: "pending" },
        data: {
          status: decision,
          activeKey: approvalId,
          decidedById: actor.id,
          decidedAt: new Date(),
          decisionNote: note,
        },
      });
      if (claimed.count !== 1) {
        throw new ConflictError("This proposal has already been decided.");
      }

      await writeAudit(
        {
          actor,
          action: request.action,
          resource: request.resource,
          resourceId: request.resourceId,
          outcome: decision,
          reason: note ?? `${decision} proposal from ${request.requestedById}`,
          requestId: randomUUID(),
        },
        client,
      );

      if (decision === "approved") {
        await execute(request.action, JSON.parse(request.payload), actor, {
          resourceId: request.resourceId,
          reason: request.reason ?? undefined,
          approvedBy: { requestId: approvalId, deciderId: actor.id },
          tx: client,
        });
      }
    });
  } catch (error) {
    // The transaction has rolled back by now, so this refusal is written on the
    // root client and survives it.
    await writeAudit({
      actor,
      action: request.action,
      resource: request.resource,
      resourceId: request.resourceId,
      outcome: "denied",
      reason: error instanceof Error ? error.message : "decision failed",
      requestId: randomUUID(),
    });
    throw error;
  }
}
