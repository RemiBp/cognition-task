/**
 * Cold-route check for `npm run new-app`.
 *
 * Typechecking a generated app proves the code compiles; it does not prove the
 * route renders, because a page renders in a different module graph from the
 * server action file and only sees the policies that its own imports have
 * registered. So this copies the working tree into a disposable directory,
 * generates an app there, seeds one row and does a cold GET against a fresh
 * server, asserting the row's control is offered rather than refused with
 * "No policy is declared for this action".
 *
 *   npm run smoke:generator
 *
 * Nothing is written back into the repo and no generated app is shipped.
 */
import { execFileSync, spawn } from "child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { join } from "path";

const root = join(__dirname, "..");
// Beside the repo, not in /tmp: dependencies are hard-linked into the copy and
// hard links cannot cross devices.
const work = mkdtempSync(join(root, "..", "generator-smoke-"));
const SLUG = "smoke-checks";
const PORT = 3219;

const run = (
  command: string,
  args: string[],
  cwd = work,
  env: Record<string, string> = {},
) =>
  execFileSync(command, args, {
    cwd,
    stdio: "inherit",
    env: { ...process.env, ...env },
  });

const SKIPPED = ["node_modules", ".next", ".git"];

function copyTree() {
  cpSync(root, work, {
    recursive: true,
    filter: (source) => {
      const relative = source.slice(root.length + 1);
      if (relative === "") return true;
      const [top] = relative.split("/");
      return !SKIPPED.includes(top) && !relative.endsWith(".db");
    },
  });
  // Hard links make copying the dependencies cheap. The two directories Prisma
  // regenerates are real copies, so generating the client for the smoke model
  // cannot reach back into the repo.
  run("cp", ["-al", join(root, "node_modules"), join(work, "node_modules")], root);
  for (const generated of [".prisma", join("@prisma", "client")]) {
    rmSync(join(work, "node_modules", generated), { recursive: true, force: true });
    run(
      "cp",
      ["-a", join(root, "node_modules", generated), join(work, "node_modules", generated)],
      root,
    );
  }
}

async function get(url: string, attempts: number): Promise<string> {
  let last = "never answered";
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      const body = await response.text();
      if (response.ok) return body;
      last = `answered ${response.status}`;
    } catch {
      // server not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${url} ${last}`);
}

async function main() {
  console.log(`Working in ${work}`);
  copyTree();

  run("npx", ["tsx", "scripts/new-app.ts", "--slug", SLUG, "--name", "Smoke checks"]);

  const env = { DATABASE_URL: "file:./smoke.db" };
  run("npx", ["prisma", "generate"], work, env);
  run("npx", ["prisma", "db", "push", "--skip-generate"], work, env);

  writeFileSync(
    join(work, "scripts", "smoke-seed.ts"),
    `import { db } from "@/platform/db";
db.smokeCheck
  .create({
    data: { reference: "SMOKE-001", subject: "Generated row", status: "open" },
  })
  .then(() => db.$disconnect());
`,
  );
  run("npx", ["tsx", "prisma/seed.ts"], work, env);
  run("npx", ["tsx", "scripts/smoke-seed.ts"], work, env);

  run("npm", ["run", "typecheck"], work, env);
  run("npm", ["run", "lint"], work, env);

  // Its own process group: `next dev` forks a worker, and killing only the
  // launcher leaves that worker running against a directory about to vanish.
  const server = spawn("npx", ["next", "dev", "--port", String(PORT)], {
    cwd: work,
    stdio: "inherit",
    detached: true,
    env: { ...process.env, ...env },
  });

  try {
    const html = await get(`http://127.0.0.1:${PORT}/${SLUG}`, 90);
    const failures: string[] = [];
    if (!html.includes("SMOKE-001")) failures.push("the seeded row is not on the page");
    if (html.includes("No policy is declared")) {
      failures.push("the generated action has no policy on a cold render");
    }
    if (!html.includes("Propose resolution")) failures.push("the generated control is not offered");
    if (failures.length > 0) throw new Error(failures.join("; "));
    console.log(`Cold GET /${SLUG} rendered the seeded row with its control.`);
  } finally {
    // The server has to be gone before the directory is: Next reacts to its
    // own build directory disappearing by restarting.
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    if (server.pid) process.kill(-server.pid, "SIGKILL");
    await stopped;
    rmSync(work, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
