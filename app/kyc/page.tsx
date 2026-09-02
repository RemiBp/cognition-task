import { db } from "@/platform/db";
import { statusWhere } from "@/platform/filters";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { StatusFilter } from "@/platform/ui/StatusFilter";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 10;
const STATUSES = ["pending", "escalated", "approved", "rejected"] as const;
const OPEN_STATUSES = ["pending", "escalated"] as const;

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
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const { q, page: pageParam, status: statusParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const status = statusParam ?? "open";
  const where = {
    ...statusWhere(status, OPEN_STATUSES),
    ...(q
      ? { OR: [{ customerName: { contains: q } }, { country: { contains: q } }] }
      : {}),
  };

  const [rows, total] = await Promise.all([
    db.kycCase.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { submittedAt: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.kycCase.count({ where }),
  ]);

  const columns: Column<KycRow>[] = [
    { header: "Customer", cell: (row) => <span className="font-bold">{row.customerName}</span> },
    { header: "Country", cell: (row) => row.country },
    {
      header: "Risk",
      cell: (row) => (
        <span
          className={`inline-flex min-w-8 justify-center rounded-md px-2 py-0.5 text-xs font-extrabold tabular-nums ${
            row.riskScore >= 70
              ? "bg-rose-50 text-rose-700"
              : row.riskScore >= 40
                ? "bg-amber-50 text-amber-700"
                : "bg-zinc-100 text-muted"
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
        <span className="text-xs tabular-nums text-muted">
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
          <span className="text-xs text-muted">decided</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="KYC review queue"
        eyebrow="Compliance"
        subtitle="Approvals and rejections are maker-checker: an analyst proposes, a different user holding an approver role decides. Escalation is not sensitive, so it applies immediately."
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total, params: { status } }}
        basePath="/kyc"
        searchPlaceholder="Search customer or country…"
        filters={<StatusFilter value={status} statuses={STATUSES} />}
      />
    </>
  );
}
