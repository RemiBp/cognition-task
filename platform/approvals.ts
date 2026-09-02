import { randomUUID } from "crypto";
import { db } from "./db";
import { execute, getAction, writeAudit } from "./actions";
import { PolicyError, requireCan, type Actor } from "./rbac";

export async function pendingApprovals() {
  return db.approvalRequest.findMany({
    where: { status: "pending" },
    include: { requestedBy: true },
    orderBy: { createdAt: "desc" },
  });
}

export async function decidedApprovals(take = 20) {
  return db.approvalRequest.findMany({
    where: { status: { not: "pending" } },
    include: { requestedBy: true, decidedBy: true },
    orderBy: { decidedAt: "desc" },
    take,
  });
}

/**
 * Maker-checker: the decider must hold `approval.decide` and must not be the
 * person who proposed the change. Self-approval is the failure mode auditors
 * look for first, so it is enforced here rather than in each app.
 */
export async function decide(
  approvalId: string,
  decision: "approved" | "rejected",
  actor: Actor,
  note?: string,
) {
  requireCan(actor, "approval.decide");

  const request = await db.approvalRequest.findUnique({ where: { id: approvalId } });
  if (!request) throw new Error("Approval request not found");
  if (request.status !== "pending") throw new Error("Approval request already decided");

  if (request.requestedById === actor.id) {
    await writeAudit({
      actor,
      action: request.action,
      resource: request.resource,
      resourceId: request.resourceId ?? undefined,
      outcome: "denied",
      reason: "self-approval refused",
      requestId: randomUUID(),
    });
    throw new PolicyError(
      "You proposed this change, so you cannot approve it. Maker-checker requires a second person.",
    );
  }

  await db.approvalRequest.update({
    where: { id: approvalId },
    data: {
      status: decision,
      decidedById: actor.id,
      decidedAt: new Date(),
      decisionNote: note,
    },
  });

  await writeAudit({
    actor,
    action: request.action,
    resource: request.resource,
    resourceId: request.resourceId ?? undefined,
    outcome: decision,
    reason: note ?? `${decision} proposal from ${request.requestedById}`,
    requestId: randomUUID(),
  });

  if (decision === "approved") {
    getAction(request.action); // fail loudly if an app was removed
    await execute(request.action, JSON.parse(request.payload), actor, {
      resourceId: request.resourceId ?? undefined,
      reason: `approval ${approvalId}`,
      approvedBy: { requestId: approvalId, deciderId: actor.id },
    });
  }
}
