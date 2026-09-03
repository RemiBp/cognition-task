import { db } from "@/platform/db";
import { statusWhere } from "@/platform/filters";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { StatusFilter } from "@/platform/ui/StatusFilter";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 10;
const STATUSES = ["open", "refunded", "closed"] as const;
const OPEN_STATUSES = ["open"] as const;

type DisputeRow = {
  id: string;
  reference: string;
  customerName: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: string;
  processorRef: string | null;
};

export default async function DisputesPage({
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
      ? { OR: [{ customerName: { contains: q } }, { reference: { contains: q } }] }
      : {}),
  };

  const [rows, total, exposure] = await Promise.all([
    db.dispute.findMany({
      where,
      orderBy: [{ amountCents: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.dispute.count({ where }),
    db.dispute.aggregate({ where: { status: "open" }, _sum: { amountCents: true } }),
  ]);

  const columns: Column<DisputeRow>[] = [
    { header: "Reference", cell: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { header: "Customer", cell: (row) => <span className="font-medium">{row.customerName}</span> },
    {
      header: "Amount",
      cell: (row) => (
        <span className="font-semibold tabular-nums text-ink">
          {(row.amountCents / 100).toFixed(2)} {row.currency}
        </span>
      ),
    },
    { header: "Reason", cell: (row) => row.reason },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    {
      header: "Processor ref",
      cell: (row) => <span className="font-mono text-[11px] text-muted">{row.processorRef ?? "—"}</span>,
    },
    {
      header: "Decision",
      className: "whitespace-nowrap",
      cell: (row) =>
        row.status === "open" ? (
          <span className="flex gap-1.5">
            <ActionButton
              actionKey="dispute.refund"
              payload={{ disputeId: row.id }}
              resourceId={row.id}
              label="Refund"
            />
            <ActionButton
              actionKey="dispute.close"
              payload={{ disputeId: row.id }}
              resourceId={row.id}
              label="Close"
              variant="quiet"
            />
          </span>
        ) : (
          <span className="text-xs text-muted">settled</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Disputes queue"
        eyebrow="Support"
        subtitle={`Open exposure: ${((exposure._sum.amountCents ?? 0) / 100).toFixed(2)} EUR. Refunding a dispute moves money, so a support agent proposes and a second approver executes; closing without a refund is admin-only and immediate.`}
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total, params: { status } }}
        basePath="/disputes"
        searchPlaceholder="Search customer or reference…"
        filters={<StatusFilter value={status} statuses={STATUSES} />}
      />
    </>
  );
}
