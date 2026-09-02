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
        subtitle={`${total} entries. Append-only, written by the action layer rather than by each app, which is why a denied attempt is recorded too.`}
      />

      <div className="overflow-hidden rounded-lg border border-line bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-left text-[10px] uppercase tracking-[0.14em] text-muted">
              <th className="px-4 py-3 font-extrabold">When</th>
              <th className="px-4 py-3 font-extrabold">Actor</th>
              <th className="px-4 py-3 font-extrabold">Action</th>
              <th className="px-4 py-3 font-extrabold">Outcome</th>
              <th className="px-4 py-3 font-extrabold">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-line transition last:border-0 hover:bg-brand-50/50"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-muted">
                  {entry.at.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 text-xs text-ink">
                  {entry.actorEmail}
                  <span className="ml-1.5 rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.1em] text-brand-900">
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
