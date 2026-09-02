# What this prototype does not replicate

Written for the VP of Engineering, deliberately unflattering to the build case.

## Not replicated, and not cheap to replicate

- **Citizen development.** In Power Apps a compliance analyst can change their own screen or workflow without filing a ticket. Here, every change is a code change, a review and a deploy. This is the single largest capability lost, and it is a change to how the ops org works, not just to the tech stack.
- **Inherited compliance posture.** Microsoft's certifications, DPA, data residency options and audit attestations come with the subscription. Owning the platform means the client's own controls are what an auditor examines.
- **DLP and tenant-wide governance.** Power Platform DLP policies constrain what every app in the tenant may connect to. There is no equivalent here; it would have to be built or enforced by review.
- **Someone else's on-call.** Availability, patching and upgrades become the client's problem, permanently.
- **The connector library.** ~1,000 pre-built connectors, including gateways to on-premise SQL. Each integration here is bespoke work — usually small, never free.

## Present as a seam, not as a real implementation

- **Authentication.** The role switcher stores a demo user id in an unsigned, HTTP-only cookie; it is not authentication. Production needs a real OIDC callback, a signed session, and IdP-group→role mapping. This is a known, bounded piece of work, but it is not done.
- **Append-only audit.** Enforced by having no delete path in the code. Production should enforce it at the database (revoked DELETE/UPDATE grants, or an external write-once sink).
- **Data store.** SQLite for zero-setup review; Postgres for anything real. Row-level security, encryption at rest and backups are not configured.

## Risks I would flag before committing

- **Platform drift.** The primitives are clean at three apps. At thirteen, with staff turnover, they stay clean only if someone owns them. Budget the owner explicitly.
- **Narrow test coverage.** Six automated tests cover denied actions, invalid payloads, duplicate proposals, self-approval, second-person execution and concurrent approval clicks. Production still needs failure-recovery, broader concurrency, integration and end-to-end coverage before this can touch real money.
- **Agent-generated code still needs review.** Devin makes the marginal app nearly free to write; it does not make it free to review. The review budget is the real constraint on the 10-app plan.
