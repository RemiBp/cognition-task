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
        subtitle="One shared maker-checker queue for every app on the platform. The decider must hold an approver role and must not be the person who proposed the change."
      />

      {!mayDecide && (
        <div className="mb-4 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          You are signed in as <span className="font-medium">{actor.role}</span>, which cannot
          decide on proposals. Switch the demo identity to an approver or admin.
        </div>
      )}

      <div className="space-y-3">
        {pending.length === 0 && (
          <Card>
            <p className="text-sm text-slate-500">Nothing pending.</p>
          </Card>
        )}
        {pending.map((request) => (
          <Card key={request.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="text-sm font-medium">{request.summary}</div>
                <div className="mt-1 text-xs text-slate-500">
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
          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Recently decided
          </h2>
          <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <tbody>
                {decided.map((request) => (
                  <tr key={request.id} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{request.summary}</td>
                    <td className="px-3 py-2">
                      <StatusBadge value={request.status} />
                    </td>
                    <td className="px-3 py-2 text-xs text-slate-500">
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
