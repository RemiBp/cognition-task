# Internal Tools Platform

An owned alternative to a low-code internal tool platform (Power Apps / Retool). The initial working slice was built with Devin in roughly two hours as a proof of concept for a Series C fintech.

The bet behind it: the expensive part of Power Apps is not the screen builder, it is the platform underneath — identity, authorization, audit, approvals, and hosted data. This prototype builds a narrow version of *that* layer once, then uses the client's three existing tools to exercise it. A fourth CRUD-shaped workflow can be scaffolded with one command; integrations and novel workflows still require engineering.

## What it does

Platform layer (`platform/`)

- **Auth seam** — a demo session cookie today, shaped so a real OIDC callback (Entra ID, Okta) drops in without touching call sites. Group→role mapping is the only integration point.
- **Server-side RBAC** — four roles (`viewer`, `analyst`, `approver`, `admin`). Permissions are checked inside the action layer, never in the browser, so hiding a button is cosmetic and not a control.
- **Runtime-safe actions** — every client payload is validated with Zod and its audit resource id is derived server-side, so TypeScript types are not mistaken for a trust boundary.
- **Central action audit** — every mutation writes actor, role, action, resource, before/after snapshot, reason and request id. Denied attempts are logged too. The prototype has no update/delete path; production still needs database-enforced immutability or an external audit sink.
- **Maker-checker approvals** — a reusable primitive. An action declared `requiresApproval` never mutates directly: it creates an approval request, and a second human with `approver`/`admin` executes it. Self-approval is rejected server-side.
- **Typed data layer** — Prisma schema is the single source of truth for tables, and generated types flow into pages and actions.
- **UI kit** — server-paginated data table with search, status badges, cards, and an action button that round-trips through the policy layer.

Apps (`app/`)

- `/kyc` — KYC review queue. Decisions require a second approver; escalation is immediate but audited.
- `/refunds` — refunds dashboard with pending exposure. Approvals go through maker-checker, rejections are direct.
- `/flags` — feature flag admin. Admin-only, immediate, and routed through the shared audit path.
- `/disputes` — card disputes queue for support. A refund is proposed and executed by a second approver; closing without a refund is admin-only.
- `/approvals` — the shared approval inbox.
- `/audit` — the shared audit trail with before/after diffs.

## Run it

Requires Node 20.9+.

```bash
npm install
npm run setup   # prisma db push + seed (SQLite, no external services)
npm run dev
```

`npm test` exercises the highest-risk governance paths: denied actions, runtime payload validation,
duplicate proposals, self-approval, second-person execution and concurrent approval decisions.

Open http://localhost:3000. The database is a local SQLite file. A production move to Postgres also requires migrations, deployment, backups, database permissions and integration testing; changing the Prisma datasource is only the first step.

## Demo users

Switch identity with the menu in the header (this stands in for SSO):

| User | Role | Can do |
| --- | --- | --- |
| `dana.viewer@northwindpay.com` | viewer | read only |
| `sam.analyst@northwindpay.com` | analyst | propose KYC/refund decisions |
| `priya.approver@northwindpay.com` | approver | decide pending approvals |
| `alex.admin@northwindpay.com` | admin | everything, incl. feature flags |

## Suggested demo path

1. As **analyst**, try to toggle a feature flag → denied server-side, and the denial appears in `/audit`.
2. In KYC, approve a pending case → nothing changes yet; an approval request is created.
3. Switch to **approver** → `/approvals` shows it. Add a decision note and approve it.
4. Open `/audit` → the trail shows the denied flag attempt, KYC proposal, approval rationale and before/after change.
5. The self-approval invariant is covered in `tests/governance.test.ts`; the default demo roles do not provide a clean UI path to reproduce it.

## Adding app #4

```bash
npm run new-app -- --slug disputes --name "Disputes queue" --purpose "Track and resolve card disputes."
npm run db:push
```

The generator adds the Prisma model, an action registered in the policy layer, a page with server-side search and pagination, the navigation entry and the registry import. Restart the dev server and the new workflow starts from the same control path. This demonstrates lower scaffolding effort for the CRUD-shaped portion of the roadmap, not zero marginal cost. Integrations, domain logic, review and operations remain engineering work.

## What this is not

See [`docs/NOT_REPLICATED.md`](docs/NOT_REPLICATED.md) for the honest list — citizen development, connector library, inherited compliance, on-call. [`docs/COST_MODEL.md`](docs/COST_MODEL.md) has the seat math, and [`KEY_DECISIONS.md`](KEY_DECISIONS.md) the scope and architecture rationale.

The same KYC queue was also built in a live Power Apps tenant and timed, so the comparison is first-hand: [`docs/POWER_APPS_COMPARISON.md`](docs/POWER_APPS_COMPARISON.md).
