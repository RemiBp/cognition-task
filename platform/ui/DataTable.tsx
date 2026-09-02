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
}: {
  rows: T[];
  columns: Column<T>[];
  query: TableQuery;
  basePath: string;
  searchPlaceholder?: string;
}) {
  const page = query.page ?? 1;
  const pages = Math.max(1, Math.ceil(query.total / query.pageSize));
  const href = (nextPage: number) =>
    `${basePath}?${new URLSearchParams({
      ...(query.q ? { q: query.q } : {}),
      page: String(nextPage),
    })}`;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm ring-1 ring-slate-900/[0.02]">
      <form
        action={basePath}
        className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-3"
      >
        <input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder={searchPlaceholder}
          className="w-72 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm shadow-sm outline-none placeholder:text-slate-400 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
        <button
          type="submit"
          className="rounded-lg bg-slate-900 px-3.5 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-slate-800"
        >
          Filter
        </button>
        <span className="ml-auto text-xs text-slate-500">
          <span className="font-medium text-slate-700 tabular-nums">{query.total}</span> record
          {query.total === 1 ? "" : "s"} · server-side query
        </span>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-white text-left text-[11px] uppercase tracking-wider text-slate-500">
            {columns.map((column) => (
              <th
                key={column.header}
                className={`px-4 py-2.5 font-semibold ${column.className ?? ""}`}
              >
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12 text-center text-slate-500">
                No records match this filter.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr
              key={row.id}
              className="border-b border-slate-100 align-middle transition last:border-0 hover:bg-slate-50"
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
        <div className="flex items-center justify-between border-t border-slate-200 bg-slate-50/60 px-4 py-3 text-sm">
          <span className="text-slate-500">
            Page <span className="font-medium text-slate-700">{page}</span> of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link
                href={href(page - 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 shadow-sm transition hover:bg-slate-100"
              >
                Previous
              </Link>
            )}
            {page < pages && (
              <Link
                href={href(page + 1)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1 shadow-sm transition hover:bg-slate-100"
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
