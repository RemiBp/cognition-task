import { randomUUID } from "crypto";
import { z } from "zod";
import { db } from "./db";
import { PolicyError, type Actor, type Role } from "./rbac";

/**
 * The single chokepoint through which every mutation in every app passes.
 *
 * This is the part of Power Apps / Dataverse that is expensive to give up and
 * cheap to forget when building in-house: an app author cannot write to the
 * database without a policy check, an audit record, and — where declared —
 * maker-checker approval, because there is no other way to write.
 */

export type ActionContext = {
  actor: Actor;
  /** JSON snapshot of the record before the change, for the audit trail. */
  snapshot: (value: unknown) => void;
};

export type ActionDefinition<P> = {
  /** Stable key, `<resource>.<verb>`. Also the audit `action` value. */
  key: string;
  resource: string;
  /** Roles allowed to invoke the action at all. */
  roles: readonly Role[];
  /** Runtime validation for payloads arriving across the client boundary. */
  schema: z.ZodType<P>;
  /** Canonical resource id used for policy, approval and audit records. */
  resourceId?: (payload: P) => string;
  /**
   * When true the action never applies directly: it becomes a proposal that a
   * different user holding `approval.decide` must approve.
   */
  requiresApproval?: boolean;
  /** One-line human description shown in the approvals queue. */
  describe: (payload: P) => string;
  /** Optional current-state snapshot, recorded as the audit `before`. */
  before?: (payload: P) => Promise<unknown>;
  apply: (payload: P, ctx: ActionContext) => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ActionDefinition<any>>();

export function registerAction<P>(definition: ActionDefinition<P>): ActionDefinition<P> {
  registry.set(definition.key, definition);
  return definition;
}

export function getAction(key: string) {
  const action = registry.get(key);
  if (!action) throw new Error(`Unknown action: ${key}`);
  return action;
}

export type ExecuteResult =
  | { status: "executed" }
  | { status: "proposed"; approvalId: string };

type ExecuteOptions = {
  reason?: string;
  resourceId?: string;
  /** Set only by the approvals flow, after a second person has decided. */
  approvedBy?: { requestId: string; deciderId: string };
};

export async function execute(
  actionKey: string,
  payload: unknown,
  actor: Actor,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const action = getAction(actionKey);
  const requestId = randomUUID();

  if (!action.roles.includes(actor.role)) {
    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId: options.resourceId,
      outcome: "denied",
      reason: options.reason,
      requestId,
    });
    throw new PolicyError(
      "You do not have permission to perform this action. The attempt was blocked and logged.",
    );
  }

  const parsed = action.schema.safeParse(payload);
  if (!parsed.success) {
    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId: options.resourceId,
      outcome: "denied",
      reason: "invalid action payload",
      requestId,
    });
    throw new PolicyError("The request was invalid. The attempt was blocked and logged.");
  }

  const validPayload = parsed.data;
  const canonicalResourceId = action.resourceId?.(validPayload) ?? options.resourceId;

  if (
    options.resourceId &&
    canonicalResourceId &&
    options.resourceId !== canonicalResourceId
  ) {
    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId: canonicalResourceId,
      outcome: "denied",
      reason: "resource id mismatch",
      requestId,
    });
    throw new PolicyError("The request was invalid. The attempt was blocked and logged.");
  }

  if (action.requiresApproval && !options.approvedBy) {
    const existing = await db.approvalRequest.findFirst({
      where: {
        action: actionKey,
        resource: action.resource,
        resourceId: canonicalResourceId ?? null,
        status: "pending",
      },
    });

    if (existing) {
      return { status: "proposed", approvalId: existing.id };
    }

    const approval = await db.approvalRequest.create({
      data: {
        action: actionKey,
        resource: action.resource,
        resourceId: canonicalResourceId,
        payload: JSON.stringify(validPayload),
        summary: action.describe(validPayload),
        reason: options.reason,
        requestedById: actor.id,
      },
    });

    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId: canonicalResourceId,
      outcome: "proposed",
      reason: options.reason,
      requestId,
    });

    return { status: "proposed", approvalId: approval.id };
  }

  const before = action.before ? await action.before(validPayload) : undefined;
  let after: unknown;
  const result = await action.apply(validPayload, {
    actor,
    snapshot: (value) => {
      after = value;
    },
  });

  await writeAudit({
    actor,
    action: actionKey,
    resource: action.resource,
    resourceId: canonicalResourceId,
    outcome: "executed",
    before,
    after: after ?? result,
    reason: options.reason,
    requestId,
  });

  return { status: "executed" };
}

export async function writeAudit(entry: {
  actor: Actor;
  action: string;
  resource: string;
  resourceId?: string;
  outcome: "executed" | "proposed" | "denied" | "approved" | "rejected";
  before?: unknown;
  after?: unknown;
  reason?: string;
  requestId: string;
}) {
  await db.auditLog.create({
    data: {
      actorId: entry.actor.id,
      actorEmail: entry.actor.email,
      actorRole: entry.actor.role,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      outcome: entry.outcome,
      before: entry.before === undefined ? null : JSON.stringify(entry.before),
      after: entry.after === undefined ? null : JSON.stringify(entry.after),
      reason: entry.reason,
      requestId: entry.requestId,
    },
  });
}
