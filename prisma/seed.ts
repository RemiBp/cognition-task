import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

const FIRST = ["Amelia", "Noah", "Léa", "Tomás", "Ines", "Karim", "Yuki", "Mateo", "Fatima", "Jonas"];
const LAST = ["Okafor", "Lindqvist", "Moreau", "Duarte", "Ferrari", "Haddad", "Tanaka", "Novak", "Bauer", "Kowalski"];
const COUNTRIES = ["FR", "DE", "GB", "PT", "PL", "NG", "JP", "BR", "MA", "SE"];
const DOCUMENTS = ["passport", "national_id", "residence_permit", "driving_licence"];
const REFUND_REASONS = [
  "duplicate charge",
  "service not delivered",
  "chargeback pre-empted",
  "pricing error",
  "customer goodwill",
];

const pick = <T,>(list: T[], index: number) => list[index % list.length];

async function main() {
  await db.auditLog.deleteMany();
  await db.approvalRequest.deleteMany();
  await db.kycCase.deleteMany();
  await db.refund.deleteMany();
  await db.featureFlag.deleteMany();
  await db.user.deleteMany();

  await db.user.createMany({
    data: [
      { email: "dana.viewer@northwindpay.com", name: "Dana Reyes", role: "viewer" },
      { email: "sam.analyst@northwindpay.com", name: "Sam Okonjo", role: "analyst" },
      { email: "priya.approver@northwindpay.com", name: "Priya Raman", role: "approver" },
      { email: "alex.admin@northwindpay.com", name: "Alex Fournier", role: "admin" },
    ],
  });

  // 240 KYC cases: enough that client-side filtering would be the wrong answer.
  await db.kycCase.createMany({
    data: Array.from({ length: 240 }, (_, i) => ({
      customerName: `${pick(FIRST, i)} ${pick(LAST, i * 3 + 1)}`,
      country: pick(COUNTRIES, i * 7),
      riskScore: (i * 37) % 100,
      documentType: pick(DOCUMENTS, i),
      status: i % 5 === 0 ? "approved" : i % 11 === 0 ? "escalated" : "pending",
      submittedAt: new Date(Date.now() - i * 3_600_000),
      notes: i % 9 === 0 ? "Adverse media hit requires manual review." : null,
    })),
  });

  await db.refund.createMany({
    data: Array.from({ length: 120 }, (_, i) => ({
      orderId: `NP-${String(100_000 + i * 13)}`,
      customerName: `${pick(FIRST, i * 5)} ${pick(LAST, i)}`,
      amountCents: 1_500 + ((i * 8_437) % 250_000),
      currency: i % 8 === 0 ? "GBP" : "EUR",
      reason: pick(REFUND_REASONS, i),
      status: i % 4 === 0 ? "approved" : i % 7 === 0 ? "rejected" : "pending",
      requestedAt: new Date(Date.now() - i * 5_400_000),
      processorRef: i % 4 === 0 ? `psp_np${100_000 + i * 13}` : null,
    })),
  });

  await db.featureFlag.createMany({
    data: [
      { key: "instant_payouts", description: "Same-day payout rail for verified merchants", enabled: true, rolloutPercent: 100 },
      { key: "kyc_auto_approve_low_risk", description: "Skip manual review under risk score 20", enabled: false },
      { key: "refund_self_service", description: "Let customers request refunds in-app", enabled: true, rolloutPercent: 100 },
      { key: "new_onboarding_flow", description: "Rebuilt merchant onboarding wizard", enabled: false, rolloutPercent: 0, environment: "staging" },
      { key: "sca_step_up", description: "Strong customer authentication step-up challenge", enabled: true, rolloutPercent: 100 },
      { key: "ledger_v2_reads", description: "Read balances from the v2 ledger", enabled: false },
    ],
  });

  const counts = {
    users: await db.user.count(),
    kycCases: await db.kycCase.count(),
    refunds: await db.refund.count(),
    flags: await db.featureFlag.count(),
  };
  console.log("Seeded", counts);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
