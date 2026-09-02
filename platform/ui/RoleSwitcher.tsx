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
    <label className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-slate-400">
      Demo identity
      <select
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm font-normal normal-case tracking-normal text-slate-900 shadow-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
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
