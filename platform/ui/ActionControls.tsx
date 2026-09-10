"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition } from "react";
import { runAction } from "@/app/actions";
import { ActionToast } from "./ActionToast";

export type ActionOption = {
  actionKey: string;
  payload: Record<string, unknown>;
  label: string;
  available: boolean;
  /** Why the control is disabled. Rendered, not hidden. */
  reason?: string;
  requiresReason: boolean;
  danger?: boolean;
};

/**
 * The only mutating control in the platform. It renders what the server-side
 * policy said, including the refusals: a control the current user cannot use
 * stays visible, focusable and explained, rather than disappearing.
 *
 * Availability here is presentation. `execute()` evaluates the same policy
 * again inside the transaction that writes, so a forged request or a stale tab
 * is refused by the server whatever the browser believed.
 */
export function ActionControls({
  actions,
  note,
}: {
  actions: ActionOption[];
  /** Extra sentence shown under the controls, e.g. what happens next. */
  note?: string | null;
}) {
  const router = useRouter();
  const reasonFieldId = useId();
  const [pending, startTransition] = useTransition();
  const [running, setRunning] = useState<string | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [reason, setReason] = useState("");
  /**
   * One identifier per intent to submit, kept until that submit succeeds.
   *
   * A retry after a lost response carries the same value, so the server
   * answers with the proposal it already created instead of opening a second
   * one; deciding to propose again later produces a new value, which the
   * server is right to treat as a new proposal.
   */
  const intents = useRef(new Map<string, string>());

  useEffect(() => {
    if (!message) return;
    const timeout = window.setTimeout(() => setMessage(null), 8000);
    return () => window.clearTimeout(timeout);
  }, [message]);

  const usable = actions.filter((action) => action.available);
  const needsReason = usable.some((action) => action.requiresReason);
  const reasons = Array.from(
    new Set(actions.filter((action) => !action.available && action.reason).map((a) => a.reason!)),
  );

  const submit = (action: ActionOption) =>
    startTransition(async () => {
      const controlKey = action.actionKey + String(action.payload.decision ?? "");
      setMessage(null);
      setRunning(controlKey);
      let intentKey = intents.current.get(controlKey);
      if (!intentKey) {
        intentKey = crypto.randomUUID();
        intents.current.set(controlKey, intentKey);
      }
      try {
        const payload = {
          ...action.payload,
          intentKey,
          ...(action.requiresReason ? { reasoning: reason.trim() } : {}),
        };
        const result = await runAction(action.actionKey, payload);
        setMessage(result);
        if (result.ok) {
          intents.current.delete(controlKey);
          setReason("");
        }
        router.refresh();
      } catch {
        setMessage({ ok: false, text: "The action could not be completed. Please retry." });
      } finally {
        setRunning(null);
      }
    });

  return (
    <div className="flex flex-col items-start gap-1.5">
      {needsReason && (
        <input
          id={reasonFieldId}
          value={reason}
          maxLength={1000}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason (required)"
          aria-label="Reason"
          className="h-8 w-56 rounded-md border border-line bg-white px-2.5 text-xs outline-none placeholder:text-ink/35 focus:border-brand-900 focus:ring-2 focus:ring-brand-900/15"
        />
      )}
      <span className="flex flex-wrap gap-1.5">
        {actions.map((action) => {
          const key = action.actionKey + String(action.payload.decision ?? "");
          const blockedByReason = action.available && action.requiresReason && !reason.trim();
          const disabled = !action.available || blockedByReason || pending;
          const styles = action.danger
            ? "bg-white text-ink/70 ring-1 ring-inset ring-line hover:text-rose-700 hover:ring-rose-300"
            : "bg-brand-900 text-white hover:bg-ink";

          return (
            <button
              key={key}
              type="button"
              disabled={disabled}
              aria-busy={running === key}
              aria-describedby={action.reason ? `${reasonFieldId}-why` : undefined}
              title={action.reason ?? (blockedByReason ? "Write a reason first." : undefined)}
              onClick={() => submit(action)}
              className={`inline-flex h-8 items-center justify-center gap-2 rounded-md px-3 text-[12px] font-semibold tracking-[-0.005em] transition outline-none focus-visible:ring-2 focus-visible:ring-brand-900/25 disabled:cursor-not-allowed disabled:opacity-55 ${styles}`}
            >
              {running === key && (
                <span
                  aria-hidden
                  className="h-3 w-3 animate-spin rounded-full border-2 border-current border-r-transparent"
                />
              )}
              {running === key ? "Working" : action.label}
            </button>
          );
        })}
      </span>
      {reasons.length > 0 && (
        <span id={`${reasonFieldId}-why`} className="max-w-xs text-[11px] leading-snug text-muted">
          {reasons.join(" ")}
        </span>
      )}
      {note && <span className="max-w-xs text-[11px] leading-snug text-muted">{note}</span>}
      <ActionToast message={message} onDismiss={() => setMessage(null)} />
    </div>
  );
}
