# Working in this repo

Read this before adding a tool. It exists so that a new app — written by a person or by Devin — is governed without anyone remembering to make it so.

## Rules

1. **Never mutate data outside an action.** Business writes go through `registerAction()` in `platform/actions.ts` and are executed with `execute()`. That path is what enforces RBAC, writes the audit entry and snapshots before/after. A page or component that calls `db.*.update()` directly is a bug.
2. **Authorization is server-side.** Declare `roles` on the action. Hiding a button is presentation, not a control.
3. **Validate the boundary.** Every action declares a Zod `schema` and derives its canonical `resourceId` from the validated payload. Never trust an id supplied separately by the browser.
4. **Anything that moves money or clears a customer needs `requiresApproval: true`.** It then lands in the shared `/approvals` inbox and is executed by a second human.
5. **Query on the server.** Pages are server components; search, filter and pagination happen in Prisma, never by fetching everything and filtering in the browser.
6. **Reuse the kit.** `DataTable`, `PageHeader`, `StatusBadge`, `Card`, `ActionButton` from `platform/ui/`. New shared UI belongs there, not in an app folder.

## Adding a tool

```bash
npm run new-app -- --slug <slug> --name "<Name>" --purpose "<one line>"
npm run db:push
```

Restart `npm run dev` after `db:push` — a running server holds the old Prisma client and the new
route will throw. Then extend the generated Prisma model with the real fields, adjust the generated
actions and table columns, and run `npm run typecheck && npm run lint`.

Removing a generated app also means deleting `.next/types/app/<slug>`, otherwise typecheck still
resolves its stale route types.

## Prompt template for Devin

> Add an internal tool `<name>` to this platform for `<team>`. It manages `<entity>` with fields `<fields>`. `<role>` can `<propose-action>`; that action requires maker-checker approval. `<role>` can `<direct-action>` directly. Follow AGENTS.md: start from `npm run new-app`, register every mutation as an action, keep search and pagination server-side, and reuse `platform/ui`. Run typecheck and lint, then open a PR.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
