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
        subtitle={`${total} entries. Append-only, written by the action layer rather than by each app, which is why a denied attempt is recorded too.`}
      />

      <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 font-medium">When</th>
              <th className="px-3 py-2 font-medium">Actor</th>
              <th className="px-3 py-2 font-medium">Action</th>
              <th className="px-3 py-2 font-medium">Outcome</th>
              <th className="px-3 py-2 font-medium">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id} className="border-b border-slate-100 last:border-0">
                <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">
                  {entry.at.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-3 py-2 text-xs">
                  {entry.actorEmail}
                  <span className="ml-1 rounded bg-slate-100 px-1">{entry.actorRole}</span>
                </td>
                <td className="px-3 py-2 font-mono text-xs">{entry.action}</td>
                <td className="px-3 py-2">
                  <StatusBadge value={entry.outcome} />
                </td>
                <td className="px-3 py-2 font-mono text-[11px] text-slate-600">
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
