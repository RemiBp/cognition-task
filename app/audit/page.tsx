import { db } from "@/platform/db";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 30;

function diff(before: string | null, after: string | null) {
  if (!before && !after) return null;
  const parse = (value: string | null) => {
    if (!value) return {} as Record<string, unknown>;
    try {
      return JSON.parse(value) as Record<string, unknown>;
    } catch {
      return {} as Record<string, unknown>;
    }
  };
  const b = parse(before);
  const a = parse(after);
  const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter(
    (key) => JSON.stringify(b[key]) !== JSON.stringify(a[key]),
  );
  if (keys.length === 0) return null;
  return keys
    .map((key) => `${key}: ${JSON.stringify(b[key]) ?? "—"} → ${JSON.stringify(a[key])}`)
    .join("  ·  ");
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));

  const [entries, total] = await Promise.all([
    db.auditLog.findMany({
      orderBy: { at: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.auditLog.count(),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        eyebrow="Platform"
        subtitle={`${total} entries. Written centrally by the action layer, including denied attempts. Production would enforce immutability in the database or an external audit sink.`}
      />

      <div className="overflow-x-auto rounded-sm border border-line bg-white">
        <table className="min-w-[900px] w-full text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.16em] text-muted">
              <th className="px-4 py-3 font-semibold">When</th>
              <th className="px-4 py-3 font-semibold">Actor</th>
              <th className="px-4 py-3 font-semibold">Action</th>
              <th className="px-4 py-3 font-semibold">Outcome</th>
              <th className="px-4 py-3 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-line/60 transition last:border-0 hover:bg-canvas"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted">
                  {entry.at.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink">
                  {entry.actorEmail}
                  <span className="ml-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
                    {entry.actorRole}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-ink">{entry.action}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge value={entry.outcome} />
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-muted">
                  {diff(entry.before, entry.after) ?? entry.reason ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
