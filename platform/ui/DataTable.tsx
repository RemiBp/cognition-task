import Link from "next/link";
import type { ReactNode } from "react";

export type Column<T> = {
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
};

export type TableQuery = {
  q?: string;
  page?: number;
  pageSize: number;
  total: number;
  /** Extra filter params carried through search and pagination links. */
  params?: Record<string, string>;
};

/**
 * Filtering, sorting and pagination happen in the database query that feeds
 * this table — not in the browser. Power Apps cannot always promise that: when
 * a Power Fx expression is not delegable it pulls 500 rows (2,000 at most) and
 * filters client-side, which silently returns partial results at scale.
 */
export function DataTable<T extends { id: string }>({
  rows,
  columns,
  query,
  basePath,
  searchPlaceholder = "Search…",
  filters,
}: {
  rows: T[];
  columns: Column<T>[];
  query: TableQuery;
  basePath: string;
  searchPlaceholder?: string;
  filters?: ReactNode;
}) {
  const page = query.page ?? 1;
  const pages = Math.max(1, Math.ceil(query.total / query.pageSize));
  const href = (nextPage: number) =>
    `${basePath}?${new URLSearchParams({
      ...(query.q ? { q: query.q } : {}),
      ...(query.params ?? {}),
      page: String(nextPage),
    })}`;

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-white shadow-[0_1px_2px_rgba(0,16,18,0.03)]">
      <form
        action={basePath}
        className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5"
      >
        <input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder={searchPlaceholder}
          className="h-9 w-72 rounded-sm border border-line bg-white px-3 text-sm outline-none placeholder:text-ink/35 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
        />
        {filters}
        <button
          type="submit"
          className="inline-flex h-9 items-center rounded-sm bg-brand-900 px-4 text-[13px] font-semibold text-white transition outline-none hover:bg-ink focus-visible:ring-2 focus-visible:ring-brand-900/25"
        >
          Filter
        </button>
        <span className="ml-auto text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
          <span className="font-bold text-ink tabular-nums">{query.total}</span> record
          {query.total === 1 ? "" : "s"} · server-side query
        </span>
      </form>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b border-line text-left text-[10px] uppercase tracking-[0.16em] text-muted">
              {columns.map((column) => (
                <th
                  key={column.header}
                  className={`px-4 py-3 font-semibold ${column.className ?? ""}`}
                >
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-14 text-center text-muted">
                  No records match this filter.
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr
                key={row.id}
                className="border-b border-line/60 align-middle transition last:border-0 hover:bg-canvas"
              >
                {columns.map((column) => (
                  <td key={column.header} className={`px-4 py-3 ${column.className ?? ""}`}>
                    {column.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3.5 text-sm">
          <span className="text-muted">
            Page <span className="font-bold text-ink">{page}</span> of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={href(page - 1)}
                className="inline-flex h-8 items-center rounded-sm border border-line bg-white px-3.5 text-[13px] font-semibold text-ink transition hover:border-ink/40"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={href(page + 1)}
                className="inline-flex h-8 items-center rounded-sm border border-line bg-white px-3.5 text-[13px] font-semibold text-ink transition hover:border-ink/40"
              >
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
