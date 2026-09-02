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
    <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <form action={basePath} className="flex items-center gap-2 border-b border-slate-200 p-3">
        <input
          name="q"
          defaultValue={query.q ?? ""}
          placeholder={searchPlaceholder}
          className="w-72 rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <button
          type="submit"
          className="rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white"
        >
          Filter
        </button>
        <span className="ml-auto text-xs text-slate-500">
          {query.total} record{query.total === 1 ? "" : "s"} · server-side query
        </span>
      </form>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
            {columns.map((column) => (
              <th key={column.header} className={`px-3 py-2 font-medium ${column.className ?? ""}`}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-3 py-8 text-center text-slate-500">
                No records match this filter.
              </td>
            </tr>
          )}
          {rows.map((row) => (
            <tr key={row.id} className="border-b border-slate-100 last:border-0 align-middle">
              {columns.map((column) => (
                <td key={column.header} className={`px-3 py-2 ${column.className ?? ""}`}>
                  {column.cell(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pages > 1 && (
        <div className="flex items-center justify-between border-t border-slate-200 p-3 text-sm">
          <span className="text-slate-500">
            Page {page} of {pages}
          </span>
          <div className="flex gap-2">
            {page > 1 && (
              <Link href={href(page - 1)} className="rounded border border-slate-300 px-2 py-1">
                Previous
              </Link>
            )}
            {page < pages && (
              <Link href={href(page + 1)} className="rounded border border-slate-300 px-2 py-1">
                Next
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
