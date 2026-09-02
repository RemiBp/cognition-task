"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { switchUser } from "@/app/actions";

export function RoleSwitcher({
  users,
  currentId,
}: {
  users: { id: string; name: string; role: string }[];
  currentId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <label className="flex items-center gap-2.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
      Demo identity
      <select
        className="h-9 rounded-sm border border-line bg-white px-3 text-sm font-medium normal-case tracking-normal text-ink outline-none focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
        value={currentId}
        disabled={pending}
        onChange={(event) => {
          const id = event.target.value;
          startTransition(async () => {
            await switchUser(id);
            router.refresh();
          });
        }}
      >
        {users.map((user) => (
          <option key={user.id} value={user.id}>
            {user.name} · {user.role}
          </option>
        ))}
      </select>
    </label>
  );
}
