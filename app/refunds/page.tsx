import { activeProposalsFor } from "@/platform/approvals";
import { getActor } from "@/platform/auth";
import { db } from "@/platform/db";
import { statusWhere } from "@/platform/filters";
import { nextStep } from "@/platform/policy";
import { ActionControls, type ActionOption } from "@/platform/ui/ActionControls";
import { controlsFor } from "@/platform/ui/controls";
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
  controls: ActionOption[];
  waitingOn: string;
};

export default async function RefundsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string; status?: string }>;
}) {
  const { q, page: pageParam, status: statusParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const status = statusParam ?? "open";
  const actor = await getActor();
  const where = {
    ...statusWhere(status, OPEN_STATUSES),
    ...(q
      ? { OR: [{ customerName: { contains: q } }, { orderId: { contains: q } }] }
      : {}),
  };

  const [refunds, total, exposure] = await Promise.all([
    db.refund.findMany({
      where,
      orderBy: [{ amountCents: "desc" }, { requestedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.refund.count({ where }),
    db.refund.aggregate({ where: { status: "pending" }, _sum: { amountCents: true } }),
  ]);

  const proposals = await activeProposalsFor(
    "refund",
    refunds.map((row) => row.id),
  );

  const rows: RefundRow[] = refunds.map((row) => {
    const state = {
      record: { id: row.id, status: row.status, version: row.version },
      activeProposal: proposals.get(row.id) ?? null,
    };
    const payload = { refundId: row.id, expectedVersion: row.version };

    return {
      ...row,
      waitingOn: nextStep(state),
      controls: controlsFor(
        [
          { policyKey: "refund.approve", actionKey: "refund.approve", payload },
          { policyKey: "refund.reject", actionKey: "refund.reject", payload },
        ],
        actor,
        state,
      ),
    };
  });

  const columns: Column<RefundRow>[] = [
    { header: "Order", cell: (row) => <span className="font-mono text-xs">{row.orderId}</span> },
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
      header: "Waiting on",
      className: "hidden xl:table-cell",
      cell: (row) => <span className="text-xs text-muted">{row.waitingOn}</span>,
    },
    {
      header: "Decision",
      className: "whitespace-nowrap",
      cell: (row) => <ActionControls actions={row.controls} />,
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
