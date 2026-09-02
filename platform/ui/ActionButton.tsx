"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { runAction } from "@/app/actions";

/**
 * Every mutating control in every app goes through this component, which calls
 * one server action. Nothing is authorised in the browser: the button renders,
 * the server decides.
 */
export function ActionButton({
  actionKey,
  payload,
  label,
  resourceId,
  variant = "default",
}: {
  actionKey: string;
  payload: Record<string, unknown>;
  label: string;
  resourceId?: string;
  variant?: "default" | "danger" | "quiet";
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const styles = {
    default: "bg-brand-900 text-white hover:bg-ink",
    danger: "bg-white text-ink/70 ring-1 ring-inset ring-line hover:text-rose-700 hover:ring-rose-300",
    quiet: "bg-white text-ink ring-1 ring-inset ring-line hover:ring-ink/40",
  }[variant];

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={`inline-flex h-7 items-center rounded-sm px-3 text-[12px] font-semibold tracking-[-0.005em] transition outline-none focus-visible:ring-2 focus-visible:ring-brand-900/25 disabled:opacity-40 ${styles}`}
        onClick={() => {
          startTransition(async () => {
            const result = await runAction(actionKey, payload, resourceId);
            setMessage(result);
            router.refresh();
          });
        }}
      >
        {label}
      </button>
      {message && (
        <span
          className={`max-w-xs border-l-2 pl-2 text-[11px] font-medium leading-snug ${
            message.ok ? "border-brand-900 text-brand-900" : "border-rose-500 text-rose-800"
          }`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
