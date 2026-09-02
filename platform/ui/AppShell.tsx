import Link from "next/link";
import { APPS } from "../apps";
import { getActor } from "../auth";
import { db } from "../db";
import { NavLink } from "./NavLink";
import { RoleSwitcher } from "./RoleSwitcher";

function initials(name: string) {
  return name
    .split(" ")
    .map((part) => part[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export async function AppShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const [users, pending] = await Promise.all([
    db.user.findMany({ orderBy: { role: "asc" } }),
    db.approvalRequest.count({ where: { status: "pending" } }),
  ]);

  return (
    <div className="flex min-h-screen bg-white text-ink">
      <aside className="flex w-64 shrink-0 flex-col bg-brand-900">
        <div className="px-6 py-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-white text-[13px] font-extrabold text-brand-900">
              NP
            </span>
            <span className="leading-tight">
              <span className="block text-[13px] font-extrabold uppercase tracking-[0.16em] text-white">
                Internal
              </span>
              <span className="block text-[13px] font-extrabold uppercase tracking-[0.16em] text-white/55">
                Tools
              </span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-0.5 px-3 pb-4">
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Apps
          </div>
          {APPS.map((app) => (
            <NavLink key={app.slug} href={`/${app.slug}`} label={app.name} />
          ))}

          <div className="px-3 pt-6 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-white/40">
            Platform
          </div>
          <NavLink
            href="/approvals"
            label="Approvals"
            badge={
              pending > 0 ? (
                <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-bold tabular-nums text-brand-900">
                  {pending}
                </span>
              ) : undefined
            }
          />
          <NavLink href="/audit" label="Audit log" />
        </nav>

        <div className="mx-3 mb-4 rounded-lg border border-white/10 px-4 py-3.5 text-[11px] leading-relaxed text-white/55">
          Every mutation in every app passes through one policy, approval and
          audit path.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col bg-canvas">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-line bg-white px-10 py-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-md bg-brand-50 text-xs font-extrabold text-brand-900">
              {initials(actor.name)}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-bold text-ink">{actor.name}</span>
              <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-brand-700">
                {actor.role}
              </span>
            </span>
          </div>
          <RoleSwitcher
            users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
            currentId={actor.id}
          />
        </header>
        <main className="min-w-0 flex-1 px-10 py-9">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
