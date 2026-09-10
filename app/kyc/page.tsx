import Link from "next/link";
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
const STATUSES = ["pending", "escalated", "approved", "rejected"] as const;
const OPEN_STATUSES = ["pending", "escalated"] as const;

type KycRow = {
  id: string;
  reference: string;
  customerName: string;
  country: string;
  riskScore: number;
  documentType: string;
  status: string;
  submittedAt: Date;
  controls: ActionOption[];
  waitingOn: string;
};

export default async function KycPage({
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
      ? {
          OR: [
            { customerName: { contains: q } },
            { country: { contains: q } },
            { reference: { contains: q } },
          ],
        }
      : {}),
  };

  const [cases, total] = await Promise.all([
    db.kycCase.findMany({
      where,
      orderBy: [{ riskScore: "desc" }, { submittedAt: "asc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.kycCase.count({ where }),
  ]);

  const proposals = await activeProposalsFor(
    "kyc_case",
    cases.map((row) => row.id),
  );

  const rows: KycRow[] = cases.map((row) => {
    const state = {
      record: { id: row.id, status: row.status, version: row.version },
      activeProposal: proposals.get(row.id) ?? null,
    };
    const base = { caseId: row.id, expectedVersion: row.version };

    return {
      ...row,
      waitingOn: nextStep(state),
      controls: controlsFor(
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
          {
            policyKey: "kyc_case.escalate",
            actionKey: "kyc_case.escalate",
            payload: base,
          },
        ],
        actor,
        state,
      ),
    };
  });

  const columns: Column<KycRow>[] = [
    {
      header: "Customer",
      cell: (row) => (
        <Link href={`/kyc/${row.id}`} className="font-semibold underline-offset-2 hover:underline">
          {row.customerName}
          <span className="ml-2 font-mono text-[11px] font-normal text-muted">{row.reference}</span>
        </Link>
      ),
    },
    { header: "Country", cell: (row) => row.country },
    {
      header: "Risk",
      cell: (row) => (
        <span
          className={`text-[13px] font-semibold tabular-nums ${
            row.riskScore >= 70
              ? "text-rose-700"
              : row.riskScore >= 40
                ? "text-amber-700"
                : "text-muted"
          }`}
        >
          {row.riskScore}
        </span>
      ),
    },
    {
      header: "Document",
      className: "hidden xl:table-cell",
      cell: (row) => row.documentType.replaceAll("_", " "),
    },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
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
        title="KYC review queue"
        eyebrow="Compliance"
        subtitle="Decisions are maker-checker: one person proposes with a written reason, a different approver applies it. What each role may do on a given case is decided on the server and shown here, including the refusals."
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total, params: { status } }}
        basePath="/kyc"
        searchPlaceholder="Search customer, reference or country…"
        filters={<StatusFilter value={status} statuses={STATUSES} />}
      />
    </>
  );
}
