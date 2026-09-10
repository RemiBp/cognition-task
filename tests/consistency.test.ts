import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import "@/platform/registry";
import { execute, getAction } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { db } from "@/platform/db";
import { DEMO_CASE_REFERENCE, DEMO_CUSTOMER } from "@/platform/demo";
import { ConflictError } from "@/platform/rbac";
import { demoCase } from "@/prisma/fixtures";
import { actors, reset, seedCase } from "./helpers";

beforeEach(reset);
after(() => db.$disconnect());

/**
 * `intentKey` is what the browser mints per submit and repeats on every retry
 * of that submit, so a test that replays a request passes the same one, and a
 * test that makes a deliberate second attempt passes a new one.
 */
const approvalOf = (
  decision: "approved" | "rejected",
  version = 0,
  intentKey = `intent-${decision}-${version}`,
) => ({
  caseId: "kyc-1",
  expectedVersion: version,
  decision,
  reasoning: `Proposing ${decision} on the evidence in the file`,
  intentKey,
});

test("an identical retry reuses the open request instead of opening a second one", async () => {
  await seedCase();
  const first = await execute("kyc_case.decide", approvalOf("approved"), actors.analyst);
  const second = await execute("kyc_case.decide", approvalOf("approved"), actors.analyst);

  assert.ok(first.status === "proposed" && second.status === "proposed");
  assert.equal(second.approvalId, first.approvalId);
  assert.equal(second.reused, true);
  assert.equal(await db.approvalRequest.count(), 1);
});

test("a different payload conflicts rather than reusing the opposite decision", async () => {
  await seedCase();
  await execute("kyc_case.decide", approvalOf("approved"), actors.analyst);

  await assert.rejects(
    execute("kyc_case.decide", approvalOf("rejected"), actors.approver),
    ConflictError,
  );
  const requests = await db.approvalRequest.findMany();
  assert.equal(requests.length, 1);
  assert.match(requests[0].payload, /approved/);
  const denial = await db.auditLog.findFirstOrThrow({ where: { outcome: "denied" } });
  assert.match(denial.reason ?? "", /already awaiting approval/i);
});

test("a deliberate second attempt after a rejection is a new proposal", async () => {
  await seedCase();
  const first = await execute(
    "kyc_case.decide",
    approvalOf("approved", 0, "intent-first-attempt"),
    actors.analyst,
  );
  assert.ok(first.status === "proposed");
  await decide(first.approvalId, "rejected", actors.approver, "Re-run the sanctions check first");

  // Same actor, byte-identical business payload, but the person decided to
  // propose again: a new submit, therefore a new intent key.
  const second = await execute(
    "kyc_case.decide",
    approvalOf("approved", 0, "intent-second-attempt"),
    actors.analyst,
  );
  assert.ok(second.status === "proposed");
  assert.notEqual(second.approvalId, first.approvalId);
  assert.equal(second.reused, false);
  assert.equal(await db.approvalRequest.count({ where: { activeKey: "active" } }), 1);

  await decide(second.approvalId, "approved", actors.admin);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "approved");
});

test("a replay arriving after the proposal was rejected does not open another one", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-lost-response");
  const first = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(first.status === "proposed");
  await decide(first.approvalId, "rejected", actors.approver, "Re-run the sanctions check first");

  // The original request is delivered again long after the decision. It is one
  // intent that has already been answered, not a new attempt.
  const replay = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(replay.status === "proposed");
  assert.equal(replay.approvalId, first.approvalId);
  assert.equal(replay.reused, true);
  assert.equal(await db.approvalRequest.count(), 1);
  assert.equal(await db.approvalRequest.count({ where: { activeKey: "active" } }), 0);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "pending");
});

test("a replay reports what the request has become, not what it was", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-status-copy");
  const first = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(first.status === "proposed");
  assert.equal(first.requestStatus, "pending");

  const whilePending = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(whilePending.status === "proposed");
  assert.equal(whilePending.requestStatus, "pending");

  await decide(first.approvalId, "rejected", actors.approver, "Re-run the sanctions check first");

  // The message the user reads is built from this: a rejected request must not
  // be described as awaiting approval.
  const afterRejection = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(afterRejection.status === "proposed");
  assert.equal(afterRejection.approvalId, first.approvalId);
  assert.equal(afterRejection.reused, true);
  assert.equal(afterRejection.requestStatus, "rejected");
});

test("a replay of an approved request reports it as approved", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-approved-copy");
  const first = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(first.status === "proposed");
  await decide(first.approvalId, "approved", actors.admin);

  const replay = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(replay.status === "proposed");
  assert.equal(replay.approvalId, first.approvalId);
  assert.equal(replay.requestStatus, "approved");
  assert.equal(await db.approvalRequest.count(), 1);
});

test("the same intent key with altered content is a conflict, not a silent edit", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-tampered");
  const first = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(first.status === "proposed");

  await assert.rejects(
    execute("kyc_case.decide", { ...submit, decision: "rejected" }, actors.analyst),
    ConflictError,
  );
  const requests = await db.approvalRequest.findMany();
  assert.equal(requests.length, 1);
  assert.match(requests[0].payload, /approved/);
});

test("an intent key is scoped to its actor", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-shared-string");
  const mine = await execute("kyc_case.decide", submit, actors.analyst);
  assert.ok(mine.status === "proposed");

  // Someone else reusing the same string cannot address my proposal; they meet
  // the reservation like any other second proposer.
  await assert.rejects(execute("kyc_case.decide", submit, actors.approver), ConflictError);
  assert.equal(await db.approvalRequest.count(), 1);
});

test("concurrent retries of one submit produce exactly one reservation", async () => {
  await seedCase();
  const submit = approvalOf("approved", 0, "intent-in-flight");
  const results = await Promise.allSettled([
    execute("kyc_case.decide", submit, actors.analyst),
    execute("kyc_case.decide", submit, actors.analyst),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 2);
  const ids = results.map((item) =>
    item.status === "fulfilled" && item.value.status === "proposed" ? item.value.approvalId : null,
  );
  assert.equal(ids[0], ids[1]);
  assert.equal(await db.approvalRequest.count(), 1);
});

test("concurrent submits sharing an intent key but not their content conflict", async () => {
  await seedCase();
  // One key, two different decisions, delivered together. Whichever branch
  // answers the loser, the read on the key or the unique violation on
  // creating it, the contract is the same: a key means one payload. SQLite
  // serialises writes, so which branch runs is not something this asserts.
  const results = await Promise.allSettled([
    execute("kyc_case.decide", approvalOf("approved", 0, "intent-same-key"), actors.analyst),
    execute("kyc_case.decide", approvalOf("rejected", 0, "intent-same-key"), actors.analyst),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  const rejected = results.find((item) => item.status === "rejected");
  assert.ok(rejected?.status === "rejected" && rejected.reason instanceof ConflictError);
  assert.equal(await db.approvalRequest.count(), 1);
});

test("concurrent opposite proposals leave one winner and one conflict", async () => {
  await seedCase();
  const results = await Promise.allSettled([
    execute("kyc_case.decide", approvalOf("approved", 0, "intent-a"), actors.analyst),
    execute("kyc_case.decide", approvalOf("rejected", 0, "intent-b"), actors.analyst2),
  ]);

  assert.equal(results.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(await db.approvalRequest.count({ where: { activeKey: "active" } }), 1);
  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "pending");
});

test("a stale tab is refused on the version, not on the state it can see", async () => {
  await seedCase();
  await execute(
    "kyc_case.escalate",
    { caseId: "kyc-1", expectedVersion: 0, reasoning: "Adverse media needs senior review" },
    actors.analyst,
  );

  // The approver's tab was rendered before the escalation, so it still carries version 0.
  await assert.rejects(
    execute("kyc_case.decide", approvalOf("approved", 0), actors.approver),
    ConflictError,
  );
  assert.equal(await db.approvalRequest.count(), 0);

  const fresh = await execute("kyc_case.decide", approvalOf("approved", 1), actors.approver);
  assert.ok(fresh.status === "proposed");
});

test("a failure inside the action rolls back the domain change and the success audit", async () => {
  await seedCase();
  const action = getAction("kyc_case.escalate");
  const original = action.apply;
  action.apply = async (payload, ctx) => {
    await original(payload, ctx);
    throw new Error("injected processor failure");
  };

  try {
    await assert.rejects(
      execute(
        "kyc_case.escalate",
        { caseId: "kyc-1", expectedVersion: 0, reasoning: "Adverse media needs senior review" },
        actors.analyst,
      ),
      /injected processor failure/,
    );
  } finally {
    action.apply = original;
  }

  const unchanged = await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } });
  assert.equal(unchanged.status, "pending");
  assert.equal(unchanged.version, 0);
  assert.equal(await db.auditLog.count({ where: { outcome: "executed" } }), 0);

  // The refusal itself is written outside the rolled back transaction.
  const denial = await db.auditLog.findFirstOrThrow({ where: { outcome: "denied" } });
  assert.match(denial.reason ?? "", /injected processor failure/);
});

test("the domain change and its audit entry commit together", async () => {
  await seedCase();
  await execute(
    "kyc_case.escalate",
    { caseId: "kyc-1", expectedVersion: 0, reasoning: "Adverse media needs senior review" },
    actors.analyst,
  );

  const [entry] = await db.auditLog.findMany({ where: { outcome: "executed" } });
  const record = await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } });
  assert.equal(record.status, "escalated");
  assert.equal(record.version, 1);
  assert.equal(JSON.parse(entry.before ?? "{}").status, "pending");
  assert.equal(JSON.parse(entry.after ?? "{}").status, "escalated");
});

test("the case identity travels into the approval and the history, not just the id", async () => {
  await db.kycCase.create({ data: demoCase() });
  const reasoning =
    "The 2019 article gives no date of birth and names a different nationality: different person.";
  const proposal = await execute(
    "kyc_case.decide",
    {
      caseId: demoCase().id,
      expectedVersion: 0,
      decision: "approved",
      reasoning,
      intentKey: "intent-demo-approval",
    },
    actors.approver,
  );
  assert.ok(proposal.status === "proposed");

  const request = await db.approvalRequest.findUniqueOrThrow({ where: { id: proposal.approvalId } });
  assert.equal(request.subject, `${DEMO_CASE_REFERENCE} · ${DEMO_CUSTOMER}`);
  assert.equal(request.reason, reasoning);
  assert.equal(request.targetVersion, 0);

  await decide(proposal.approvalId, "approved", actors.admin, "Reviewed the collision check independently.");

  const settled = await db.kycCase.findUniqueOrThrow({ where: { id: demoCase().id } });
  assert.equal(settled.status, "approved");
  assert.equal(settled.reasoning, reasoning);

  const history = await db.auditLog.findMany({
    where: { resource: "kyc_case", resourceId: demoCase().id },
    orderBy: { at: "asc" },
  });
  assert.deepEqual(history.map((entry) => entry.outcome), ["proposed", "approved", "executed"]);
  assert.match(JSON.parse(history[2].after ?? "{}").reference, /KYC-DEMO-001/);
});

test("a rejected proposal releases the reservation and keeps the customer state", async () => {
  await db.kycCase.create({ data: demoCase() });
  const proposal = await execute(
    "kyc_case.decide",
    {
      caseId: demoCase().id,
      expectedVersion: 0,
      decision: "approved",
      reasoning: "Screening returned no hit",
      intentKey: "intent-demo-release",
    },
    actors.approver,
  );
  assert.ok(proposal.status === "proposed");

  await decide(proposal.approvalId, "rejected", actors.admin, "Wants the sanctions check re-run");

  const stillPending = await db.kycCase.findUniqueOrThrow({ where: { id: demoCase().id } });
  assert.equal(stillPending.status, "pending");
  assert.equal(stillPending.reasoning, null);
  assert.equal(await db.approvalRequest.count({ where: { activeKey: "active" } }), 0);
  assert.equal(await db.auditLog.count({ where: { outcome: "executed" } }), 0);
});
