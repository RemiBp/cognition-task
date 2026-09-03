import Link from "next/link";
import { APPS } from "@/platform/apps";
import { db } from "@/platform/db";
import { Card, PageHeader, StatCard } from "@/platform/ui/primitives";

export default async function Home() {
  const [cases, refunds, flags, audits, pending] = await Promise.all([
    db.kycCase.count(),
    db.refund.count(),
    db.featureFlag.count(),
    db.auditLog.count(),
    db.approvalRequest.count({ where: { status: "pending" } }),
  ]);

  const stats = [
    { label: "KYC cases", value: cases },
    { label: "Refund requests", value: refunds },
    { label: "Feature flags", value: flags },
    { label: "Pending approvals", value: pending, accent: pending > 0 },
    { label: "Audit entries", value: audits },
  ];

  return (
    <>
      <PageHeader
        title="Internal Tools Platform"
        eyebrow="Owned platform"
        subtitle="Three internal apps sharing one owned platform layer: an identity seam, role-based access, maker-checker approvals and an append-only audit log. Adding a fourth CRUD-shaped app is a single command."
      />

      <div className="mb-8 grid grid-cols-5 gap-3">
        {stats.map((stat) => (
          <StatCard
            key={stat.label}
            label={stat.label}
            value={stat.value}
            accent={stat.accent}
          />
        ))}
      </div>

      <h2 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        Apps on this platform
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {APPS.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} className="group block">
            <Card className="h-full transition group-hover:border-brand-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-extrabold text-ink">{app.name}</span>
                <span className="text-ink/25 transition group-hover:translate-x-1 group-hover:text-brand-900">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{app.purpose}</p>
              <div className="mt-5 flex items-center gap-2 border-t border-line pt-3.5 text-[11px] font-bold text-brand-900">
                <span
                  aria-hidden
                  className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-50 text-[9px]"
                >
                  ✓
                </span>
                {app.control}
              </div>
              {app.replaces && (
                <p className="mt-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-muted">
                  Prototype scope · {app.replaces.replace("Power Apps — ", "")}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
