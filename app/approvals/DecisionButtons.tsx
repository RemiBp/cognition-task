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
          className="inline-flex h-8 items-center rounded-sm bg-brand-900 px-4 text-[12px] font-semibold text-white transition outline-none hover:bg-ink focus-visible:ring-2 focus-visible:ring-brand-900/25 disabled:opacity-40"
        >
          Approve
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => submit("rejected")}
          className="inline-flex h-8 items-center rounded-sm bg-white px-4 text-[12px] font-semibold text-ink ring-1 ring-inset ring-line transition outline-none hover:ring-ink/40 focus-visible:ring-2 focus-visible:ring-brand-900/25 disabled:opacity-40"
        >
          Reject
        </button>
      </div>
      {message && (
        <span
          className={`max-w-sm border-r-2 pr-2 text-right text-[11px] font-medium leading-snug ${
            message.ok ? "border-brand-900 text-brand-900" : "border-rose-500 text-rose-800"
          }`}
        >
          {message.text}
        </span>
      )}
    </div>
  );
}
