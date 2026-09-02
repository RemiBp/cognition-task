"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({
  href,
  label,
  badge,
}: {
  href: string;
  label: string;
  badge?: ReactNode;
}) {
  const pathname = usePathname();
  const active = pathname === href;

  return (
    <Link
      href={href}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition ${
        active
          ? "bg-slate-800 text-white"
          : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-100"
      }`}
    >
      <span
        className={`h-1.5 w-1.5 shrink-0 rounded-full transition ${
          active ? "bg-indigo-400" : "bg-slate-600 group-hover:bg-slate-500"
        }`}
      />
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </Link>
  );
}
