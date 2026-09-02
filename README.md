# Internal Tools Platform

An owned alternative to a low-code internal tool platform (Power Apps / Retool), built with Devin in ~2 hours as a proof of concept for a Series C fintech.

The bet behind it: the expensive part of Power Apps is not the screen builder, it is the platform underneath — identity, row-level authorization, audit, approvals, and hosted data. So this prototype builds *that* layer once, and ships the client's three existing tools as thin instances on top of it. A fourth tool is one command away.

## What it does

Platform layer (`platform/`)

- **Auth seam** — a demo session cookie today, shaped so a real OIDC callback (Entra ID, Okta) drops in without touching call sites. Group→role mapping is the only integration point.
- **Server-side RBAC** — four roles (`viewer`, `analyst`, `approver`, `admin`). Permissions are checked inside the action layer, never in the browser, so hiding a button is cosmetic and not a control.
- **Append-only audit log** — every mutation writes actor, role, action, resource, before/after snapshot, reason and request id. Denied attempts are logged too.
- **Maker-checker approvals** — a reusable primitive. An action declared `requiresApproval` never mutates directly: it creates an approval request, and a second human with `approver`/`admin` executes it. Self-approval is rejected server-side.
- **Typed data layer** — Prisma schema is the single source of truth for tables, and generated types flow into pages and actions.
- **UI kit** — server-paginated data table with search, status badges, cards, and an action button that round-trips through the policy layer.

Apps (`app/`)

- `/kyc` — KYC review queue. Decisions require a second approver; escalation is immediate but audited.
- `/refunds` — refunds dashboard with pending exposure. Approvals go through maker-checker, rejections are direct.
- `/flags` — feature flag admin. Admin-only, immediate, fully audited.
- `/approvals` — the shared approval inbox.
- `/audit` — the shared audit trail with before/after diffs.

## Run it

Requires Node 20+.

```bash
npm install
npm run setup   # prisma db push + seed (SQLite, no external services)
npm run dev
```

Open http://localhost:3000. The database is a local SQLite file; the Prisma datasource is the only thing to change for Postgres.

## Demo users

Switch identity with the selector in the sidebar (this stands in for SSO):

| User | Role | Can do |
| --- | --- | --- |
| `viewer@example.com` | viewer | read only |
| `analyst@example.com` | analyst | propose KYC/refund decisions |
| `approver@example.com` | approver | decide pending approvals |
| `admin@example.com` | admin | everything, incl. feature flags |

## Suggested demo path

1. As **viewer**, try to approve a refund → denied server-side, and the denial appears in `/audit`.
2. As **analyst**, approve refund `ORD-…` → nothing changes yet; an approval request is created.
3. Switch to **approver** → `/approvals` shows it. Try to approve your own request as the analyst first: rejected.
4. Approve it → the refund flips to `approved`, and `/audit` shows the proposal, the decision, and the before/after diff.
5. As **analyst**, try to toggle a feature flag → denied (admin-only).

## Adding app #4

```bash
npm run new-app -- --slug disputes --name "Disputes queue" --purpose "Track and resolve card disputes."
npm run db:push
```

The generator adds the Prisma model, an actions file with a maker-checker action registered in the policy layer, a page with server-side search and pagination, the nav entry, and the registry import. Restart the dev server and the new tool is already governed — that is the marginal-cost argument for the ten tools they plan to build.

## What this is not

See [`docs/NOT_REPLICATED.md`](docs/NOT_REPLICATED.md) for the honest list — citizen development, connector library, inherited compliance, on-call. [`docs/COST_MODEL.md`](docs/COST_MODEL.md) has the seat math, and [`KEY_DECISIONS.md`](KEY_DECISIONS.md) the scope and architecture rationale.
