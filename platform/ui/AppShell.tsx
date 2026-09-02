import Link from "next/link";
import { APPS } from "../apps";
import { getActor } from "../auth";
import { db } from "../db";
import { RoleSwitcher } from "./RoleSwitcher";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const actor = await getActor();
  const [users, pending] = await Promise.all([
    db.user.findMany({ orderBy: { role: "asc" } }),
    db.approvalRequest.count({ where: { status: "pending" } }),
  ]);

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="w-64 shrink-0 border-r border-slate-200 bg-white">
        <div className="border-b border-slate-200 px-5 py-4">
          <Link href="/" className="block">
            <div className="text-sm font-semibold">Internal Tools Platform</div>
            <div className="text-xs text-slate-500">Northwind Pay</div>
          </Link>
        </div>

        <nav className="px-3 py-4 text-sm">
          <div className="px-2 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Apps
          </div>
          {APPS.map((app) => (
            <Link
              key={app.slug}
              href={`/${app.slug}`}
              className="block rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
            >
              {app.name}
            </Link>
          ))}

          <div className="px-2 pt-5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            Platform
          </div>
          <Link
            href="/approvals"
            className="flex items-center justify-between rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            Approvals
            {pending > 0 && (
              <span className="rounded-full bg-amber-100 px-2 text-xs font-medium text-amber-800">
                {pending}
              </span>
            )}
          </Link>
          <Link
            href="/audit"
            className="block rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
          >
            Audit log
          </Link>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-6 py-3">
          <div className="text-sm text-slate-500">
            Signed in as{" "}
            <span className="font-medium text-slate-900">{actor.name}</span>{" "}
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{actor.role}</span>
          </div>
          <RoleSwitcher
            users={users.map((u) => ({ id: u.id, name: u.name, role: u.role }))}
            currentId={actor.id}
          />
        </header>
        <main className="min-w-0 flex-1 px-6 py-6">{children}</main>
      </div>
    </div>
  );
}
