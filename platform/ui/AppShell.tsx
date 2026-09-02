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
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="flex w-64 shrink-0 flex-col bg-slate-900">
        <div className="px-5 py-5">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-500 text-sm font-bold text-white">
              NP
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-semibold text-white">Internal Tools</span>
              <span className="block text-xs text-slate-400">Northwind Pay</span>
            </span>
          </Link>
        </div>

        <nav className="flex-1 space-y-1 px-3 pb-4">
          <div className="px-2.5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Apps
          </div>
          {APPS.map((app) => (
            <NavLink key={app.slug} href={`/${app.slug}`} label={app.name} />
          ))}

          <div className="px-2.5 pt-5 pb-1.5 text-[10px] font-semibold uppercase tracking-widest text-slate-500">
            Platform
          </div>
          <NavLink
            href="/approvals"
            label="Approvals"
            badge={
              pending > 0 ? (
                <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[11px] font-semibold text-amber-300">
                  {pending}
                </span>
              ) : undefined
            }
          />
          <NavLink href="/audit" label="Audit log" />
        </nav>

        <div className="border-t border-slate-800 px-5 py-4 text-[11px] leading-relaxed text-slate-500">
          Every mutation in every app passes through one policy, approval and
          audit path.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-slate-200 bg-white/80 px-8 py-3 backdrop-blur">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-xs font-semibold text-white">
              {initials(actor.name)}
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-medium text-slate-900">{actor.name}</span>
              <span className="block text-xs uppercase tracking-wide text-slate-500">
                {actor.role}
              </span>
            </span>
          </div>
          <RoleSwitcher
            users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
            currentId={actor.id}
          />
        </header>
        <main className="min-w-0 flex-1 px-8 py-8">
          <div className="mx-auto max-w-6xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
