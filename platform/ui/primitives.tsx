import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-brand-50 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.16em] text-brand-900">
      {children}
    </span>
  );
}

export function PageHeader({
  title,
  subtitle,
  eyebrow,
  right,
}: {
  title: string;
  subtitle?: string;
  eyebrow?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-8 flex items-start justify-between gap-8">
      <div>
        {eyebrow && <div className="mb-3">
          <Eyebrow>{eyebrow}</Eyebrow>
        </div>}
        <h1 className="text-[32px] font-extrabold leading-[1.1] text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, string> = {
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  escalated: "bg-orange-50 text-orange-800 ring-orange-600/20",
  approved: "bg-brand-50 text-brand-900 ring-brand-900/15",
  executed: "bg-brand-50 text-brand-900 ring-brand-900/15",
  enabled: "bg-brand-50 text-brand-900 ring-brand-900/15",
  rejected: "bg-rose-50 text-rose-800 ring-rose-600/20",
  denied: "bg-rose-50 text-rose-800 ring-rose-600/20",
  proposed: "bg-sky-50 text-sky-800 ring-sky-600/20",
  disabled: "bg-zinc-100 text-zinc-600 ring-zinc-500/20",
};

export function StatusBadge({ value }: { value: string }) {
  const tone = TONES[value] ?? "bg-zinc-100 text-zinc-700 ring-zinc-500/20";

  return (
    <span
      className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.08em] ring-1 ring-inset ${tone}`}
    >
      {value}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-line bg-white p-6 ${className}`}>{children}</div>
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
      className={`rounded-lg border p-5 ${
        accent ? "border-brand-900 bg-brand-950 text-white" : "border-line bg-white"
      }`}
    >
      <div
        className={`text-[28px] font-extrabold leading-none tabular-nums ${
          accent ? "text-brand-400" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-2.5 text-[11px] font-bold uppercase tracking-[0.12em] ${
          accent ? "text-white/60" : "text-muted"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
