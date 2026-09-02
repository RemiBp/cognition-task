import type { ReactNode } from "react";

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle && <p className="mt-1 max-w-2xl text-sm text-slate-500">{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  escalated: "bg-orange-100 text-orange-800",
  approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-rose-100 text-rose-800",
  executed: "bg-emerald-100 text-emerald-800",
  proposed: "bg-sky-100 text-sky-800",
  denied: "bg-rose-100 text-rose-800",
  enabled: "bg-emerald-100 text-emerald-800",
  disabled: "bg-slate-100 text-slate-600",
};

export function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
        TONES[value] ?? "bg-slate-100 text-slate-700"
      }`}
    >
      {value}
    </span>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">{children}</div>
  );
}
