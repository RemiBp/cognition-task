"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { decideApproval } from "@/app/actions";
import { ActionToast } from "@/platform/ui/ActionToast";

export function DecisionButtons({ approvalId }: { approvalId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const submit = (decision: "approved" | "rejected") =>
    startTransition(async () => {
      setMessage(null);
      try {
        const result = await decideApproval(approvalId, decision, note.trim() || undefined);
        setMessage(result);
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "The decision could not be completed. Please retry." });
      }
    });

  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <input
        value={note}
        maxLength={500}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Decision note"
        aria-label="Decision note"
        className="h-8 w-44 rounded-md border border-line bg-white px-2.5 text-xs outline-none placeholder:text-ink/35 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
      />
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
      <ActionToast message={message} onDismiss={() => setMessage(null)} />
    </div>
  );
}
