/**
 * A review queue defaults to what still needs a human. Selecting a status is a
 * server round trip on purpose: the filter is part of the database query, not a
 * client-side slice of a truncated page.
 */
export function StatusFilter({
  value,
  statuses,
}: {
  value: string;
  statuses: readonly string[];
}) {
  return (
    <select
      name="status"
      defaultValue={value}
      className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
    >
      <option value="open">Needs review</option>
      <option value="all">All statuses</option>
      {statuses.map((status) => (
        <option key={status} value={status}>
          {status}
        </option>
      ))}
    </select>
  );
}
