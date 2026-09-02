"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideApproval } from "@/app/actions";

export function DecisionButtons({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const submit = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      const result = await decideApproval(approvalId, decision);
      setMessage(result);
      router.refresh();
    });

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex gap-1.5">
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("approved")}
          className="rounded bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("rejected")}
          className="rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {message && (
        <span
          className={`max-w-sm text-right text-[11px] leading-snug ${
            message.ok ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
