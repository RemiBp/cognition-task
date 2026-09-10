# Internal Tools Platform

An owned alternative to a low-code internal tool platform (Power Apps / Retool). The initial working slice was built with Devin in roughly two hours as a proof of concept for a Series C fintech.

The bet behind it: the expensive part of Power Apps is not the screen builder, it is the platform underneath, meaning identity, authorization, audit, approvals and hosted data. This prototype builds a narrow version of *that* layer once, then uses the client's three existing tools to exercise it. A fourth workflow, `/disputes`, was then scaffolded from that layer with one command to show what the next tool costs; integrations and novel workflows still require engineering.

## What it does

Platform layer (`platform/`)

- **Auth seam.** A demo session cookie today, shaped so a real OIDC callback (Entra ID, Okta) can replace it without touching call sites. SSO is a future integration, not something this prototype does: it would bring the callback and session handling, token lifetime and revocation, and the group→role mapping, which is the piece this code is already shaped around.
- **Server-side RBAC.** Four roles (`viewer`, `analyst`, `approver`, `admin`). Permissions are checked inside the action layer, never in the browser, so hiding a button is cosmetic and not a control.
- **Runtime-safe actions.** Every client payload is validated with Zod and its audit resource id is derived server-side, so TypeScript types are not mistaken for a trust boundary.
- **Central action audit.** Every mutation writes actor, role, action, resource, before/after snapshot, reason and request id. Denied attempts are logged too. The prototype has no update/delete path; production still needs database-enforced immutability or an external audit sink.
- **Maker-checker approvals.** A reusable primitive. An action declared `requiresApproval` never mutates directly: it creates an approval request, and a second human with `approver`/`admin` executes it. Self-approval is rejected server-side, including for an admin. A pending proposal holds a database-side reservation, so one record carries one open proposal at a time; rejecting it leaves the record as it was and frees the record for a new one.
- **Shared availability policy.** `platform/policy.ts` answers, for one action on one record, whether the current actor may run it and why not. Pages render controls from that answer, disabled and with the reason visible, and `execute()` evaluates the same policy again inside the transaction. An action with no declared policy is unavailable rather than allowed.
- **Concurrency.** Every mutating payload carries the record version it was rendered from, applied as a compare-and-set, so a stale tab is refused instead of overwriting a newer decision. The approval claim, the domain write and the success audit entry share one transaction; denials and failures are logged outside it so they survive the rollback. A repeated submit of the same intent reuses its open proposal, while a different payload is refused as a conflict.
- **Typed data layer.** The Prisma schema is the single source of truth for tables, and generated types flow into pages and actions.
- **UI kit.** Server-paginated data table with search, status badges, cards, and `ActionControls`, which renders whatever the policy allows and keeps the rest visible, disabled and explained.

Apps (`app/`)

- `/kyc`: KYC review queue, with a case page at `/kyc/[caseId]` showing the reference, the synthetic evidence summary, the recorded reasoning, what happens next and the case history. Decisions require a second approver; escalation is immediate but audited.
- `/refunds`: refunds dashboard with pending exposure. Approvals go through maker-checker, rejections are direct.
- `/flags`: feature flag admin. Admin-only, immediate, and routed through the shared audit path.
- `/disputes`: card disputes queue for support. A refund is proposed and executed by a second approver; closing without a refund is admin-only.
- `/approvals`: the shared approval inbox.
- `/audit`: the shared audit trail with before/after diffs.

## Run it

Requires Node 20.9+.

```bash
npm install
npm run setup   # prisma db push + seed (SQLite, no external services)
npm run dev
```

`npm test` exercises the highest-risk paths on a throwaway database: denied and forged actions,
runtime payload validation, stale versions, duplicate and conflicting proposals, self-approval,
second-person execution, concurrent proposals and approvals, rollback on failure, and the upgrade
of a populated database created before this revision.

If you already have a `dev.db` from an earlier revision, `npm run setup` stops and tells you to
upgrade in place rather than reset:

```bash
npm run upgrade && npm run db:push   # adds and backfills the new columns, keeps the rows
```

Stop the application first. The upgrade reads which proposals are still open before it writes, so
a decision taken on the old revision while it runs would race it; releasing a proposal refuses to
overwrite one that was decided in the meantime and reports it instead of guessing.

Open http://localhost:3000. The database is a local SQLite file. A production move to Postgres also requires migrations, deployment, backups, database permissions and integration testing; changing the Prisma datasource is only the first step.

## Demo users

Switch identity with the menu in the header:

| User | Role | Can do |
| --- | --- | --- |
| `dana.viewer@northwindpay.com` | viewer | read only |
| `sam.analyst@northwindpay.com` | analyst | propose KYC/refund decisions |
| `priya.approver@northwindpay.com` | approver | decide pending approvals |
| `alex.admin@northwindpay.com` | admin | feature flags, direct dispute close, and deciding other people's proposals |

Admin is not a bypass for maker-checker actions: an admin cannot approve their own proposal. Actions explicitly configured for direct execution, such as closing a dispute, do not require a proposal.

Switching identity here is a demo device, not a login.

## Suggested demo path

1. As **analyst**, try to toggle a feature flag → the control is visibly read-only, and a forged call is denied server-side and appears in `/audit`.
2. Open the demo case `KYC-DEMO-001` (Mateo Moreau). Its file carries an adverse media hit that may or may not be the same person, which is the point: as **analyst** you can escalate it with a reason, but not clear it.
3. As **approver**, record the reasoning that resolves the collision and propose approval. Nothing changes on the case yet, and the proposal is now visible to everyone, including after a reload.
4. As **admin**, approve it from `/approvals`. The proposer could not have done this themselves.
5. Open `/audit` and the case page → the same customer, reference and reasoning, not just ids.

The same walkthrough runs headless against an isolated database, which never touches `dev.db`:

```bash
npm run demo:reset && npm run demo:journey
```

The same trail is readable from a terminal, which is useful when demoing side by side with the UI:

```bash
npm run audit                                    # last 20 entries
npm run audit -- --resource dispute --watch       # follow one app live
```

## Adding the next app

`/disputes` was built this way. The next one starts the same:

```bash
npm run new-app -- --slug chargebacks --name "Chargebacks queue" --purpose "Track and contest card chargebacks."
npm run db:push
```

The generator adds the Prisma model, an action registered in the policy layer, a page with server-side search and pagination, the navigation entry and the registry import. Restart the dev server and the new workflow starts from the same control path. This demonstrates lower scaffolding effort for the CRUD-shaped portion of the roadmap, not zero marginal cost. Integrations, domain logic, review and operations remain engineering work.

## What this is not

See [`docs/NOT_REPLICATED.md`](docs/NOT_REPLICATED.md) for the honest list: citizen development, connector library, inherited compliance, on-call. [`docs/COST_MODEL.md`](docs/COST_MODEL.md) has the licensing shape and what to cost against it, and [`KEY_DECISIONS.md`](KEY_DECISIONS.md) the scope and architecture rationale.

The same KYC queue was also built in a live Power Apps tenant and timed, so the comparison is first-hand: [`docs/POWER_APPS_COMPARISON.md`](docs/POWER_APPS_COMPARISON.md).
