import { createHash, randomUUID } from "crypto";
import { z } from "zod";
import { db, type DbClient } from "./db";
import {
  ACTION_POLICIES,
  evaluatePolicy,
  loadPolicyState,
  policyKeyFor,
} from "./policy";
import { ConflictError, PolicyError, type Actor, type Role } from "./rbac";

/**
 * The single chokepoint through which every mutation in every app passes.
 *
 * This is the part of Power Apps / Dataverse that is expensive to give up and
 * cheap to forget when building in-house: a write that goes through here gets
 * a policy check, a precondition re-check, an audit record and, where
 * declared, maker-checker approval.
 *
 * It is the only path the apps use, not the only path that exists. Prisma is
 * importable anywhere in the process, so an app that called `db.*.update()`
 * directly would bypass all of this. AGENTS.md forbids it and review catches
 * it; in a real deployment the boundary is the database account the
 * application runs as, not this file.
 *
 * Three properties the first version did not have:
 *  - the domain change and its audit entry commit in one transaction, through
 *    the transaction client, so a partial success cannot exist;
 *  - the write is a compare-and-set on the record version, so a stale tab
 *    cannot overwrite a newer decision;
 *  - a pending proposal holds a database-side reservation on the record, so
 *    two conflicting proposals cannot both be open.
 */

export type ActionContext = {
  actor: Actor;
  /** Transaction-bound client. Using the global `db` here is a bug. */
  tx: DbClient;
  /** Version the caller expects the record to be at; enforced by the action. */
  expectedVersion: number;
  /** JSON snapshot of the record after the change, for the audit trail. */
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
  resourceId: (payload: P) => string;
  /** Version the payload claims to have been composed against. */
  expectedVersion: (payload: P) => number;
  /**
   * Identifier of the user intent this payload belongs to. Required for
   * actions that need approval: it is what separates a retry of one submit
   * from a deliberate second attempt. See `INTENT_KEY`.
   */
  intentKey?: (payload: P) => string;
  /**
   * When true the action never applies directly: it becomes a proposal that a
   * different user holding `approval.decide` must approve.
   */
  requiresApproval?: boolean;
  /** One-line human description shown in the approvals queue. */
  describe: (payload: P) => string;
  /** Customer-facing identity carried into approvals and history. */
  subject?: (payload: P, client: DbClient) => Promise<string | undefined>;
  /** Optional current-state snapshot, recorded as the audit `before`. */
  before?: (payload: P, client: DbClient) => Promise<unknown>;
  apply: (payload: P, ctx: ActionContext) => Promise<unknown>;
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, ActionDefinition<any>>();

export function registerAction<P>(definition: ActionDefinition<P>): ActionDefinition<P> {
  if (definition.requiresApproval && !definition.intentKey) {
    throw new Error(
      `${definition.key} requires approval, so it must declare intentKey and validate it in its schema.`,
    );
  }
  registry.set(definition.key, definition);
  return definition;
}

/**
 * Validation for the intent key an action that needs approval carries.
 *
 * The client mints one identifier per intent and keeps it for every retry of
 * that intent, so the server can answer a replay with the proposal it already
 * created, whatever happened to that proposal since. It cannot be derived from
 * the record: a rejection leaves the record exactly as it was, so no server
 * state distinguishes "the network retried my submit" from "I decided to
 * propose this again". Only the caller knows which one it is.
 */
export const INTENT_KEY = z.string().trim().min(8).max(100);

export function getAction(key: string) {
  const action = registry.get(key);
  if (!action) throw new Error(`Unknown action: ${key}`);
  return action;
}

export type ExecuteResult =
  | { status: "executed" }
  | {
      status: "proposed";
      approvalId: string;
      reused: boolean;
      /** What the reused request is now: a replay can land on a decided one. */
      requestStatus: "pending" | "approved" | "rejected";
    };

type ExecuteOptions = {
  reason?: string;
  resourceId?: string;
  /** Set only by the approvals flow, after a second person has decided. */
  approvedBy?: { requestId: string; deciderId: string };
  /** Join an already open transaction (the approvals flow does this). */
  tx?: DbClient;
};

/**
 * Stable across key order, so an identical retry hashes identically. The
 * intent key is excluded: this hash answers "is this the same business
 * request", which has to stay comparable between two different intents.
 */
export function canonicalPayloadHash(actionKey: string, payload: unknown): string {
  const business =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? Object.fromEntries(
          Object.entries(payload as Record<string, unknown>).filter(([key]) => key !== "intentKey"),
        )
      : payload;
  const canonical = JSON.stringify(business, (_key, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : value,
  );
  return createHash("sha256").update(`${actionKey}:${canonical}`).digest("hex");
}

/** Reasons travel inside the payload, so they are validated and hashed with it. */
function payloadReason(payload: unknown): string | undefined {
  if (payload && typeof payload === "object" && "reasoning" in payload) {
    const value = (payload as { reasoning?: unknown }).reasoning;
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return undefined;
}

/** Scoped to the actor, so one person's key cannot address another's proposal. */
function requestKeyFor(
  actor: Actor,
  actionKey: string,
  resourceId: string,
  intentKey: string,
): string {
  return createHash("sha256")
    .update(`${actor.id}:${actionKey}:${resourceId}:${intentKey}`)
    .digest("hex");
}

function requestStatusOf(status: string): "pending" | "approved" | "rejected" {
  return status === "approved" || status === "rejected" ? status : "pending";
}

function isUniqueViolation(error: unknown, field: string): boolean {
  const candidate = error as { code?: string; meta?: { target?: unknown } };
  if (candidate?.code !== "P2002") return false;
  const target = candidate.meta?.target;
  const text = Array.isArray(target) ? target.join(",") : String(target ?? "");
  return text.includes(field);
}

async function runInTransaction<T>(
  tx: DbClient | undefined,
  fn: (client: DbClient) => Promise<T>,
): Promise<T> {
  if (tx) return fn(tx);
  return db.$transaction((client) => fn(client));
}

export async function execute(
  actionKey: string,
  payload: unknown,
  actor: Actor,
  options: ExecuteOptions = {},
): Promise<ExecuteResult> {
  const action = getAction(actionKey);
  const requestId = randomUUID();

  // When this call joins a caller's transaction, that caller owns the refusal
  // log: writing it here would either join the doomed transaction or contend
  // with it on a second connection.
  const ownsAuditTrail = !options.tx;

  const deny = async (message: string, reason: string, resourceId?: string) => {
    // Denials are logged outside any transaction: a rolled back attempt must
    // still leave a trace, which is the whole point of recording refusals.
    if (!ownsAuditTrail) throw new PolicyError(message);
    await writeAudit({
      actor,
      action: actionKey,
      resource: action.resource,
      resourceId,
      outcome: "denied",
      reason,
      requestId,
    });
    throw new PolicyError(message);
  };

  if (!action.roles.includes(actor.role)) {
    await deny(
      "You do not have permission to perform this action. The attempt was blocked and logged.",
      `role ${actor.role} not permitted`,
      options.resourceId,
    );
  }

  const parsed = action.schema.safeParse(payload);
  if (!parsed.success) {
    await deny(
      "The request was invalid. The attempt was blocked and logged.",
      "invalid action payload",
      options.resourceId,
    );
  }

  const validPayload = parsed.data!;
  const canonicalResourceId = action.resourceId(validPayload);
  const expectedVersion = action.expectedVersion(validPayload);

  if (options.resourceId && options.resourceId !== canonicalResourceId) {
    await deny(
      "The request was invalid. The attempt was blocked and logged.",
      "resource id mismatch",
      canonicalResourceId,
    );
  }

  const policyKey = policyKeyFor(actionKey, validPayload as Record<string, unknown>);
  const policy = ACTION_POLICIES[policyKey];
  const reason = payloadReason(validPayload) ?? options.reason?.trim() ?? undefined;

  if (policy?.requiresReason && !reason && !options.approvedBy) {
    await deny(
      "A written reason is required for this action.",
      "missing reason",
      canonicalResourceId,
    );
  }

  const payloadHash = canonicalPayloadHash(actionKey, validPayload);

  const revalidate = async (client: DbClient) => {
    const state = await loadPolicyState(action.resource, canonicalResourceId, client);
    const verdict = evaluatePolicy(policyKey, { actor, state });
    if (!verdict.available) {
      throw new PolicyError(verdict.reason ?? "This action is not available on this record.");
    }
    if (!state.record) {
      throw new ConflictError("This record no longer exists.");
    }
    if (state.record.version !== expectedVersion) {
      throw new ConflictError(
        "This record changed since the page was loaded. Reload and review the current state.",
      );
    }
    return state;
  };

  if (action.requiresApproval && !options.approvedBy) {
    const intentKey = action.intentKey!(validPayload);
    const requestKey = requestKeyFor(actor, actionKey, canonicalResourceId, intentKey);
    try {
      return await runInTransaction(options.tx, async (client) => {
        // A replay is answered before the policy is consulted, and whatever the
        // proposal's status is now: the second delivery of one intent must be
        // the proposal the first delivery created, never a second proposal and
        // never a refusal caused by the reservation it took.
        const existing = await client.approvalRequest.findUnique({ where: { requestKey } });
        if (existing) {
          if (existing.payloadHash !== payloadHash) {
            throw new ConflictError(
              "This request was already submitted with different content. Reload and submit again.",
            );
          }
          return {
            status: "proposed",
            approvalId: existing.id,
            reused: true,
            requestStatus: requestStatusOf(existing.status),
          } as const;
        }

        const active = await client.approvalRequest.findFirst({
          where: { resource: action.resource, resourceId: canonicalResourceId, activeKey: "active" },
        });
        if (active) {
          // A different intent on a record that is already reserved, even one
          // proposing exactly the same thing: the open proposal is decided
          // first, it is not silently joined.
          throw new ConflictError(
            `A proposal on this record is already awaiting approval: ${active.summary}. Decide it first.`,
          );
        }

        await revalidate(client);

        const subject = await action.subject?.(validPayload, client);
        const approval = await client.approvalRequest.create({
          data: {
            action: actionKey,
            resource: action.resource,
            resourceId: canonicalResourceId,
            payload: JSON.stringify(validPayload),
            payloadHash,
            requestKey,
            targetVersion: expectedVersion,
            summary: action.describe(validPayload),
            subject,
            reason,
            requestedById: actor.id,
          },
        });

        await writeAudit(
          {
            actor,
            action: actionKey,
            resource: action.resource,
            resourceId: canonicalResourceId,
            outcome: "proposed",
            reason,
            requestId,
          },
          client,
        );

        return {
          status: "proposed",
          approvalId: approval.id,
          reused: false,
          requestStatus: "pending",
        } as const;
      });
    } catch (error) {
      if (isUniqueViolation(error, "requestKey")) {
        // An identical retry raced us; reuse the request the other one created.
        const existing = await db.approvalRequest.findUnique({ where: { requestKey } });
        if (existing) {
          return {
            status: "proposed",
            approvalId: existing.id,
            reused: true,
            requestStatus: requestStatusOf(existing.status),
          };
        }
      }
      if (isUniqueViolation(error, "activeKey")) {
        // Two different intents raced past the read above. The loser reports
        // the conflict; only a replay of its own intent, handled by the branch
        // above, is allowed to collapse into an existing proposal.
        if (ownsAuditTrail) {
          await writeAudit({
            actor,
            action: actionKey,
            resource: action.resource,
            resourceId: canonicalResourceId,
            outcome: "denied",
            reason: "conflicting proposal already active",
            requestId,
          });
        }
        throw new ConflictError(
          "A different proposal on this record is already awaiting approval. Decide it first.",
        );
      }
      if (ownsAuditTrail) {
        await logFailure(error, {
          actor,
          actionKey,
          resource: action.resource,
          resourceId: canonicalResourceId,
          requestId,
        });
      }
      throw error;
    }
  }

  try {
    return await runInTransaction(options.tx, async (client) => {
      await revalidate(client);

      const before = action.before ? await action.before(validPayload, client) : undefined;
      let after: unknown;
      const result = await action.apply(validPayload, {
        actor,
        tx: client,
        expectedVersion,
        snapshot: (value) => {
          after = value;
        },
      });

      await writeAudit(
        {
          actor,
          action: actionKey,
          resource: action.resource,
          resourceId: canonicalResourceId,
          outcome: "executed",
          before,
          after: after ?? result,
          reason: options.approvedBy ? `approval ${options.approvedBy.requestId}` : reason,
          requestId,
        },
        client,
      );

      return { status: "executed" } as const;
    });
  } catch (error) {
    if (ownsAuditTrail) {
      await logFailure(error, {
        actor,
        actionKey,
        resource: action.resource,
        resourceId: canonicalResourceId,
        requestId,
      });
    }
    throw error;
  }
}

/**
 * Refusals and failures are recorded on the root client so that they survive
 * the rollback of the attempt they describe.
 */
async function logFailure(
  error: unknown,
  context: {
    actor: Actor;
    actionKey: string;
    resource: string;
    resourceId?: string;
    requestId: string;
  },
) {
  await writeAudit({
    actor: context.actor,
    action: context.actionKey,
    resource: context.resource,
    resourceId: context.resourceId,
    outcome: "denied",
    reason: error instanceof Error ? error.message : "action failed",
    requestId: context.requestId,
  });
}

export async function writeAudit(
  entry: {
    actor: Actor;
    action: string;
    resource: string;
    resourceId?: string;
    outcome: "executed" | "proposed" | "denied" | "approved" | "rejected";
    before?: unknown;
    after?: unknown;
    reason?: string;
    requestId: string;
  },
  client: DbClient = db,
) {
  await client.auditLog.create({
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
