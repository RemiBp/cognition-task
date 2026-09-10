/**
 * Scaffolds a new internal app that is wired into the platform on creation:
 * a Prisma model, a registered action with its own policy, a page built from
 * the shared table component, a nav entry and an entry in the action registry.
 *
 *   npm run new-app -- --slug disputes --name "Disputes queue"
 *   npm run db:push && npm run dev
 *
 * The point is not the code generator. It is that the conventions an agent has
 * to follow are written down and executable, so "add an internal tool" is a
 * bounded task with a known shape — see AGENTS.md.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(`--${flag}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const slug = arg("slug");
if (!slug || !/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error('Usage: npm run new-app -- --slug disputes --name "Disputes queue"');
  process.exit(1);
}

const name = arg("name") ?? `${slug[0].toUpperCase()}${slug.slice(1)}`;
const purpose = arg("purpose") ?? `Review and resolve ${slug} records.`;
const pascal =
  arg("model") ??
  slug
    .split("-")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join("")
    .replace(/s$/, "");
const camel = pascal[0].toLowerCase() + pascal.slice(1);
const snake = camel.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

const appDir = join(root, "app", slug);
if (existsSync(appDir)) {
  console.error(`app/${slug} already exists`);
  process.exit(1);
}
mkdirSync(appDir, { recursive: true });

// 1. Prisma model -----------------------------------------------------------
const schemaPath = join(root, "prisma", "schema.prisma");
const schema = readFileSync(schemaPath, "utf8");
if (!schema.includes(`model ${pascal} {`)) {
  writeFileSync(
    schemaPath,
    `${schema}\nmodel ${pascal} {\n  id        String   @id @default(cuid())\n  reference String   @unique\n  subject   String\n  status    String   @default("open") // open | resolved | dismissed\n  notes     String?\n  version   Int      @default(0) // compare-and-set guard for concurrent writes\n  createdAt DateTime @default(now())\n}\n`,
  );
}

// 2. Action with its own policy, inheriting audit + approvals ---------------
writeFileSync(
  join(appDir, "actions.ts"),
  `import { registerAction } from "@/platform/actions";
import { ConflictError } from "@/platform/rbac";
import { registerPolicy, registerResourceLoader } from "@/platform/policy";
import { z } from "zod";

type Payload = { id: string; expectedVersion: number; status: "resolved" | "dismissed" };

registerResourceLoader("${snake}", (client, id) =>
  client.${camel}.findUnique({ where: { id }, select: { id: true, status: true, version: true } }),
);

// Availability is declared once here and read by the page; the same verdict is
// re-evaluated inside the transaction that performs the write.
registerPolicy("${snake}.resolve", {
  resource: "${snake}",
  label: "Propose resolution",
  requiresReason: false,
  evaluate: ({ actor, state }) => {
    if (!state.record) return { available: false, reason: "This record no longer exists." };
    if (actor.role === "viewer") return { available: false, reason: "Your role is read-only." };
    if (state.record.status !== "open") return { available: false, reason: "Already settled." };
    if (state.activeProposal) {
      return { available: false, reason: "A proposal is awaiting independent approval." };
    }
    return { available: true };
  },
});

export const resolve${pascal} = registerAction<Payload>({
  key: "${snake}.resolve",
  resource: "${snake}",
  roles: ["analyst", "approver", "admin"],
  schema: z.object({
    id: z.string().min(1),
    expectedVersion: z.number().int().nonnegative(),
    status: z.enum(["resolved", "dismissed"]),
  }),
  resourceId: ({ id }) => id,
  expectedVersion: ({ expectedVersion }) => expectedVersion,
  requiresApproval: true,
  describe: ({ status }) => \`Mark ${camel} as \${status}\`,
  subject: async ({ id }, client) => {
    const row = await client.${camel}.findUnique({ where: { id }, select: { reference: true, subject: true } });
    return row ? \`\${row.reference} · \${row.subject}\` : undefined;
  },
  before: ({ id }, client) => client.${camel}.findUnique({ where: { id } }),
  apply: async ({ id, expectedVersion, status }, ctx) => {
    const changed = await ctx.tx.${camel}.updateMany({
      where: { id, version: expectedVersion },
      data: { status, version: expectedVersion + 1 },
    });
    if (changed.count !== 1) {
      throw new ConflictError("This record changed since the page was loaded. Reload it.");
    }
    const updated = await ctx.tx.${camel}.findUniqueOrThrow({ where: { id } });
    ctx.snapshot(updated);
    return updated;
  },
});
`,
);

// 3. Page built from the shared table --------------------------------------
writeFileSync(
  join(appDir, "page.tsx"),
  `import { activeProposalsFor } from "@/platform/approvals";
import { getActor } from "@/platform/auth";
import { db } from "@/platform/db";
import { ActionControls, type ActionOption } from "@/platform/ui/ActionControls";
import { controlsFor } from "@/platform/ui/controls";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 15;

type Row = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  createdAt: Date;
  controls: ActionOption[];
};

export default async function ${pascal}Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const actor = await getActor();
  const where = q
    ? { OR: [{ reference: { contains: q } }, { subject: { contains: q } }] }
    : {};

  const [records, total] = await Promise.all([
    db.${camel}.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "asc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.${camel}.count({ where }),
  ]);

  const proposals = await activeProposalsFor("${snake}", records.map((row) => row.id));

  const rows: Row[] = records.map((row) => ({
    ...row,
    controls: controlsFor(
      [
        {
          policyKey: "${snake}.resolve",
          actionKey: "${snake}.resolve",
          payload: { id: row.id, expectedVersion: row.version, status: "resolved" },
        },
      ],
      actor,
      {
        record: { id: row.id, status: row.status, version: row.version },
        activeProposal: proposals.get(row.id) ?? null,
      },
    ),
  }));

  const columns: Column<Row>[] = [
    { header: "Reference", cell: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { header: "Subject", cell: (row) => <span className="font-medium">{row.subject}</span> },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    { header: "Created", cell: (row) => row.createdAt.toISOString().slice(0, 10) },
    {
      header: "Action",
      cell: (row) => <ActionControls actions={row.controls} />,
    },
  ];

  return (
    <>
      <PageHeader
        title="${name}"
        subtitle="Generated by 'npm run new-app'. Authentication, role policy, maker-checker approvals and the audit log are inherited from the platform, not reimplemented here."
      />
      <DataTable
        rows={rows}
        columns={columns}
        query={{ q, page, pageSize: PAGE_SIZE, total }}
        basePath="/${slug}"
      />
    </>
  );
}
`,
);

// 4. Nav + action registry --------------------------------------------------
const appsPath = join(root, "platform", "apps.ts");
const apps = readFileSync(appsPath, "utf8");
writeFileSync(
  appsPath,
  apps.replace(
    /\n\];\s*$/,
    `\n  {\n    slug: "${slug}",\n    name: "${name}",\n    purpose: "${purpose}",\n    control: "Maker-checker · audited",\n  },\n];\n`,
  ),
);

const registryPath = join(root, "platform", "registry.ts");
const registry = readFileSync(registryPath, "utf8");
writeFileSync(
  registryPath,
  registry.replace('\nexport {};', `import "@/app/${slug}/actions";\n\nexport {};`),
);

console.log(`Created app/${slug} (model ${pascal}).
Next: npm run db:push   # applies the model and regenerates the Prisma client
Then restart the dev server and open /${slug}`);
