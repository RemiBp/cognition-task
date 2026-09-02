# Working in this repo

Read this before adding a tool. It exists so that a new app — written by a person or by Devin — is governed without anyone remembering to make it so.

## Rules

1. **Never mutate data outside an action.** Business writes go through `registerAction()` in `platform/actions.ts` and are executed with `execute()`. That path is what enforces RBAC, writes the audit entry and snapshots before/after. A page or component that calls `db.*.update()` directly is a bug.
2. **Authorization is server-side.** Declare `roles` on the action. Hiding a button is presentation, not a control.
3. **Anything that moves money or clears a customer needs `requiresApproval: true`.** It then lands in the shared `/approvals` inbox and is executed by a second human.
4. **Query on the server.** Pages are server components; search, filter and pagination happen in Prisma, never by fetching everything and filtering in the browser.
5. **Reuse the kit.** `DataTable`, `PageHeader`, `StatusBadge`, `Card`, `ActionButton` from `platform/ui/`. New shared UI belongs there, not in an app folder.

## Adding a tool

```bash
npm run new-app -- --slug <slug> --name "<Name>" --purpose "<one line>"
npm run db:push
```

Then extend the generated Prisma model with the real fields, adjust the generated actions and table columns, and run `npm run typecheck && npm run lint`.

## Prompt template for Devin

> Add an internal tool `<name>` to this platform for `<team>`. It manages `<entity>` with fields `<fields>`. `<role>` can `<propose-action>`; that action requires maker-checker approval. `<role>` can `<direct-action>` directly. Follow AGENTS.md: start from `npm run new-app`, register every mutation as an action, keep search and pagination server-side, and reuse `platform/ui`. Run typecheck and lint, then open a PR.
