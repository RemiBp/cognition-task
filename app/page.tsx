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

      <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-slate-400">
        Apps on this platform
      </h2>
      <div className="grid grid-cols-3 gap-4">
        {APPS.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} className="group block">
            <Card className="h-full transition group-hover:border-slate-300 group-hover:shadow-md">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-slate-900">{app.name}</span>
                <span className="text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-slate-500">
                  →
                </span>
              </div>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{app.purpose}</p>
              {app.replaces && (
                <p className="mt-4 border-t border-slate-100 pt-3 text-xs text-slate-400">
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
