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
      className="h-9 rounded-sm border border-line bg-white px-3 text-sm outline-none focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
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
