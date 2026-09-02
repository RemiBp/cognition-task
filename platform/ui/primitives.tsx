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
    <div className="mb-6 flex items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-slate-500">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, { chip: string; dot: string }> = {
  pending: { chip: "bg-amber-50 text-amber-700 ring-amber-600/20", dot: "bg-amber-500" },
  escalated: { chip: "bg-orange-50 text-orange-700 ring-orange-600/20", dot: "bg-orange-500" },
  approved: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  rejected: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20", dot: "bg-rose-500" },
  executed: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  proposed: { chip: "bg-sky-50 text-sky-700 ring-sky-600/20", dot: "bg-sky-500" },
  denied: { chip: "bg-rose-50 text-rose-700 ring-rose-600/20", dot: "bg-rose-500" },
  enabled: { chip: "bg-emerald-50 text-emerald-700 ring-emerald-600/20", dot: "bg-emerald-500" },
  disabled: { chip: "bg-slate-100 text-slate-600 ring-slate-500/20", dot: "bg-slate-400" },
};

export function StatusBadge({ value }: { value: string }) {
  const tone = TONES[value] ?? {
    chip: "bg-slate-100 text-slate-700 ring-slate-500/20",
    dot: "bg-slate-400",
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${tone.chip}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {value}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-slate-900/[0.02] ${className}`}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm ${
        accent ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white"
      }`}
    >
      <div
        className={`text-2xl font-semibold tabular-nums tracking-tight ${
          accent ? "text-amber-900" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-0.5 text-xs font-medium ${accent ? "text-amber-700" : "text-slate-500"}`}
      >
        {label}
      </div>
    </div>
  );
}
