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
      className="rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
