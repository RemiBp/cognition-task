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
    <label className="flex items-center gap-2 text-xs text-slate-500">
      Demo identity
      <select
        className="rounded border border-slate-300 bg-white px-2 py-1 text-sm text-slate-900"
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
