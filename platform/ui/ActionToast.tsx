"use client";

import { createPortal } from "react-dom";

export function ActionToast({
  message,
  onDismiss,
}: {
  message: { ok: boolean; text: string } | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={`fixed right-6 bottom-6 z-50 flex w-[min(380px,calc(100vw-3rem))] items-start gap-3 rounded-lg border bg-white p-4 text-sm shadow-[0_16px_48px_rgba(0,16,18,0.18)] ${
        message.ok ? "border-brand-100 text-ink" : "border-rose-200 text-rose-950"
      }`}
    >
      <span
        aria-hidden
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${
          message.ok ? "bg-brand-900" : "bg-rose-600"
        }`}
      >
        {message.ok ? "✓" : "!"}
      </span>
      <span className="min-w-0 flex-1 leading-relaxed">{message.text}</span>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={onDismiss}
        className="text-lg leading-none text-muted transition hover:text-ink"
      >
        ×
      </button>
    </div>,
    document.body,
  );
}
