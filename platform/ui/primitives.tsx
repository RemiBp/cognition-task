import type { ReactNode } from "react";

export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-brand-900">
      <span aria-hidden className="h-px w-6 bg-brand-900" />
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
        {eyebrow && (
          <div className="mb-4">
            <Eyebrow>{eyebrow}</Eyebrow>
          </div>
        )}
        <h1 className="text-[32px] font-extrabold leading-[1.1] text-ink">{title}</h1>
        {subtitle && (
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted">{subtitle}</p>
        )}
      </div>
      {right}
    </div>
  );
}

const TONES: Record<string, { dot: string; text: string }> = {
  pending: { dot: "bg-amber-500", text: "text-ink/70" },
  escalated: { dot: "bg-orange-500", text: "text-ink/70" },
  approved: { dot: "bg-brand-900", text: "text-brand-900" },
  executed: { dot: "bg-brand-900", text: "text-brand-900" },
  enabled: { dot: "bg-brand-900", text: "text-brand-900" },
  rejected: { dot: "bg-rose-500", text: "text-rose-800" },
  denied: { dot: "bg-rose-500", text: "text-rose-800" },
  proposed: { dot: "bg-ink/40", text: "text-ink/70" },
  disabled: { dot: "bg-ink/20", text: "text-muted" },
};

export function StatusBadge({ value }: { value: string }) {
  const tone = TONES[value] ?? { dot: "bg-ink/25", text: "text-muted" };

  return (
    <span
      className={`inline-flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] ${tone.text}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
      {value}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-sm border border-line bg-white p-6 ${className}`}>{children}</div>
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
      className={`rounded-sm border p-5 ${
        accent ? "border-brand-900 bg-brand-900 text-white" : "border-line bg-white"
      }`}
    >
      <div
        className={`text-[28px] font-extrabold leading-none tabular-nums ${
          accent ? "text-white" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div
        className={`mt-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] ${
          accent ? "text-white/60" : "text-muted"
        }`}
      >
        {label}
      </div>
    </div>
  );
}
