import Link from "next/link";
import { notFound } from "next/navigation";
import { getActor } from "@/platform/auth";
import { db } from "@/platform/db";
import { loadPolicyState, nextStep } from "@/platform/policy";
import { ActionControls } from "@/platform/ui/ActionControls";
import { controlsFor } from "@/platform/ui/controls";
import { Card, PageHeader, StatusBadge } from "@/platform/ui/primitives";

/** One case, everything a reviewer needs to justify a decision, and its trail. */
export default async function KycCasePage({
  params,
}: {
  params: Promise<{ caseId: string }>;
}) {
  const { caseId } = await params;
  const actor = await getActor();

  const kycCase = await db.kycCase.findFirst({
    where: { OR: [{ id: caseId }, { reference: caseId }] },
  });
  if (!kycCase) notFound();

  const state = await loadPolicyState("kyc_case", kycCase.id);
  const [history, proposals] = await Promise.all([
    db.auditLog.findMany({
      where: { resource: "kyc_case", resourceId: kycCase.id },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: 25,
    }),
    db.approvalRequest.findMany({
      where: { resource: "kyc_case", resourceId: kycCase.id },
      include: { requestedBy: true, decidedBy: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    }),
  ]);

  const base = { caseId: kycCase.id, expectedVersion: kycCase.version };
  const controls = controlsFor(
    [
      {
        policyKey: "kyc_case.decide.approved",
        actionKey: "kyc_case.decide",
        payload: { ...base, decision: "approved" },
      },
      {
        policyKey: "kyc_case.decide.rejected",
        actionKey: "kyc_case.decide",
        payload: { ...base, decision: "rejected" },
      },
      { policyKey: "kyc_case.escalate", actionKey: "kyc_case.escalate", payload: base },
    ],
    actor,
    state,
  );

  return (
    <>
      <PageHeader
        title={kycCase.customerName}
        eyebrow="KYC case"
        subtitle={`${kycCase.reference} · ${kycCase.country} · risk ${kycCase.riskScore} · submitted ${kycCase.submittedAt.toISOString().slice(0, 10)}`}
        right={
          <Link href="/kyc" className="text-sm text-muted underline-offset-2 hover:underline">
            Back to queue
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-ink">Evidence reviewed</h2>
            <StatusBadge value={kycCase.status} />
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {kycCase.evidenceSummary ??
              "No evidence summary was recorded when this case was created."}
          </p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.14em] text-muted">
            Synthetic data. The platform stores no identity documents and performs no verification.
          </p>

          <h3 className="mt-6 text-sm font-bold text-ink">Reasoning on file</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            {kycCase.reasoning ?? "No reviewer has recorded a reason yet."}
          </p>

          <h3 className="mt-6 text-sm font-bold text-ink">Next step</h3>
          <p className="mt-2 text-sm text-muted">{nextStep(state)}</p>

          <div className="mt-5 border-t border-line pt-5">
            <ActionControls actions={controls} />
          </div>
        </Card>

        <Card>
          <h2 className="text-sm font-bold text-ink">Proposals</h2>
          <ul className="mt-3 space-y-3">
            {proposals.length === 0 && (
              <li className="text-sm text-muted">No proposal has been raised on this case.</li>
            )}
            {proposals.map((proposal) => (
              <li key={proposal.id} className="border-b border-line pb-3 last:border-0 last:pb-0">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] font-semibold text-ink">{proposal.summary}</span>
                  <StatusBadge value={proposal.status} />
                </div>
                <div className="mt-1 text-xs text-muted">{proposal.subject}</div>
                {proposal.reason && (
                  <div className="mt-1 text-xs text-muted">Reason: {proposal.reason}</div>
                )}
                <div className="mt-1 text-[11px] text-muted">
                  Proposed by {proposal.requestedBy.name}
                  {proposal.decidedBy && ` · decided by ${proposal.decidedBy.name}`}
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <Card className="mt-4">
        <h2 className="text-sm font-bold text-ink">Case history</h2>
        <ul className="mt-3 space-y-2">
          {history.map((entry) => (
            <li key={entry.id} className="flex flex-wrap items-baseline gap-2 text-xs">
              <span className="tabular-nums text-muted">
                {entry.at.toISOString().replace("T", " ").slice(0, 19)}
              </span>
              <StatusBadge value={entry.outcome} />
              <span className="font-medium text-ink">{entry.action}</span>
              <span className="text-muted">
                {kycCase.reference} · {kycCase.customerName}
              </span>
              <span className="text-muted">by {entry.actorEmail}</span>
              {entry.reason && <span className="text-muted">· {entry.reason}</span>}
            </li>
          ))}
          {history.length === 0 && <li className="text-sm text-muted">Nothing recorded yet.</li>}
        </ul>
      </Card>
    </>
  );
}
