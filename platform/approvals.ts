import { randomUUID } from "crypto";
import { db } from "./db";
import { execute, getAction, writeAudit } from "./actions";
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
  requireCan(actor, "approval.decide");

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
