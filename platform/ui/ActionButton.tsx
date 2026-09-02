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
    default: "bg-brand-900 text-white hover:bg-brand-700",
    danger: "bg-white text-rose-700 ring-1 ring-inset ring-rose-200 hover:bg-rose-50",
    quiet: "bg-white text-brand-900 ring-1 ring-inset ring-line hover:bg-brand-50",
  }[variant];

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={`rounded-md px-3 py-1.5 text-xs font-bold transition disabled:opacity-50 ${styles}`}
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
          className={`max-w-xs rounded-md px-2 py-1 text-[11px] font-semibold leading-snug ${
            message.ok ? "bg-brand-50 text-brand-900" : "bg-rose-50 text-rose-800"
          }`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
