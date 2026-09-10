import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

/**
 * The revision adds required and unique columns to tables that already hold
 * rows, and tightens what a pending proposal has to carry. These tests build a
 * database on the previous schema, populate it, and check both halves of that:
 * every row survives an upgrade, and a proposal that could not survive it
 * stops the upgrade before anything is written rather than being silently
 * carried into a state where nobody can decide it.
 *
 * Each case runs against its own throwaway file, never the development one.
 */

const root = process.cwd();
const files: string[] = [];

type LegacyOptions = {
  /** Payload of the pending proposal, as the old revision would have stored it. */
  pendingPayload?: Record<string, unknown>;
  /** Store the pending proposal without the record it targets. */
  orphanPending?: boolean;
  /** Open a second proposal on the same record, which the new schema forbids. */
  contestedPending?: boolean;
  /** Simulate the old application deciding a proposal while the release runs. */
  decideDuringRelease?: boolean;
};

const COMPATIBLE_PAYLOAD = {
  caseId: "legacy-case-1",
  expectedVersion: 0,
  decision: "approved",
  reasoning: "Screening clean, documents consistent with the declared identity.",
};

/** What the old revision let a reviewer submit: no version, no written reason. */
const INCOMPATIBLE_PAYLOAD = { caseId: "legacy-case-1", decision: "approved" };

function legacyClient(name: string) {
  files.push(name);
  return new PrismaClient({ datasourceUrl: `file:${join(root, "prisma", name)}` });
}

async function buildLegacyDatabase(client: PrismaClient, options: LegacyOptions = {}) {
  const statements = [
    `CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "role" TEXT NOT NULL)`,
    `CREATE TABLE "KycCase" ("id" TEXT PRIMARY KEY, "customerName" TEXT NOT NULL, "country" TEXT NOT NULL, "riskScore" INTEGER NOT NULL, "documentType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT)`,
    `CREATE TABLE "Refund" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "customerName" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "processorRef" TEXT)`,
    `CREATE TABLE "Dispute" ("id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "processorRef" TEXT)`,
    `CREATE TABLE "FeatureFlag" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "rolloutPercent" INTEGER NOT NULL DEFAULT 0, "environment" TEXT NOT NULL DEFAULT 'production', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "actorId" TEXT NOT NULL, "actorEmail" TEXT NOT NULL, "actorRole" TEXT NOT NULL, "action" TEXT NOT NULL, "resource" TEXT NOT NULL, "resourceId" TEXT, "outcome" TEXT NOT NULL, "before" TEXT, "after" TEXT, "reason" TEXT, "requestId" TEXT NOT NULL)`,
    `CREATE TABLE "ApprovalRequest" ("id" TEXT PRIMARY KEY, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "action" TEXT NOT NULL, "resource" TEXT NOT NULL, "resourceId" TEXT, "payload" TEXT NOT NULL, "summary" TEXT NOT NULL, "reason" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "requestedById" TEXT NOT NULL, "decidedById" TEXT, "decidedAt" DATETIME, "decisionNote" TEXT)`,
    `INSERT INTO "User" VALUES ('u1', 'legacy@test.dev', 'Legacy Analyst', 'analyst')`,
    `INSERT INTO "User" VALUES ('u2', 'legacy-approver@test.dev', 'Legacy Approver', 'approver')`,
  ];
  for (const statement of statements) await client.$executeRawUnsafe(statement);

  for (let i = 0; i < 25; i += 1) {
    await client.$executeRawUnsafe(
      `INSERT INTO "KycCase" ("id", "customerName", "country", "riskScore", "documentType", "status") VALUES (?, ?, 'FR', ?, 'passport', 'pending')`,
      `legacy-case-${i}`,
      `Legacy Customer ${i}`,
      i,
    );
  }
  await client.$executeRawUnsafe(
    `INSERT INTO "Refund" ("id", "orderId", "customerName", "amountCents", "reason") VALUES ('legacy-refund', 'NP-9', 'Legacy Customer 1', 1000, 'duplicate charge')`,
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById") VALUES ('legacy-approval', 'kyc_case.decide', 'kyc_case', ?, ?, 'Mark KYC case as approved', 'pending', 'u1')`,
    options.orphanPending ? null : "legacy-case-1",
    JSON.stringify(options.pendingPayload ?? COMPATIBLE_PAYLOAD),
  );
  if (options.contestedPending) {
    await client.$executeRawUnsafe(
      `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById") VALUES ('legacy-approval-2', 'kyc_case.decide', 'kyc_case', 'legacy-case-1', ?, 'Mark KYC case as rejected', 'pending', 'u1')`,
      JSON.stringify({ ...COMPATIBLE_PAYLOAD, decision: "rejected" }),
    );
  }
  await client.$executeRawUnsafe(
    `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById", "decidedById") VALUES ('legacy-decided', 'refund.approve', 'refund', 'legacy-refund', '{"refundId":"legacy-refund"}', 'Approve refund', 'approved', 'u1', 'u1')`,
  );
  if (options.decideDuringRelease) {
    await client.$executeRawUnsafe(
      `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById") VALUES ('legacy-approval-race', 'kyc_case.decide', 'kyc_case', 'legacy-case-2', ?, 'Mark KYC case as approved', 'pending', 'u1')`,
      JSON.stringify({ caseId: "legacy-case-2", decision: "approved" }),
    );
    // The release loop reads every open proposal, then writes them one by one.
    // This trigger approves the second one, record included, at the moment the
    // first is written: exactly the window an application left running would
    // decide in, reproduced deterministically.
    await client.$executeRawUnsafe(
      `CREATE TRIGGER decide_during_release AFTER UPDATE OF "status" ON "ApprovalRequest"
       WHEN NEW."id" = 'legacy-approval'
       BEGIN
         UPDATE "ApprovalRequest" SET "status" = 'approved', "decidedById" = 'u2',
           "decidedAt" = CURRENT_TIMESTAMP WHERE "id" = 'legacy-approval-race';
         UPDATE "KycCase" SET "status" = 'approved' WHERE "id" = 'legacy-case-2';
       END`,
    );
  }
}

function run(command: string, args: string[], database: string) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: `file:${join(root, "prisma", database)}` },
  });
}

function open(database: string) {
  return new PrismaClient({ datasourceUrl: `file:${join(root, "prisma", database)}` });
}

/** Columns the old schema has, so a partial upgrade is visible as their absence. */
async function columnNames(client: PrismaClient, table: string) {
  const rows = await client.$queryRawUnsafe<{ name: string }[]>(`PRAGMA table_info('${table}')`);
  return new Set(rows.map((row) => row.name));
}

after(() => {
  for (const file of files) {
    rmSync(join(root, "prisma", file), { force: true });
    rmSync(join(root, "prisma", `${file}-journal`), { force: true });
  }
});

test("a populated database from the previous revision upgrades without losing data", async () => {
  const name = "upgrade-fixture.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy);
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.equal(upgrade.status, 0, upgrade.stderr);

  const push = run("npx", ["prisma", "db", "push", "--skip-generate"], name);
  assert.equal(push.status, 0, push.stderr);
  assert.doesNotMatch(push.stdout + push.stderr, /force-reset|data will be lost/i);

  const upgraded = open(name);
  try {
    assert.equal(await upgraded.kycCase.count(), 25);
    assert.equal(await upgraded.refund.count(), 1);
    assert.equal(await upgraded.approvalRequest.count(), 2);

    const references = await upgraded.kycCase.findMany({ select: { reference: true } });
    assert.equal(new Set(references.map((row) => row.reference)).size, 25);
    assert.ok(references.every((row) => row.reference.startsWith("KYC-LEGACY-")));

    const pending = await upgraded.approvalRequest.findUniqueOrThrow({
      where: { id: "legacy-approval" },
    });
    assert.equal(pending.activeKey, "active");
    assert.equal(pending.resourceId, "legacy-case-1");
    assert.ok(pending.payloadHash.length > 0 && pending.requestKey.length > 0);

    // A decided proposal must not keep holding a reservation.
    const decided = await upgraded.approvalRequest.findUniqueOrThrow({
      where: { id: "legacy-decided" },
    });
    assert.equal(decided.activeKey, "legacy-decided");
  } finally {
    await upgraded.$disconnect();
  }
});

test("a proposal left pending across the upgrade can still be decided afterwards", async () => {
  const name = "upgrade-continuation.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy);
  await legacy.$disconnect();

  assert.equal(run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name).status, 0);
  assert.equal(run("npx", ["prisma", "db", "push", "--skip-generate"], name).status, 0);

  // Through the application's own decide path, as the approver would: proving
  // the rows survived says nothing about whether the proposal is still usable.
  const decided = run(
    "npx",
    ["tsx", "tests/decide-out-of-process.ts", "legacy-approval", "u2"],
    name,
  );
  assert.equal(decided.status, 0, decided.stderr);

  const client = open(name);
  try {
    const request = await client.approvalRequest.findUniqueOrThrow({
      where: { id: "legacy-approval" },
    });
    assert.equal(request.status, "approved");
    assert.equal(request.activeKey, "legacy-approval");

    const record = await client.kycCase.findUniqueOrThrow({ where: { id: "legacy-case-1" } });
    assert.equal(record.status, "approved");
    assert.equal(record.version, 1);
  } finally {
    await client.$disconnect();
  }
});

test("a pending proposal the current contract cannot satisfy stops the upgrade before it writes", async () => {
  const name = "upgrade-incompatible.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, { pendingPayload: INCOMPATIBLE_PAYLOAD });
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.notEqual(upgrade.status, 0);
  assert.match(upgrade.stderr, /could not be decided after the upgrade/i);
  assert.match(upgrade.stderr, /expectedVersion/);
  assert.match(upgrade.stderr, /reasoning/);
  assert.match(upgrade.stderr, /Nothing has been changed/i);

  const client = open(name);
  try {
    // Nothing at all: no column added, no reference written, no row touched.
    const kyc = await columnNames(client, "KycCase");
    assert.ok(!kyc.has("reference"));
    assert.ok(!kyc.has("version"));
    assert.ok(!kyc.has("updatedAt"));
    const approval = await columnNames(client, "ApprovalRequest");
    assert.ok(!approval.has("activeKey"));

    const rows = await client.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM "KycCase"`,
    );
    assert.equal(Number(rows[0].count), 25);
  } finally {
    await client.$disconnect();
  }

  // And the check the reviewer runs must call this database pre-revision, not
  // half-upgraded, whatever the refused run touched.
  const check = run("npx", ["tsx", "scripts/check-db-revision.ts"], name);
  assert.match(check.stdout + check.stderr, /before the policy revision/i);
  assert.doesNotMatch(check.stdout + check.stderr, /partially/i);
});

test("releasing an incompatible proposal unblocks the upgrade and changes no record", async () => {
  const name = "upgrade-release.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, { pendingPayload: INCOMPATIBLE_PAYLOAD });
  await legacy.$disconnect();

  const release = run(
    "npx",
    ["tsx", "scripts/upgrade-policy-v2.ts", "--release-incompatible"],
    name,
  );
  assert.equal(release.status, 0, release.stderr);

  assert.equal(run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name).status, 0);
  assert.equal(run("npx", ["prisma", "db", "push", "--skip-generate"], name).status, 0);

  const client = open(name);
  try {
    const released = await client.approvalRequest.findUniqueOrThrow({
      where: { id: "legacy-approval" },
    });
    assert.equal(released.status, "rejected");
    assert.notEqual(released.activeKey, "active");

    // Rejecting a proposal leaves its record alone, which is the whole point
    // of releasing rather than deciding: the case is still open to a new one.
    const record = await client.kycCase.findUniqueOrThrow({ where: { id: "legacy-case-1" } });
    assert.equal(record.status, "pending");
    assert.equal(record.version, 0);
  } finally {
    await client.$disconnect();
  }
});

test("releasing does not overwrite a proposal decided while it runs", async () => {
  const name = "upgrade-release-race.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, {
    pendingPayload: INCOMPATIBLE_PAYLOAD,
    decideDuringRelease: true,
  });
  await legacy.$disconnect();

  const release = run(
    "npx",
    ["tsx", "scripts/upgrade-policy-v2.ts", "--release-incompatible"],
    name,
  );
  assert.equal(release.status, 0, release.stderr);
  assert.match(release.stdout, /released 1 pending proposal/);
  assert.match(release.stdout, /skipped 1 proposal\(s\) decided while this ran/);
  assert.match(release.stdout, /legacy-approval-race/);

  const client = open(name);
  try {
    await client.$executeRawUnsafe(`DROP TRIGGER decide_during_release`);

    // The approval that landed in the window keeps its own outcome: its record
    // was changed by it, so calling it rejected would be a lie about the data.
    const raced = await client.$queryRawUnsafe<{ status: string; decisionNote: string | null }[]>(
      `SELECT "status", "decisionNote" FROM "ApprovalRequest" WHERE "id" = 'legacy-approval-race'`,
    );
    assert.equal(raced[0].status, "approved");
    assert.equal(raced[0].decisionNote, null);

    const record = await client.$queryRawUnsafe<{ status: string }[]>(
      `SELECT "status" FROM "KycCase" WHERE "id" = 'legacy-case-2'`,
    );
    assert.equal(record[0].status, "approved");
  } finally {
    await client.$disconnect();
  }
});

test("two pending proposals on one record stop the upgrade", async () => {
  const name = "upgrade-contested.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, { contestedPending: true });
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.notEqual(upgrade.status, 0);
  assert.match(upgrade.stderr, /more than one pending approval/i);

  const client = open(name);
  try {
    assert.ok(!(await columnNames(client, "KycCase")).has("reference"));
  } finally {
    await client.$disconnect();
  }
});

test("the upgrade refuses to guess a missing resource id and leaves the data alone", async () => {
  const name = "upgrade-orphan.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, { orphanPending: true });
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.notEqual(upgrade.status, 0);
  assert.match(upgrade.stderr, /pending approval/i);
  assert.match(upgrade.stderr, /no resource id/i);

  const check = open(name);
  try {
    const rows = await check.$queryRawUnsafe<{ count: number }[]>(
      `SELECT COUNT(*) AS count FROM "KycCase"`,
    );
    assert.equal(Number(rows[0].count), 25);
    assert.ok(!(await columnNames(check, "KycCase")).has("reference"));
  } finally {
    await check.$disconnect();
  }
});
