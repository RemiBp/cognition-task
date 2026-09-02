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
    default: "bg-slate-900 text-white",
    danger: "bg-rose-600 text-white",
    quiet: "border border-slate-300 text-slate-700",
  }[variant];

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={`rounded px-2.5 py-1 text-xs font-medium disabled:opacity-50 ${styles}`}
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
          className={`max-w-xs text-[11px] leading-snug ${
            message.ok ? "text-emerald-700" : "text-rose-700"
          }`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}
