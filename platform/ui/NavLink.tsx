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
      className={`group flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] font-semibold outline-none transition focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-white/60 ${
        active
          ? "bg-white/10 text-white"
          : "text-white/55 hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <span
        className={`h-4 w-[3px] shrink-0 rounded-full transition ${
          active ? "bg-white" : "bg-transparent group-hover:bg-white/25"
        }`}
      />
      <span className="truncate">{label}</span>
      {badge && <span className="ml-auto">{badge}</span>}
    </Link>
  );
}
