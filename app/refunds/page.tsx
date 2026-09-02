import { db } from "@/platform/db";
import { statusWhere } from "@/platform/filters";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { StatusFilter } from "@/platform/ui/StatusFilter";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 10;
const STATUSES = ["pending", "approved", "rejected"] as const;
const OPEN_STATUSES = ["pending"] as const;

type RefundRow = {
  id: string;
  orderId: string;
  customerName: string;
  amountCents: number;
  currency: string;
  reason: string;
  status: string;
  processorRef: string | null;
};

export default async function RefundsPage({
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
      ? { OR: [{ customerName: { contains: q } }, { orderId: { contains: q } }] }
      : {}),
  };

  const [rows, total, exposure] = await Promise.all([
    db.refund.findMany({
      where,
      orderBy: [{ amountCents: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.refund.count({ where }),
    db.refund.aggregate({ where: { status: "pending" }, _sum: { amountCents: true } }),
  ]);

  const columns: Column<RefundRow>[] = [
    { header: "Order", cell: (row) => <span className="font-mono text-xs">{row.orderId}</span> },
    { header: "Customer", cell: (row) => <span className="font-medium">{row.customerName}</span> },
    {
      header: "Amount",
      cell: (row) => (
        <span className="font-extrabold tabular-nums text-ink">
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
        row.status === "pending" ? (
          <span className="flex gap-1.5">
            <ActionButton
              actionKey="refund.approve"
              payload={{ refundId: row.id }}
              resourceId={row.id}
              label="Approve"
            />
            <ActionButton
              actionKey="refund.reject"
              payload={{ refundId: row.id }}
              resourceId={row.id}
              label="Reject"
              variant="danger"
            />
          </span>
        ) : (
          <span className="text-xs text-muted">decided</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Refunds dashboard"
        eyebrow="Payments ops"
        subtitle={`Pending exposure: ${((exposure._sum.amountCents ?? 0) / 100).toFixed(2)} EUR. Approving a refund moves money, so it requires a second approver; rejecting does not.`}
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total, params: { status } }}
        basePath="/refunds"
        searchPlaceholder="Search customer or order…"
        filters={<StatusFilter value={status} statuses={STATUSES} />}
      />
    </>
  );
}
