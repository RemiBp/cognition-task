import { db } from "@/platform/db";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";
import { FlagControl } from "./FlagControl";

function displayName(key: string) {
  return key
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export default async function FlagsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const where = q ? { OR: [{ key: { contains: q } }, { description: { contains: q } }] } : {};
  const rows = await db.featureFlag.findMany({ where, orderBy: { key: "asc" } });

  return (
    <>
      <PageHeader
        title="Feature flag admin"
        eyebrow="Engineering"
        subtitle="A purpose-built control surface on top of the same platform policy and audit path. Only administrators can change production flags."
        right={
          <div className="hidden rounded-lg border border-brand-100 bg-brand-50 px-4 py-3 text-right lg:block">
            <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-brand-700">
              Active policy
            </div>
            <div className="mt-1 text-sm font-bold text-brand-950">Admin only · audited</div>
          </div>
        }
      />

      <section className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(0,16,18,0.03)]">
        <form action="/flags" className="flex items-center gap-2 border-b border-line px-5 py-4">
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search flags…"
            aria-label="Search flags"
            className="h-10 w-full max-w-sm rounded-md border border-line bg-white px-3.5 text-sm outline-none placeholder:text-ink/35 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
          />
          <button
            type="submit"
            className="inline-flex h-10 items-center rounded-md bg-brand-900 px-4 text-[13px] font-semibold text-white transition hover:bg-ink focus-visible:ring-2 focus-visible:ring-brand-900/25"
          >
            Filter
          </button>
          <span className="ml-auto hidden text-[10px] font-semibold uppercase tracking-[0.16em] text-muted sm:block">
            <span className="font-bold text-ink tabular-nums">{rows.length}</span> flags
          </span>
        </form>

        {rows.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm text-muted">No flags match this search.</p>
        ) : (
          <div className="divide-y divide-line/70">
            {rows.map((flag) => {
              const name = displayName(flag.key);
              return (
                <article
                  key={flag.id}
                  className="grid gap-5 px-5 py-5 transition hover:bg-canvas/70 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
                >
                  <div className="flex min-w-0 items-start gap-4">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-[11px] font-extrabold text-brand-900">
                      FF
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                        <h2 className="text-[15px] font-extrabold text-ink">{name}</h2>
                        <code className="rounded bg-canvas px-1.5 py-0.5 text-[11px] text-muted">
                          {flag.key}
                        </code>
                      </div>
                      <p className="mt-1 text-sm leading-relaxed text-muted">{flag.description}</p>
                      <div className="mt-2.5 flex flex-wrap items-center gap-3 text-[11px] font-semibold text-muted">
                        <span className="rounded-full border border-line bg-white px-2.5 py-1 capitalize">
                          {flag.environment}
                        </span>
                        <span>{flag.rolloutPercent}% rollout</span>
                        <span>
                          Updated {flag.updatedAt.toISOString().slice(0, 16).replace("T", " ")}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-5 md:justify-end">
                    <StatusBadge value={flag.enabled ? "enabled" : "disabled"} />
                    <FlagControl flagId={flag.id} flagName={name} enabled={flag.enabled} />
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </>
  );
}
