import { availability, type PolicyState } from "../policy";
import type { Actor } from "../rbac";
import type { ActionOption } from "./ActionControls";

export type ControlSpec = {
  /** Entry in ACTION_POLICIES; equals the action key unless the payload has a decision. */
  policyKey: string;
  actionKey: string;
  payload: Record<string, unknown>;
};

/**
 * Server-side bridge: turns the policy verdicts into the props the shared
 * control renders. Pages never restate a role or state rule of their own.
 */
export function controlsFor(
  specs: readonly ControlSpec[],
  actor: Actor,
  state: PolicyState,
): ActionOption[] {
  const verdicts = availability(
    specs.map((spec) => spec.policyKey),
    { actor, state },
  );

  return specs.map((spec, index) => ({
    actionKey: spec.actionKey,
    payload: spec.payload,
    label: verdicts[index].label,
    available: verdicts[index].available,
    reason: verdicts[index].reason,
    requiresReason: verdicts[index].requiresReason,
    danger: verdicts[index].danger,
  }));
}
