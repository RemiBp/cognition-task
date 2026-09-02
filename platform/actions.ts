import { randomUUID } from "crypto";
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

export async function execute<P>(
  actionKey: string,
  payload: P,
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
      `${actor.email} (${actor.role}) is not permitted to ${actionKey}`,
    );
  }

  if (action.requiresApproval && !options.approvedBy) {
    const approval = await db.approvalRequest.create({
      data: {
        action: actionKey,
        resource: action.resource,
        resourceId: options.resourceId,
        payload: JSON.stringify(payload),
        summary: action.describe(payload),
        reason: options.reason,
        requestedById: actor.id,
      },
    });

    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId: options.resourceId,
      outcome: "proposed",
      reason: options.reason,
      requestId,
    });

    return { status: "proposed", approvalId: approval.id };
  }

  const before = action.before ? await action.before(payload) : undefined;
  let after: unknown;
  const result = await action.apply(payload, {
    actor,
    snapshot: (value) => {
      after = value;
    },
  });

  await writeAudit({
    actor,
    action: actionKey,
    resource: action.resource,
    resourceId: options.resourceId,
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
