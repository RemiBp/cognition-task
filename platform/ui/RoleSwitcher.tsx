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
    <label className="flex items-center gap-2.5 text-[10px] font-extrabold uppercase tracking-[0.16em] text-muted">
      Demo identity
      <select
        className="rounded-md border border-line bg-white px-3 py-2 text-sm font-semibold normal-case tracking-normal text-ink outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100"
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
