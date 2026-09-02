import { db } from "@/platform/db";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 10;

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
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const where = q
    ? { OR: [{ customerName: { contains: q } }, { orderId: { contains: q } }] }
    : {};

  const [rows, total, exposure] = await Promise.all([
    db.refund.findMany({
      where,
      orderBy: [{ status: "asc" }, { amountCents: "desc" }],
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
        <span className="font-medium tabular-nums text-slate-900">
          {(row.amountCents / 100).toFixed(2)} {row.currency}
        </span>
      ),
    },
    { header: "Reason", cell: (row) => row.reason },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    {
      header: "Processor ref",
      cell: (row) => <span className="font-mono text-[11px] text-slate-500">{row.processorRef ?? "—"}</span>,
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
          <span className="text-xs text-slate-400">decided</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Refunds dashboard"
        subtitle={`Pending exposure: ${((exposure._sum.amountCents ?? 0) / 100).toFixed(2)} EUR. Approving a refund moves money, so it requires a second approver; rejecting does not.`}
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total }}
        basePath="/refunds"
        searchPlaceholder="Search customer or order…"
      />
    </>
  );
}
