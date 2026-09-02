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
    <div className="overflow-hidden rounded-lg border border-line bg-white">
      <form
        action={basePath}
        className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3.5"
      >
        <input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder={searchPlaceholder}
          className="w-72 rounded-md border border-line bg-white px-3 py-2 text-sm outline-none placeholder:text-zinc-400 focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
        />
        {filters}
        <button
          type="submit"
          className="rounded-md bg-brand-900 px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-700"
        >
          Filter
        </button>
        <span className="ml-auto text-[11px] font-bold uppercase tracking-[0.1em] text-muted">
          <span className="text-brand-900 tabular-nums">{query.total}</span> record
          {query.total === 1 ? "" : "s"} · server-side query
        </span>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-line bg-canvas text-left text-[10px] uppercase tracking-[0.14em] text-muted">
            {columns.map((column) => (
              <th
                key={column.header}
                className={`px-4 py-3 font-extrabold ${column.className ?? ""}`}
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
              className="border-b border-line/70 align-middle transition last:border-0 hover:bg-brand-50/50"
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

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-line px-4 py-3.5 text-sm">
          <span className="text-muted">
            Page <span className="font-bold text-ink">{page}</span> of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={href(page - 1)}
                className="rounded-md border border-line bg-white px-3.5 py-1.5 text-sm font-bold text-brand-900 transition hover:bg-brand-50"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={href(page + 1)}
                className="rounded-md border border-line bg-white px-3.5 py-1.5 text-sm font-bold text-brand-900 transition hover:bg-brand-50"
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
