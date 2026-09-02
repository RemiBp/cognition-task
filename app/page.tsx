import Link from "next/link";
import { APPS } from "@/platform/apps";
import { db } from "@/platform/db";
import { Card, PageHeader } from "@/platform/ui/primitives";

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
    { label: "Pending approvals", value: pending },
    { label: "Audit entries", value: audits },
  ];

  return (
    <>
      <PageHeader
        title="Internal Tools Platform"
        subtitle="Three internal apps sharing one owned platform layer: authentication, role-based access, maker-checker approvals and an append-only audit log. Adding the fourth app is a single command."
      />

      <div className="mb-6 grid grid-cols-5 gap-3">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <div className="text-2xl font-semibold">{stat.value}</div>
            <div className="text-xs text-slate-500">{stat.label}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-4">
        {APPS.map((app) => (
          <Link key={app.slug} href={`/${app.slug}`} className="block">
            <Card>
              <div className="font-medium">{app.name}</div>
              <p className="mt-1 text-sm text-slate-500">{app.purpose}</p>
              {app.replaces && (
                <p className="mt-3 text-xs text-slate-400">Replaces: {app.replaces}</p>
              )}
            </Card>
          </Link>
        ))}
      </div>
    </>
  );
}
