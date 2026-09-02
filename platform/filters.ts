/**
 * Translates the status filter into a Prisma `where` fragment. `open` is the
 * set of statuses that still need a human, which is what a queue shows first.
 */
export function statusWhere(value: string, open: readonly string[]) {
  if (value === "all") return {};
  if (value === "open") return { status: { in: [...open] } };
  return { status: value };
}
