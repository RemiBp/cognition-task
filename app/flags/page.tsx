import { db } from "@/platform/db";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 15;

type FlagRow = {
  id: string;
  key: string;
  description: string;
  enabled: boolean;
  rolloutPercent: number;
  environment: string;
  updatedAt: Date;
};

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const where = q ? { OR: [{ key: { contains: q } }, { description: { contains: q } }] } : {};

  const [rows, total] = await Promise.all([
    db.featureFlag.findMany({
      where,
      orderBy: { key: "asc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.featureFlag.count({ where }),
  ]);

  const columns: Column<FlagRow>[] = [
    { header: "Key", cell: (row) => <span className="font-mono text-xs">{row.key}</span> },
    { header: "Description", cell: (row) => row.description },
    { header: "Environment", cell: (row) => row.environment },
    { header: "State", cell: (row) => <StatusBadge value={row.enabled ? "enabled" : "disabled"} /> },
    { header: "Rollout", cell: (row) => `${row.rolloutPercent}%` },
    {
      header: "Updated",
      cell: (row) => row.updatedAt.toISOString().slice(0, 16).replace("T", " "),
    },
    {
      header: "Action",
      cell: (row) => (
        <ActionButton
          actionKey="feature_flag.toggle"
          payload={{ flagId: row.id, enabled: !row.enabled }}
          resourceId={row.id}
          label={row.enabled ? "Disable" : "Enable"}
          variant={row.enabled ? "danger" : "default"}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Feature flag admin"
        subtitle="Admin-only, and applied immediately — a deliberately different risk posture from KYC and refunds. It still inherits the same audit trail, because every app writes through the same action layer."
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total }}
        basePath="/flags"
        searchPlaceholder="Search flag key…"
      />
    </>
  );
}
