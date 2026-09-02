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
          className="rounded-md bg-brand-900 px-3.5 py-1.5 text-xs font-bold text-white transition hover:bg-brand-700 disabled:opacity-50"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("rejected")}
          className="rounded-md bg-white px-3.5 py-1.5 text-xs font-bold text-ink ring-1 ring-inset ring-line transition hover:bg-brand-50/50 disabled:opacity-50"
        >
          Reject
        </button>
      </div>
      {message && (
        <span
          className={`max-w-sm rounded-md px-1.5 py-1 text-right text-[11px] leading-snug ${
            message.ok ? "bg-brand-50 text-brand-900" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
