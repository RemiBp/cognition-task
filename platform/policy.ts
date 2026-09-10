import type { ApprovalRequest } from "@prisma/client";
import { db, type DbClient } from "./db";
import type { Actor } from "./rbac";

/**
 * One server-side statement of what may be done to a record, by whom, right
 * now. Pages read it to decide what to render and why; `execute()` reads it
 * again inside the transaction that performs the write. Nothing in the browser
 * is authority: a forged request re-enters through the same function.
 */

export type PolicyRecord = {
  id: string;
  status: string;
  version: number;
};

export type PolicyState = {
  record: PolicyRecord | null;
  /** The proposal currently holding the reservation on this record, if any. */
  activeProposal: Pick<ApprovalRequest, "id" | "action" | "requestedById" | "summary"> | null;
};

export type ActionAvailability = {
  key: string;
  label: string;
  available: boolean;
  /** Shown next to a disabled control, so the refusal is explained, not hidden. */
  reason?: string;
  requiresReason: boolean;
  danger?: boolean;
};

type PolicyInput = {
  actor: Actor;
  state: PolicyState;
};

type ActionPolicy = {
  resource: string;
  label: string;
  requiresReason: boolean;
  danger?: boolean;
  /** Roles that may invoke the action at all. Mirrored by the action's own `roles`. */
  evaluate: (input: PolicyInput) => { available: boolean; reason?: string };
};

const AWAITING = "A proposal on this record is awaiting independent approval.";
const SENIOR_NEXT = "This case is escalated; senior review is the next step.";
const READ_ONLY = "Your role is read-only for this record.";
const SETTLED = "This record is already settled and cannot be reopened.";

function blockedByProposal(state: PolicyState) {
  return state.activeProposal !== null;
}

const kycDecide: ActionPolicy["evaluate"] = ({ actor, state }) => {
  const record = state.record;
  if (!record) return { available: false, reason: "This case no longer exists." };
  if (actor.role === "viewer") return { available: false, reason: READ_ONLY };
  if (record.status !== "pending" && record.status !== "escalated") {
    return { available: false, reason: SETTLED };
  }
  if (blockedByProposal(state)) return { available: false, reason: AWAITING };
  if (actor.role === "analyst" && record.status === "escalated") {
    return { available: false, reason: SENIOR_NEXT };
  }
  return { available: true };
};

const kycEscalate: ActionPolicy["evaluate"] = ({ actor, state }) => {
  const record = state.record;
  if (!record) return { available: false, reason: "This case no longer exists." };
  if (actor.role === "viewer") return { available: false, reason: READ_ONLY };
  // An open proposal is what the case is waiting on, whatever state it is in.
  // Checking it before the state keeps one answer on the page: an escalated
  // case under proposal reads as awaiting approval, not as awaiting an
  // escalation that has already happened.
  if (blockedByProposal(state)) return { available: false, reason: AWAITING };
  if (record.status === "escalated") return { available: false, reason: SENIOR_NEXT };
  if (record.status !== "pending") return { available: false, reason: SETTLED };
  return { available: true };
};

const refundPolicy =
  (label: string): ActionPolicy["evaluate"] =>
  ({ actor, state }) => {
    const record = state.record;
    if (!record) return { available: false, reason: `This ${label} no longer exists.` };
    if (actor.role === "viewer") return { available: false, reason: READ_ONLY };
    if (record.status !== "pending") return { available: false, reason: SETTLED };
    if (blockedByProposal(state)) return { available: false, reason: AWAITING };
    return { available: true };
  };

const disputeOpen: ActionPolicy["evaluate"] = ({ actor, state }) => {
  const record = state.record;
  if (!record) return { available: false, reason: "This dispute no longer exists." };
  if (actor.role === "viewer") return { available: false, reason: READ_ONLY };
  if (record.status !== "open") return { available: false, reason: SETTLED };
  if (blockedByProposal(state)) return { available: false, reason: AWAITING };
  return { available: true };
};

export type { ActionPolicy };

export const ACTION_POLICIES: Record<string, ActionPolicy> = {
  "kyc_case.decide.approved": {
    resource: "kyc_case",
    label: "Propose approval",
    requiresReason: true,
    evaluate: kycDecide,
  },
  "kyc_case.decide.rejected": {
    resource: "kyc_case",
    label: "Propose rejection",
    requiresReason: true,
    danger: true,
    evaluate: kycDecide,
  },
  "kyc_case.escalate": {
    resource: "kyc_case",
    label: "Escalate for senior review",
    requiresReason: true,
    evaluate: kycEscalate,
  },
  "refund.approve": {
    resource: "refund",
    label: "Propose approval",
    requiresReason: false,
    evaluate: refundPolicy("refund"),
  },
  "refund.reject": {
    resource: "refund",
    label: "Reject",
    requiresReason: false,
    danger: true,
    evaluate: refundPolicy("refund"),
  },
  "dispute.refund": {
    resource: "dispute",
    label: "Propose refund",
    requiresReason: false,
    evaluate: disputeOpen,
  },
  "dispute.close": {
    resource: "dispute",
    label: "Close",
    requiresReason: false,
    evaluate: ({ actor, state }) => {
      if (actor.role !== "admin") {
        return { available: false, reason: "Closing a dispute without refunding is admin-only." };
      }
      if (state.activeProposal?.action === "dispute.refund") {
        return {
          available: false,
          reason:
            "A refund proposal on this dispute is awaiting approval. Decide it before closing.",
        };
      }
      return disputeOpen({ actor, state });
    },
  },
  "feature_flag.toggle": {
    resource: "feature_flag",
    label: "Toggle flag",
    requiresReason: false,
    evaluate: ({ actor }) =>
      actor.role === "admin"
        ? { available: true }
        : { available: false, reason: "Feature flags are administrator-only on this platform." },
  },
};

/**
 * A generated app declares its policy next to its action, so availability and
 * enforcement stay in the same file and the page keeps no rules of its own.
 */
export function registerPolicy(key: string, policy: ActionPolicy): ActionPolicy {
  ACTION_POLICIES[key] = policy;
  return policy;
}

/**
 * Actions whose payload carries a decision discriminator have one policy entry
 * per decision, so the queue can explain approve and reject separately.
 */
export function policyKeyFor(actionKey: string, payload: Record<string, unknown>): string {
  const decision = payload["decision"];
  const composed = typeof decision === "string" ? `${actionKey}.${decision}` : actionKey;
  return composed in ACTION_POLICIES ? composed : actionKey;
}

const RESOURCE_LOADERS: Record<
  string,
  (client: DbClient, id: string) => Promise<PolicyRecord | null>
> = {
  kyc_case: (client, id) =>
    client.kycCase.findUnique({
      where: { id },
      select: { id: true, status: true, version: true },
    }),
  refund: (client, id) =>
    client.refund.findUnique({
      where: { id },
      select: { id: true, status: true, version: true },
    }),
  dispute: (client, id) =>
    client.dispute.findUnique({
      where: { id },
      select: { id: true, status: true, version: true },
    }),
  feature_flag: (client, id) =>
    client.featureFlag
      .findUnique({ where: { id }, select: { id: true, enabled: true, version: true } })
      .then((row) =>
        row ? { id: row.id, status: row.enabled ? "enabled" : "disabled", version: row.version } : null,
      ),
};

/** Lets a generated app expose its own table to the shared policy loader. */
export function registerResourceLoader(
  resource: string,
  loader: (client: DbClient, id: string) => Promise<PolicyRecord | null>,
) {
  RESOURCE_LOADERS[resource] = loader;
}

export async function loadPolicyState(
  resource: string,
  resourceId: string,
  client: DbClient = db,
): Promise<PolicyState> {
  const loader = RESOURCE_LOADERS[resource];
  const [record, activeProposal] = await Promise.all([
    loader ? loader(client, resourceId) : Promise.resolve(null),
    client.approvalRequest.findFirst({
      where: { resource, resourceId, activeKey: "active" },
      select: { id: true, action: true, requestedById: true, summary: true },
    }),
  ]);
  return { record, activeProposal };
}

export function evaluatePolicy(
  policyKey: string,
  input: PolicyInput,
): { available: boolean; reason?: string } {
  const policy = ACTION_POLICIES[policyKey];
  if (!policy) return { available: false, reason: "No policy is declared for this action." };
  return policy.evaluate(input);
}

/** The list a page renders. Availability and its explanation come from here only. */
export function availability(
  policyKeys: readonly string[],
  input: PolicyInput,
): ActionAvailability[] {
  return policyKeys.map((key) => {
    const policy = ACTION_POLICIES[key];
    const verdict = evaluatePolicy(key, input);
    return {
      key,
      label: policy?.label ?? key,
      requiresReason: policy?.requiresReason ?? false,
      danger: policy?.danger,
      available: verdict.available,
      reason: verdict.reason,
    };
  });
}

/** What the record is waiting on, in one sentence. */
export function nextStep(state: PolicyState): string {
  if (state.activeProposal) return "Awaiting independent approval";
  if (!state.record) return "No longer available";
  switch (state.record.status) {
    case "escalated":
      return "Senior review";
    case "pending":
    case "open":
      return "Review and proposal";
    default:
      return "Closed, no further step";
  }
}
