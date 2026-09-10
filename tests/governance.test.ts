import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import "@/platform/registry";
import { execute } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { db } from "@/platform/db";
import { ConflictError, PolicyError } from "@/platform/rbac";
import { actors, reset, seedCase } from "./helpers";

beforeEach(reset);
after(() => db.$disconnect());

test("a viewer is denied and the attempt is audited", async () => {
  await seedCase();
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Looks fine" },
      actors.viewer,
    ),
    PolicyError,
  );

  const audit = await db.auditLog.findFirstOrThrow();
  assert.equal(audit.outcome, "denied");
  assert.equal(audit.actorRole, "viewer");
  assert.equal(await db.approvalRequest.count(), 0);
});

test("a forged request that never rendered the page is refused by the same policy", async () => {
  await seedCase({ status: "escalated" });

  // The analyst UI renders this control disabled; the POST is sent anyway.
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Clearing it myself" },
      actors.analyst,
    ),
    (error: Error) => /senior review/i.test(error.message),
  );
  assert.equal(await db.approvalRequest.count(), 0);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "escalated");
});

test("invalid client payloads are rejected at runtime", async () => {
  await seedCase();
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", expectedVersion: 0, decision: "invented-status", reasoning: "x" },
      actors.analyst,
    ),
    PolicyError,
  );

  assert.equal(await db.approvalRequest.count(), 0);
  assert.equal(await db.auditLog.count({ where: { outcome: "denied" } }), 1);
});

test("a blank reason is refused before anything is written", async () => {
  await seedCase();
  await assert.rejects(
    execute(
      "kyc_case.escalate",
      { caseId: "kyc-1", expectedVersion: 0, reasoning: "   " },
      actors.analyst,
    ),
    PolicyError,
  );
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "pending");
});

test("an id supplied beside the payload cannot redirect the write", async () => {
  await seedCase();
  await seedCase({ id: "kyc-2", reference: "KYC-TEST-002" });

  await assert.rejects(
    execute(
      "kyc_case.escalate",
      { caseId: "kyc-1", expectedVersion: 0, reasoning: "Needs senior review" },
      actors.analyst,
      { resourceId: "kyc-2" },
    ),
    PolicyError,
  );
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-2" } })).status, "pending");
});

test("the proposer cannot approve their own request, admin included", async () => {
  await seedCase();
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Screening is clean" },
    actors.admin,
  );
  assert.equal(result.status, "proposed");
  assert.ok(result.status === "proposed");

  await assert.rejects(decide(result.approvalId, "approved", actors.admin), PolicyError);
  await assert.rejects(decide(result.approvalId, "rejected", actors.admin), PolicyError);
  assert.equal(
    await db.approvalRequest.count({ where: { id: result.approvalId, status: "pending" } }),
    1,
  );
  assert.equal(await db.auditLog.count({ where: { reason: "self-approval refused" } }), 2);
});

test("a second approver executes the change and records the trail", async () => {
  await seedCase();
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Name collision ruled out" },
    actors.analyst,
  );
  assert.ok(result.status === "proposed");

  await decide(result.approvalId, "approved", actors.admin, "Reviewed test evidence");

  const settled = await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } });
  assert.equal(settled.status, "approved");
  assert.equal(settled.version, 1);
  assert.equal(
    (await db.approvalRequest.findUniqueOrThrow({ where: { id: result.approvalId } })).status,
    "approved",
  );
  assert.deepEqual(
    (await db.auditLog.findMany({ orderBy: { at: "asc" } })).map((entry) => entry.outcome),
    ["proposed", "approved", "executed"],
  );
});

test("concurrent approval clicks execute the request only once", async () => {
  await seedCase();
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Screening is clean" },
    actors.analyst,
  );
  assert.ok(result.status === "proposed");

  const decisions = await Promise.allSettled([
    decide(result.approvalId, "approved", actors.admin),
    decide(result.approvalId, "approved", actors.approver),
  ]);

  assert.equal(decisions.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(await db.auditLog.count({ where: { outcome: "approved" } }), 1);
  assert.equal(await db.auditLog.count({ where: { outcome: "executed" } }), 1);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).version, 1);
});

test("a rejected proposal leaves the case in review and allows a new proposal", async () => {
  await seedCase();
  const first = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", expectedVersion: 0, decision: "approved", reasoning: "Screening is clean" },
    actors.analyst,
  );
  assert.ok(first.status === "proposed");

  await decide(first.approvalId, "rejected", actors.approver, "Evidence is too thin");

  const unchanged = await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } });
  assert.equal(unchanged.status, "pending");
  assert.equal(unchanged.version, 0);
  assert.equal(await db.approvalRequest.count({ where: { activeKey: "active" } }), 0);

  const second = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", expectedVersion: 0, decision: "rejected", reasoning: "Adverse media confirmed" },
    actors.approver,
  );
  assert.ok(second.status === "proposed");
  await decide(second.approvalId, "approved", actors.admin);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "rejected");
});

test("there is no reopen path once a case is settled", async () => {
  await seedCase({ status: "approved", version: 3 });
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", expectedVersion: 3, decision: "rejected", reasoning: "Changed my mind" },
      actors.admin,
    ),
    (error: Error) => /settled/i.test(error.message),
  );
});

test("refunds and disputes inherit the same policy shape", async () => {
  const refund = await db.refund.create({
    data: {
      id: "refund-1",
      orderId: "NP-1",
      customerName: "Test Customer",
      amountCents: 4_200,
      currency: "EUR",
      reason: "duplicate charge",
    },
  });
  await assert.rejects(
    execute("refund.approve", { refundId: refund.id, expectedVersion: 0 }, actors.viewer),
    PolicyError,
  );

  const proposal = await execute(
    "refund.approve",
    { refundId: refund.id, expectedVersion: 0 },
    actors.analyst,
  );
  assert.ok(proposal.status === "proposed");
  await assert.rejects(decide(proposal.approvalId, "approved", actors.analyst), PolicyError);
  await decide(proposal.approvalId, "approved", actors.approver);
  assert.equal((await db.refund.findUniqueOrThrow({ where: { id: refund.id } })).status, "approved");

  const dispute = await db.dispute.create({
    data: {
      id: "dispute-1",
      reference: "DSP-1",
      customerName: "Test Customer",
      amountCents: 9_900,
      currency: "EUR",
      reason: "product not received",
    },
  });
  const refundProposal = await execute(
    "dispute.refund",
    { disputeId: dispute.id, expectedVersion: 0 },
    actors.analyst,
  );
  assert.ok(refundProposal.status === "proposed");

  // Closing is a direct admin action, and it must not slip past the pending
  // refund proposal on the same dispute.
  await assert.rejects(
    execute("dispute.close", { disputeId: dispute.id, expectedVersion: 0 }, actors.admin),
    (error: Error) => /refund proposal/i.test(error.message),
  );
  assert.equal((await db.dispute.findUniqueOrThrow({ where: { id: dispute.id } })).status, "open");
});

test("feature flags refuse every non-admin, including through a forged call", async () => {
  const flag = await db.featureFlag.create({
    data: { id: "flag-1", key: "test_flag", description: "Test", enabled: false },
  });
  for (const actor of [actors.viewer, actors.analyst, actors.approver]) {
    await assert.rejects(
      execute(
        "feature_flag.toggle",
        { flagId: flag.id, expectedVersion: 0, enabled: true },
        actor,
      ),
      PolicyError,
    );
  }
  assert.equal((await db.featureFlag.findUniqueOrThrow({ where: { id: flag.id } })).enabled, false);

  await execute("feature_flag.toggle", { flagId: flag.id, expectedVersion: 0, enabled: true }, actors.admin);
  assert.equal((await db.featureFlag.findUniqueOrThrow({ where: { id: flag.id } })).enabled, true);

  // Same logical state, stale version: still refused.
  await assert.rejects(
    execute("feature_flag.toggle", { flagId: flag.id, expectedVersion: 0, enabled: true }, actors.admin),
    ConflictError,
  );
});
