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
    `${schema}\nmodel ${pascal} {\n  id        String   @id @default(cuid())\n  reference String   @unique\n  subject   String\n  status    String   @default("open") // open | resolved | dismissed\n  notes     String?\n  createdAt DateTime @default(now())\n}\n`,
  );
}

// 2. Action with its own policy, inheriting audit + approvals ---------------
writeFileSync(
  join(appDir, "actions.ts"),
  `import { registerAction } from "@/platform/actions";
import { db } from "@/platform/db";

export const resolve${pascal} = registerAction<{ id: string; status: "resolved" | "dismissed" }>({
  key: "${snake}.resolve",
  resource: "${snake}",
  roles: ["analyst", "approver", "admin"],
  requiresApproval: true,
  describe: ({ id, status }) => \`Mark ${camel} \${id.slice(0, 8)} as \${status}\`,
  before: ({ id }) => db.${camel}.findUnique({ where: { id } }),
  apply: async ({ id, status }, ctx) => {
    const updated = await db.${camel}.update({ where: { id }, data: { status } });
    ctx.snapshot(updated);
    return updated;
  },
});
`,
);

// 3. Page built from the shared table --------------------------------------
writeFileSync(
  join(appDir, "page.tsx"),
  `import { db } from "@/platform/db";
import { ActionButton } from "@/platform/ui/ActionButton";
import { DataTable, type Column } from "@/platform/ui/DataTable";
import { PageHeader, StatusBadge } from "@/platform/ui/primitives";

const PAGE_SIZE = 15;

type Row = {
  id: string;
  reference: string;
  subject: string;
  status: string;
  createdAt: Date;
};

export default async function ${pascal}Page({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const { q, page: pageParam } = await searchParams;
  const page = Math.max(1, Number(pageParam ?? 1));
  const where = q
    ? { OR: [{ reference: { contains: q } }, { subject: { contains: q } }] }
    : {};

  const [rows, total] = await Promise.all([
    db.${camel}.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    db.${camel}.count({ where }),
  ]);

  const columns: Column<Row>[] = [
    { header: "Reference", cell: (row) => <span className="font-mono text-xs">{row.reference}</span> },
    { header: "Subject", cell: (row) => <span className="font-medium">{row.subject}</span> },
    { header: "Status", cell: (row) => <StatusBadge value={row.status} /> },
    { header: "Created", cell: (row) => row.createdAt.toISOString().slice(0, 10) },
    {
      header: "Action",
      cell: (row) =>
        row.status === "open" ? (
          <span className="flex gap-1.5">
            <ActionButton
              actionKey="${snake}.resolve"
              payload={{ id: row.id, status: "resolved" }}
              resourceId={row.id}
              label="Resolve"
            />
            <ActionButton
              actionKey="${snake}.resolve"
              payload={{ id: row.id, status: "dismissed" }}
              resourceId={row.id}
              label="Dismiss"
              variant="quiet"
            />
          </span>
        ) : (
          <span className="text-xs text-slate-400">closed</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        title="${name}"
        subtitle="Generated by \\\`npm run new-app\\\`. Authentication, role policy, maker-checker approvals and the audit log are inherited from the platform, not reimplemented here."
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
    `\n  {\n    slug: "${slug}",\n    name: "${name}",\n    purpose: "${purpose}",\n  },\n];\n`,
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
