# Decisions behind the internal tools prototype

Remi Barbier | 10 September 2026

Follow-up to the original submission, tracked separately from its prototype timebox.

## Scope

I used Devin to build KYC, refunds and feature-flag tools around shared controls; Disputes tested extending them. The first version checked roles on the server, but some buttons did not reflect permissions or pending decisions. This follow-up addresses that gap and the consistency of approval execution. It adds no new application.

## 1. Make escalation a handoff

An analyst escalates with a reason; senior review owns the next step. A reviewer proposes a decision and a different authorised person approves it. Rejecting the proposal leaves the customer case in review. This is an operating policy to validate with the client, not a universal KYC rule. Explicit ownership reduces ambiguity, at the cost of another handoff.

## 2. Share policy, not just components

One server policy uses role, record state and pending proposals to determine available actions and explain restrictions. Execution checks it again. This avoids separate React and backend rules, but a shared defect can affect every tool, so the tests cross workflow boundaries. The generator and AGENTS.md guide contributors; neither prevents a future direct database write. Review remains necessary.

## 3. Keep local decisions in one transaction

I kept Next.js and Prisma in one application, with database-side search and pagination. Approval, the domain change and the success audit commit together. Record versions reject stale writes; a database constraint allows one pending proposal per record. A caller-supplied intent key distinguishes retries from new submissions. These choices simplify local consistency but require explicit retry handling. SQLite tests do not establish Postgres behaviour or reliable payment-provider delivery; those need separate validation.

## Devin and evidence

Devin implemented the revision in PR #8 against explicit acceptance criteria. Independent review found that a delayed retry could recreate a rejected proposal; Devin corrected it and added a regression. Verification covers escalation, self-approval, pending requests after refresh, conflicting submissions, stale versions, rollback and cold loading of a generated tool. This shows reviewed changes to an existing platform, not a measured productivity advantage.

## What this does not replace

Identity and payments are simulated. Production still needs an operated database, SSO, backups, monitoring and stronger audit enforcement. Power Apps also provides business-maker autonomy, connectors and managed platform capabilities. Owning the code transfers those responsibilities; Devin does not operate them for the client.

## Recommendation

Keep the three live apps. Pilot one new engineering-owned workflow with custom control needs and a named owner. Over two weeks, compare lead time, control evidence and estimated ownership cost with an equivalent Power Apps workflow. The $250K bill is not a savings estimate: Premium covers multiple apps per user. Compare avoidable licensing with engineering, Devin usage, hosting, migration and support, including time diverted from the core product. Expand only if the evidence supports it; keep buying where managed capabilities are worth more.

## Sources

- Implementation and verification: https://github.com/RemiBp/cognition-task/pull/8
- Microsoft licensing guidance: https://learn.microsoft.com/en-us/power-platform/admin/powerapps-flow-licensing-faq
