import { db } from "@/platform/db";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 10;

type KycRow = {
  id: string;
  customerName: string;
  country: string;
  riskScore: number;
  documentType: string;
  status: string;
  submittedAt: Date;
};

export default async function KycPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const where = q
    ? { OR: [{ customerName: { contains: q } }, { country: { contains: q } }] }
    : {};

  const [rows, total] = await Promise.all([
    db.kycCase.findMany({
      where,
      orderBy: [{ status: "asc" }, { riskScore: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.kycCase.count({ where }),
  ]);

  const columns: Column<KycRow>[] = [
    { header: "Customer", cell: (row) => <span className="font-medium">{row.customerName}</span> },
    { header: "Country", cell: (row) => row.country },
    {
      header: "Risk",
      cell: (row) => (
        <span
          className={`inline-flex min-w-8 justify-center rounded-md px-1.5 py-0.5 text-xs font-semibold tabular-nums ${
            row.riskScore >= 70
              ? "bg-rose-50 text-rose-700"
              : row.riskScore >= 40
                ? "bg-amber-50 text-amber-700"
                : "bg-slate-100 text-slate-600"
          }`}
        >
          {row.riskScore}
        </span>
      ),
    },
    { header: "Document", cell: (row) => row.documentType },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    {
      header: "Submitted",
      cell: (row) => (
        <span className="text-xs tabular-nums text-slate-500">
          {row.submittedAt.toISOString().slice(0, 10)}
        </span>
      ),
    },
    {
      header: "Decision",
      className: "whitespace-nowrap",
      cell: (row) =>
        row.status === "pending" || row.status === "escalated" ? (
          <span className="flex gap-1.5">
            <ActionButton
              actionKey="kyc_case.decide"
              payload={{ caseId: row.id, decision: "approved" }}
              resourceId={row.id}
              label="Approve"
            />
            <ActionButton
              actionKey="kyc_case.decide"
              payload={{ caseId: row.id, decision: "rejected" }}
              resourceId={row.id}
              label="Reject"
              variant="danger"
            />
            {row.status === "pending" && (
              <ActionButton
                actionKey="kyc_case.escalate"
                payload={{ caseId: row.id }}
                resourceId={row.id}
                label="Escalate"
                variant="quiet"
              />
            )}
          </span>
        ) : (
          <span className="text-xs text-slate-400">decided</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="KYC review queue"
        subtitle="Approvals and rejections are maker-checker: an analyst proposes, a different user holding an approver role decides. Escalation is not sensitive, so it applies immediately."
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total }}
        basePath="/kyc"
        searchPlaceholder="Search customer or country…"
      />
    </>
  );
}
