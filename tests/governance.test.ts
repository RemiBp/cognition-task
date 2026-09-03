import assert from "node:assert/strict";
import { after, beforeEach, test } from "node:test";
import "@/platform/registry";
import { execute } from "@/platform/actions";
import { decide } from "@/platform/approvals";
import { db } from "@/platform/db";
import { PolicyError, type Actor } from "@/platform/rbac";

const actors = {
  viewer: { id: "viewer", email: "viewer@test.dev", name: "Viewer", role: "viewer" },
  analyst: { id: "analyst", email: "analyst@test.dev", name: "Analyst", role: "analyst" },
  approver: {
    id: "approver",
    email: "approver@test.dev",
    name: "Approver",
    role: "approver",
  },
  admin: { id: "admin", email: "admin@test.dev", name: "Admin", role: "admin" },
} satisfies Record<string, Actor>;

beforeEach(async () => {
  await db.auditLog.deleteMany();
  await db.approvalRequest.deleteMany();
  await db.kycCase.deleteMany();
  await db.user.deleteMany();

  await db.user.createMany({ data: Object.values(actors) });
  await db.kycCase.create({
    data: {
      id: "kyc-1",
      customerName: "Test Customer",
      country: "FR",
      riskScore: 80,
      documentType: "passport",
    },
  });
});

after(async () => {
  await db.$disconnect();
});

test("a viewer is denied and the attempt is audited", async () => {
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", decision: "approved" },
      actors.viewer,
      { resourceId: "kyc-1" },
    ),
    PolicyError,
  );

  const audit = await db.auditLog.findFirstOrThrow();
  assert.equal(audit.outcome, "denied");
  assert.equal(audit.actorRole, "viewer");
});

test("invalid client payloads are rejected at runtime", async () => {
  await assert.rejects(
    execute(
      "kyc_case.decide",
      { caseId: "kyc-1", decision: "invented-status" },
      actors.analyst,
      { resourceId: "kyc-1" },
    ),
    PolicyError,
  );

  assert.equal(await db.approvalRequest.count(), 0);
  assert.equal(await db.auditLog.count({ where: { outcome: "denied" } }), 1);
});

test("repeated clicks create one pending approval", async () => {
  const payload = { caseId: "kyc-1", decision: "approved" } as const;
  await execute("kyc_case.decide", payload, actors.analyst, { resourceId: "kyc-1" });
  await execute("kyc_case.decide", payload, actors.analyst, { resourceId: "kyc-1" });

  assert.equal(await db.approvalRequest.count({ where: { status: "pending" } }), 1);
});

test("the proposer cannot approve their own request", async () => {
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", decision: "approved" },
    actors.approver,
    { resourceId: "kyc-1" },
  );
  assert.equal(result.status, "proposed");

  await assert.rejects(decide(result.approvalId, "approved", actors.approver), PolicyError);
  assert.equal(
    await db.approvalRequest.count({ where: { id: result.approvalId, status: "pending" } }),
    1,
  );
});

test("a second approver executes the change and records the trail", async () => {
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", decision: "approved" },
    actors.analyst,
    { resourceId: "kyc-1" },
  );
  assert.equal(result.status, "proposed");

  await decide(result.approvalId, "approved", actors.admin, "Reviewed test evidence");

  assert.equal((await db.kycCase.findUniqueOrThrow({ where: { id: "kyc-1" } })).status, "approved");
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
  const result = await execute(
    "kyc_case.decide",
    { caseId: "kyc-1", decision: "approved" },
    actors.analyst,
    { resourceId: "kyc-1" },
  );
  assert.equal(result.status, "proposed");

  const decisions = await Promise.allSettled([
    decide(result.approvalId, "approved", actors.admin),
    decide(result.approvalId, "approved", actors.admin),
  ]);

  assert.equal(decisions.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(decisions.filter((item) => item.status === "rejected").length, 1);
  assert.equal(await db.auditLog.count({ where: { outcome: "approved" } }), 1);
  assert.equal(await db.auditLog.count({ where: { outcome: "executed" } }), 1);
});
