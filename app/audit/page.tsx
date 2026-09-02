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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/60 text-left text-[11px] uppercase tracking-wider text-slate-500">
              <th className="px-4 py-2.5 font-semibold">When</th>
              <th className="px-4 py-2.5 font-semibold">Actor</th>
              <th className="px-4 py-2.5 font-semibold">Action</th>
              <th className="px-4 py-2.5 font-semibold">Outcome</th>
              <th className="px-4 py-2.5 font-semibold">Change</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr
                key={entry.id}
                className="border-b border-slate-100 transition last:border-0 hover:bg-slate-50"
              >
                <td className="whitespace-nowrap px-4 py-2.5 text-xs tabular-nums text-slate-500">
                  {entry.at.toISOString().slice(0, 19).replace("T", " ")}
                </td>
                <td className="px-4 py-2.5 text-xs text-slate-700">
                  {entry.actorEmail}
                  <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-600">
                    {entry.actorRole}
                  </span>
                </td>
                <td className="px-4 py-2.5 font-mono text-xs text-slate-700">{entry.action}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge value={entry.outcome} />
                </td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-slate-600">
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
