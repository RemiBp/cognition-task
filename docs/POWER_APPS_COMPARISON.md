# What Power Apps actually gave us in 20 minutes

We did not evaluate Power Apps from documentation. We built the same use case — a KYC review
queue — in a live Power Apps tenant (Dataverse, model-driven app) and timed it. This is what we
observed, so the comparison below is first-hand rather than inferred.

## What we built there

A 10-row KYC case list (`Case Reference`, `Customer Name`, `Country`, `Risk Score`,
`Document Type`, `Status`, `Submitted On`) imported from CSV, which Power Apps mapped into a
Dataverse table, then a generated model-driven app published to the tenant.

Elapsed time: about 20 minutes, most of it waiting on Dataverse provisioning and publish.

![Power Apps app designer](images/powerapps-app-designer.png)
![Published app, list view](images/powerapps-runtime-list.png)
![Published app, record form](images/powerapps-runtime-form.png)

## What it gave us for free, and we did not build

- A typed table with generated views and forms, sortable columns, keyword filter, column and
  filter editors exposed to the end user at runtime.
- Per-record ownership, record sharing, an "check access" command, and assignment — record-level
  security primitives that come from Dataverse, not from the app.
- Entra ID identity, hosting, backup, and Microsoft's compliance posture.
- Entry points to Power Automate flows and "visualize this view in Power BI" from the same toolbar.
- Choice columns inferred from the CSV values (`Status`, `Document Type` became option sets).

Our prototype does not attempt any of this. Our authentication is a demo cookie, our data layer is
SQLite, and there is no reporting or automation surface.

## What it did not give us, and matters for fintech

- **No maker-checker.** The generated app lets a single user edit `Status` on a KYC case and save.
  Enforcing "an analyst proposes, a different approver executes" requires custom columns plus a
  Power Automate flow plus a business rule — i.e. exactly the governance work we put in the
  platform layer, done per app and outside version control.
- **No action-level audit of intent.** Dataverse auditing (when enabled) records field changes. It
  does not record a denied attempt, a proposal, or who approved what and why. Our `AuditLog` records
  `denied`, `proposed`, `approved` and `executed` for every action, with before/after snapshots.
- **Governance is per-record, not per-action.** Security roles and record ownership answer "who can
  see or edit this row", not "who may approve a refund above 500 EUR".
- **Storage is a live constraint.** The tenant surfaced a permanent banner: less than 15% Dataverse
  capacity remaining. Capacity, not seats alone, is a cost lever nobody models up front.
- **Locale is not app-scoped.** The maker portal renders in English while the published app renders
  in French (`Enregistrer`, `Nb de lignes`, `Actualiser`) because it follows the user's tenant
  language. Mixed-language internal tooling is not something the app author controls cheaply.
- **The app is not a reviewable artifact.** There is no diff, no PR, no test. Changes are made by a
  maker in a browser against a solution, and correctness rests on the maker.

## Honest read

For the shape of app we built — a list, a form, a status field — Power Apps is faster than us and
will stay faster. Twenty minutes with no code, and the end user gets column and filter editing we
would have to build.

The moment the requirement is "this decision needs two people and a defensible trail", the
platform stops helping and the work moves into per-app flows that are hard to review. That is the
line the recommendation in `KEY_DECISIONS.md` is drawn on: keep Power Apps where the app is a form
over a table, own the platform where the app is a control.
