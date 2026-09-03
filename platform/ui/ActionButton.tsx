"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { runAction } from "@/app/actions";
import { ActionToast } from "./ActionToast";

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
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const styles = {
    default: "bg-brand-900 text-white hover:bg-ink",
    danger: "bg-white text-ink/70 ring-1 ring-inset ring-line hover:text-rose-700 hover:ring-rose-300",
    quiet: "bg-white text-ink ring-1 ring-inset ring-line hover:ring-ink/40",
  }[variant];

  return (
    <span className="inline-flex">
      <button
        type="button"
        disabled={pending || locked}
        aria-busy={pending}
        className={`inline-flex h-8 min-w-[68px] items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold tracking-[-0.005em] transition outline-none focus-visible:ring-2 focus-visible:ring-brand-900/25 disabled:cursor-not-allowed disabled:opacity-55 ${styles}`}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            try {
              const result = await runAction(actionKey, payload, resourceId);
              setMessage(result);
              if (result.ok && result.text.startsWith("Approval requested")) setLocked(true);
              router.refresh();
            } catch {
              setMessage({
                ok: false,
                text: "The action could not be completed. Please retry.",
              });
            }
          });
        }}
      >
        {pending && (
          <span
            aria-hidden
            className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
          />
        )}
        {pending ? "Working" : locked ? "Requested" : label}
      </button>
      <ActionToast message={message} onDismiss={() => setMessage(null)} />
    </span>
  );
}
