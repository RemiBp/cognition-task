/**
 * Reads the audit trail from the terminal, the same rows /audit renders.
 *
 *   npm run audit                              # last 20 entries
 *   npm run audit -- --resource dispute        # one app only
 *   npm run audit -- --resource dispute --watch
 */
import { db } from "../platform/db";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
};

const resource = flag("resource");
const limit = Number(flag("limit") ?? 20);
const watch = args.includes("--watch");

const shortJson = (value: string | null) => {
  if (!value) return "";
  const parsed = JSON.parse(value) as Record<string, unknown>;
  return Object.entries(parsed)
    .filter(([key]) => !["id", "openedAt", "submittedAt", "requestedAt", "updatedAt"].includes(key))
    .map(([key, v]) => `${key}=${String(v)}`)
    .join(" ");
};

async function print(after?: Date) {
  const rows = await db.auditLog.findMany({
    where: {
      ...(resource ? { resource } : {}),
      ...(after ? { at: { gt: after } } : {}),
    },
    orderBy: { at: "desc" },
    take: after ? 50 : limit,
  });

  for (const row of rows.reverse()) {
    console.log(
      [
        row.at.toISOString().slice(11, 19),
        row.outcome.toUpperCase().padEnd(9),
        row.action.padEnd(16),
        `${row.actorEmail} (${row.actorRole})`,
        row.resourceId ? `#${row.resourceId.slice(-6)}` : "",
        row.reason ? `note="${row.reason}"` : "",
      ]
        .filter(Boolean)
        .join("  "),
    );
    const before = shortJson(row.before);
    const afterState = shortJson(row.after);
    if (before || afterState) {
      console.log(`           before: ${before || "—"}`);
      console.log(`           after : ${afterState || "—"}`);
    }
  }

  return rows.at(-1)?.at;
}

async function main() {
  let cursor = (await print()) ?? new Date();
  if (!watch) return;
  console.log(`\nWatching ${resource ?? "all"} actions… (ctrl+c to stop)`);
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    cursor = (await print(cursor)) ?? cursor;
  }
}

main().finally(() => {
  if (!watch) void db.$disconnect();
});
