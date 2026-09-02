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
        subtitle="Three internal apps sharing one owned platform layer: authentication, role-based access, maker-checker approvals and an append-only audit log. Adding the fourth app is a single command."
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

      <h2 className="mb-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-muted">
        Apps on this platform
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {APPS.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} className="group block">
            <Card className="h-full transition group-hover:border-brand-900">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[17px] font-extrabold text-ink">{app.name}</span>
                <span className="text-brand-500 transition group-hover:translate-x-1 group-hover:text-brand-900">
                  →
                </span>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{app.purpose}</p>
              {app.replaces && (
                <p className="mt-5 border-t border-line pt-3.5 text-[11px] font-bold uppercase tracking-[0.1em] text-brand-700">
                  Replaces {app.replaces}
                </p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
