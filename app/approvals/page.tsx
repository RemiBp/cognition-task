import { getActor } from "@/platform/auth";
import { decidedApprovals, pendingApprovals } from "@/platform/approvals";
import { can } from "@/platform/rbac";
import { Card, PageHeader, StatusBadge } from "@/platform/ui/primitives";
import { DecisionButtons } from "./DecisionButtons";

export default async function ApprovalsPage() {
  const [actor, pending, decided] = await Promise.all([
    getActor(),
    pendingApprovals(),
    decidedApprovals(),
  ]);

  const mayDecide = can(actor, "approval.decide");

  return (
    <>
      <PageHeader
        title="Approvals"
        eyebrow="Maker-checker"
        subtitle="One shared maker-checker queue for every app on the platform. The decider must hold an approver role and must not be the person who proposed the change."
      />

      {!mayDecide && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          You are signed in as <span className="font-medium">{actor.role}</span>, which cannot
          decide on proposals. Switch the demo identity to an approver or admin.
        </div>
      )}

      <div className="space-y-3">
        {pending.length === 0 && (
          <Card>
            <p className="text-sm text-muted">Nothing pending.</p>
          </Card>
        )}
        {pending.map((request) => (
          <Card key={request.id} className="border-l-[3px] border-l-brand-500">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-[15px] font-bold text-ink">{request.summary}</div>
                <div className="mt-1 text-xs text-muted">
                  <span className="font-mono">{request.action}</span> · proposed by{" "}
                  {request.requestedBy.name} ({request.requestedBy.role}) ·{" "}
                  {request.createdAt.toISOString().slice(0, 16).replace("T", " ")}
                </div>
              </div>
              {mayDecide && <DecisionButtons approvalId={request.id} />}
            </div>
          </Card>
        ))}
      </div>

      {decided.length > 0 && (
        <>
          <h2 className="mt-10 mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted">
            Recently decided
          </h2>
          <div className="overflow-hidden rounded-lg border border-line bg-white">
            <table className="w-full text-sm">
              <tbody>
                {decided.map((request) => (
                  <tr
                    key={request.id}
                    className="border-b border-line transition last:border-0 hover:bg-brand-50/50"
                  >
                    <td className="px-4 py-3">{request.summary}</td>
                    <td className="px-4 py-3">
                      <StatusBadge value={request.status} />
                    </td>
                    <td className="px-4 py-3 text-xs text-muted">
                      {request.requestedBy.name} → {request.decidedBy?.name ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}
