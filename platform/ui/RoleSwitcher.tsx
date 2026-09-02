"use client";

import { useState, useTransition } from "react";
import { switchUser } from "@/app/actions";

export function RoleSwitcher({
  users,
  currentId,
}: {
  users: { id: string; name: string; role: string }[];
  currentId: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const current = users.find((user) => user.id === currentId) ?? users[0];

  return (
    <div className="relative flex items-center gap-2.5">
      <span className="hidden text-[10px] font-semibold uppercase tracking-[0.18em] text-muted sm:inline">
        Demo identity
      </span>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((value) => !value)}
        className="flex h-9 min-w-52 items-center justify-between gap-4 rounded-md border border-line bg-white px-3 text-sm font-semibold text-ink shadow-sm outline-none transition hover:border-slate-300 hover:bg-slate-50 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15 disabled:cursor-wait disabled:opacity-60"
      >
        <span>{pending ? "Switching identity…" : `${current.name} · ${current.role}`}</span>
        <svg
          viewBox="0 0 20 20"
          aria-hidden="true"
          className={`h-4 w-4 text-muted transition ${open ? "rotate-180" : ""}`}
          fill="currentColor"
        >
          <path
            fillRule="evenodd"
            d="M5.22 7.47a.75.75 0 0 1 1.06 0L10 11.19l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 8.53a.75.75 0 0 1 0-1.06Z"
            clipRule="evenodd"
          />
        </svg>
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute right-0 top-11 z-50 w-72 overflow-hidden rounded-lg border border-line bg-white p-1.5 shadow-xl shadow-slate-900/10"
        >
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-[0.16em] text-muted">
            Test access policy as
          </div>
          {users.map((user) => {
            const selected = user.id === currentId;
            return (
              <button
                key={user.id}
                type="button"
                role="menuitem"
                aria-current={selected ? "true" : undefined}
                onClick={() => {
                  if (selected) {
                    setOpen(false);
                    return;
                  }
                  startTransition(async () => {
                    await switchUser(user.id);
                    window.location.reload();
                  });
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2.5 text-left transition ${
                  selected ? "bg-brand-50" : "hover:bg-slate-50"
                }`}
              >
                <span>
                  <span className="block text-sm font-semibold text-ink">{user.name}</span>
                  <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted">
                    {user.role}
                  </span>
                </span>
                {selected ? (
                  <span className="text-xs font-bold text-brand-700">Current</span>
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
