import assert from "node:assert/strict";
import { test } from "node:test";
import { availability, evaluatePolicy, nextStep, type PolicyState } from "@/platform/policy";
import type { Actor } from "@/platform/rbac";

/**
 * The policy is a pure function of role, record state, and the proposal
 * holding the reservation. These tests pin the answers the pages render and
 * the answers `execute()` re-checks, since they are the same answers.
 */

const actors = {
  viewer: { id: "viewer", email: "viewer@test.dev", name: "Viewer", role: "viewer" },
  analyst: { id: "analyst", email: "analyst@test.dev", name: "Analyst", role: "analyst" },
  approver: { id: "approver", email: "approver@test.dev", name: "Approver", role: "approver" },
  admin: { id: "admin", email: "admin@test.dev", name: "Admin", role: "admin" },
} satisfies Record<string, Actor>;

const state = (status: string, proposal?: Partial<PolicyState["activeProposal"]>): PolicyState => ({
  record: { id: "r1", status, version: 0 },
  activeProposal: proposal
    ? {
        id: "req-1",
        action: "kyc_case.decide",
        requestedById: "analyst",
        summary: "Mark KYC case as approved",
        ...proposal,
      }
    : null,
});

test("a viewer is read-only everywhere, with the reason shown", () => {
  for (const key of ["kyc_case.decide.approved", "kyc_case.escalate", "refund.approve", "dispute.refund"]) {
    const verdict = evaluatePolicy(key, { actor: actors.viewer, state: state("pending") });
    assert.equal(verdict.available, false);
    assert.match(verdict.reason ?? "", /read-only/i);
  }
});

test("proposal labels name the maker-checker step", () => {
  const [approve, reject] = availability(
    ["kyc_case.decide.approved", "kyc_case.decide.rejected"],
    { actor: actors.analyst, state: state("pending") },
  );
  assert.equal(approve.label, "Propose approval");
  assert.equal(reject.label, "Propose rejection");
  assert.ok(approve.available && reject.available);
  assert.ok(approve.requiresReason && reject.requiresReason);
});

test("an analyst is read-only on an escalated case and told senior review is next", () => {
  const input = { actor: actors.analyst, state: state("escalated") };
  for (const key of ["kyc_case.decide.approved", "kyc_case.escalate"]) {
    const verdict = evaluatePolicy(key, input);
    assert.equal(verdict.available, false);
    assert.match(verdict.reason ?? "", /senior review/i);
  }
  assert.equal(evaluatePolicy("kyc_case.decide.approved", { actor: actors.approver, state: state("escalated") }).available, true);
});

test("a pending proposal blocks every other decision on the record", () => {
  const blocked = state("pending", {});
  for (const actor of [actors.analyst, actors.approver, actors.admin]) {
    for (const key of ["kyc_case.decide.approved", "kyc_case.decide.rejected", "kyc_case.escalate"]) {
      const verdict = evaluatePolicy(key, { actor, state: blocked });
      assert.equal(verdict.available, false, `${actor.role} ${key}`);
      assert.match(verdict.reason ?? "", /awaiting independent approval/i);
    }
  }
  assert.equal(nextStep(blocked), "Awaiting independent approval");
});

test("closing a dispute is admin-only and refused while a refund proposal is open", () => {
  assert.match(
    evaluatePolicy("dispute.close", { actor: actors.approver, state: state("open") }).reason ?? "",
    /admin-only/i,
  );
  const withRefund = state("open", { action: "dispute.refund" });
  const verdict = evaluatePolicy("dispute.close", { actor: actors.admin, state: withRefund });
  assert.equal(verdict.available, false);
  assert.match(verdict.reason ?? "", /refund proposal/i);
  assert.equal(evaluatePolicy("dispute.close", { actor: actors.admin, state: state("open") }).available, true);
});

test("feature flags are visibly read-only for non-admins", () => {
  for (const actor of [actors.viewer, actors.analyst, actors.approver]) {
    const [toggle] = availability(["feature_flag.toggle"], { actor, state: state("enabled") });
    assert.equal(toggle.available, false);
    assert.match(toggle.reason ?? "", /administrator-only/i);
  }
  assert.equal(
    availability(["feature_flag.toggle"], { actor: actors.admin, state: state("enabled") })[0].available,
    true,
  );
});

test("an action with no declared policy fails closed", () => {
  const verdict = evaluatePolicy("some_app.some_action", { actor: actors.admin, state: state("pending") });
  assert.equal(verdict.available, false);
  assert.match(verdict.reason ?? "", /no policy/i);
});

test("a settled record offers no action and no next step", () => {
  const settled = state("approved");
  assert.equal(evaluatePolicy("kyc_case.decide.approved", { actor: actors.admin, state: settled }).available, false);
  assert.equal(nextStep(settled), "Closed, no further step");
});
