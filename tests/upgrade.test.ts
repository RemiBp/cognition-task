import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { join } from "node:path";
import { after, test } from "node:test";
import { PrismaClient } from "@prisma/client";

/**
 * The revision adds required and unique columns to tables that already hold
 * rows. These tests build a database on the previous schema, populate it, and
 * check that the upgrade path preserves every row: a reviewer with an existing
 * database must never be told to reset it.
 *
 * Each case runs against its own throwaway file, never the development one.
 */

const root = process.cwd();
const files: string[] = [];

function legacyClient(name: string) {
  files.push(name);
  return new PrismaClient({ datasourceUrl: `file:${join(root, "prisma", name)}` });
}

async function buildLegacyDatabase(client: PrismaClient, orphanPending: boolean) {
  const statements = [
    `CREATE TABLE "User" ("id" TEXT PRIMARY KEY, "email" TEXT NOT NULL UNIQUE, "name" TEXT NOT NULL, "role" TEXT NOT NULL)`,
    `CREATE TABLE "KycCase" ("id" TEXT PRIMARY KEY, "customerName" TEXT NOT NULL, "country" TEXT NOT NULL, "riskScore" INTEGER NOT NULL, "documentType" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "submittedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "notes" TEXT)`,
    `CREATE TABLE "Refund" ("id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "customerName" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'pending', "requestedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "processorRef" TEXT)`,
    `CREATE TABLE "Dispute" ("id" TEXT PRIMARY KEY, "reference" TEXT NOT NULL UNIQUE, "customerName" TEXT NOT NULL, "amountCents" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'EUR', "reason" TEXT NOT NULL, "status" TEXT NOT NULL DEFAULT 'open', "openedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "processorRef" TEXT)`,
    `CREATE TABLE "FeatureFlag" ("id" TEXT PRIMARY KEY, "key" TEXT NOT NULL UNIQUE, "description" TEXT NOT NULL, "enabled" BOOLEAN NOT NULL DEFAULT false, "rolloutPercent" INTEGER NOT NULL DEFAULT 0, "environment" TEXT NOT NULL DEFAULT 'production', "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP)`,
    `CREATE TABLE "AuditLog" ("id" TEXT PRIMARY KEY, "at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "actorId" TEXT NOT NULL, "actorEmail" TEXT NOT NULL, "actorRole" TEXT NOT NULL, "action" TEXT NOT NULL, "resource" TEXT NOT NULL, "resourceId" TEXT, "outcome" TEXT NOT NULL, "before" TEXT, "after" TEXT, "reason" TEXT, "requestId" TEXT NOT NULL)`,
    `CREATE TABLE "ApprovalRequest" ("id" TEXT PRIMARY KEY, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, "action" TEXT NOT NULL, "resource" TEXT NOT NULL, "resourceId" TEXT, "payload" TEXT NOT NULL, "summary" TEXT NOT NULL, "reason" TEXT, "status" TEXT NOT NULL DEFAULT 'pending', "requestedById" TEXT NOT NULL, "decidedById" TEXT, "decidedAt" DATETIME, "decisionNote" TEXT)`,
    `INSERT INTO "User" VALUES ('u1', 'legacy@test.dev', 'Legacy Analyst', 'analyst')`,
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
    `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById") VALUES ('legacy-approval', 'kyc_case.decide', 'kyc_case', ?, '{"caseId":"legacy-case-1","decision":"approved"}', 'Mark KYC case as approved', 'pending', 'u1')`,
    orphanPending ? null : "legacy-case-1",
  );
  await client.$executeRawUnsafe(
    `INSERT INTO "ApprovalRequest" ("id", "action", "resource", "resourceId", "payload", "summary", "status", "requestedById", "decidedById") VALUES ('legacy-decided', 'refund.approve', 'refund', 'legacy-refund', '{"refundId":"legacy-refund"}', 'Approve refund', 'approved', 'u1', 'u1')`,
  );
}

function run(command: string, args: string[], database: string) {
  return spawnSync(command, args, {
    cwd: root,
    encoding: "utf8",
    env: { ...process.env, DATABASE_URL: `file:${join(root, "prisma", database)}` },
  });
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
  await buildLegacyDatabase(legacy, false);
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.equal(upgrade.status, 0, upgrade.stderr);

  const push = run("npx", ["prisma", "db", "push", "--skip-generate"], name);
  assert.equal(push.status, 0, push.stderr);
  assert.doesNotMatch(push.stdout + push.stderr, /force-reset|data will be lost/i);

  const upgraded = new PrismaClient({ datasourceUrl: `file:${join(root, "prisma", name)}` });
  try {
    assert.equal(await upgraded.kycCase.count(), 25);
    assert.equal(await upgraded.refund.count(), 1);
    assert.equal(await upgraded.approvalRequest.count(), 2);

    const references = await upgraded.kycCase.findMany({ select: { reference: true } });
    assert.equal(new Set(references.map((row) => row.reference)).size, 25);
    assert.ok(references.every((row) => row.reference.startsWith("KYC-LEGACY-")));

    const pending = await upgraded.approvalRequest.findUniqueOrThrow({ where: { id: "legacy-approval" } });
    assert.equal(pending.activeKey, "active");
    assert.equal(pending.resourceId, "legacy-case-1");
    assert.ok(pending.payloadHash.length > 0 && pending.requestKey.length > 0);

    // A decided proposal must not keep holding a reservation.
    const decided = await upgraded.approvalRequest.findUniqueOrThrow({ where: { id: "legacy-decided" } });
    assert.equal(decided.activeKey, "legacy-decided");
  } finally {
    await upgraded.$disconnect();
  }
});

test("the upgrade refuses to guess a missing resource id and leaves the data alone", async () => {
  const name = "upgrade-orphan.db";
  const legacy = legacyClient(name);
  await buildLegacyDatabase(legacy, true);
  await legacy.$disconnect();

  const upgrade = run("npx", ["tsx", "scripts/upgrade-policy-v2.ts"], name);
  assert.notEqual(upgrade.status, 0);
  assert.match(upgrade.stderr, /pending approval/i);
  assert.match(upgrade.stderr, /previous revision/i);

  const check = new PrismaClient({ datasourceUrl: `file:${join(root, "prisma", name)}` });
  try {
    const rows = await check.$queryRawUnsafe<{ count: number }[]>(`SELECT COUNT(*) AS count FROM "KycCase"`);
    assert.equal(Number(rows[0].count), 25);
  } finally {
    await check.$disconnect();
  }
});
