"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { runAction } from "@/app/actions";
import { ActionToast } from "@/platform/ui/ActionToast";

export function FlagControl({
  flagId,
  flagName,
  enabled,
}: {
  flagId: string;
  flagName: string;
  enabled: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  return (
    <>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={`${enabled ? "Disable" : "Enable"} ${flagName}`}
        disabled={pending}
        onClick={() => {
          startTransition(async () => {
            setMessage(null);
            try {
              const result = await runAction(
                "feature_flag.toggle",
                { flagId, enabled: !enabled },
                flagId,
              );
              setMessage(result);
              router.refresh();
            } catch {
              setMessage({ ok: false, text: "The flag could not be updated. Please retry." });
            }
          });
        }}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full outline-none ring-offset-2 transition focus-visible:ring-2 focus-visible:ring-brand-900 disabled:cursor-wait disabled:opacity-50 ${
          enabled ? "bg-brand-900" : "bg-ink/15"
        }`}
      >
        <span
          aria-hidden
          className={`h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
      <ActionToast message={message} onDismiss={() => setMessage(null)} />
    </>
  );
}
