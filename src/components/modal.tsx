"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { buttonClass, cn } from "./ui";

/** Модальное окно сайта (вместо window.confirm / alert браузера) */
export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  tone = "neutral",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  tone?: "neutral" | "danger";
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      // фокус не выходит за пределы окна
      if (e.key === "Tab" && panel.current) {
        const items = panel.current.querySelectorAll<HTMLElement>("button, a, input, select, textarea, [tabindex]");
        if (!items.length) return;
        const first = items[0];
        const last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center p-4 sm:items-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#03060bd9] backdrop-blur-[6px] animate-[fade_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          "relative w-full max-w-[460px] overflow-hidden rounded-[14px] border bg-surface-2 shadow-[var(--shadow-pop)] animate-[pop_.2s_cubic-bezier(.2,.8,.2,1)]",
          tone === "danger" ? "border-danger/30" : "border-white/[0.1]",
        )}
      >
        {tone === "danger" && <span className="absolute inset-x-0 top-0 h-[2px] bg-danger/70" />}
        <div className="p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-[10px] border",
                tone === "danger" ? "border-danger/30 bg-danger/[0.1] text-danger" : "border-accent/25 bg-accent/[0.08] text-accent",
              )}
            >
              <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                {tone === "danger" ? (
                  <path d="M12 8v5M12 16.5h.01M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" strokeLinecap="round" strokeLinejoin="round" />
                ) : (
                  <path d="M9.5 9a2.5 2.5 0 1 1 3.6 2.3c-.7.3-1.1 1-1.1 1.7v.5M12 17h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinecap="round" strokeLinejoin="round" />
                )}
              </svg>
            </span>
            <div className="min-w-0 pt-1">
              <h2 className="text-[18px] font-semibold leading-snug tracking-[-0.01em] text-fg">{title}</h2>
              {children && <div className="mt-2 text-[14px] leading-relaxed text-fg-2">{children}</div>}
            </div>
          </div>
        </div>
        {footer && (
          <div className="flex flex-col-reverse gap-2 border-t border-white/[0.06] bg-black/[0.15] px-6 py-4 sm:flex-row sm:justify-end sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Окно подтверждения: «Отмена» / «Подтвердить» */
export function ConfirmModal({
  open,
  message,
  confirmLabel = "Подтвердить",
  danger,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={message}
      tone={danger ? "danger" : "neutral"}
      footer={
        <>
          <button type="button" className={buttonClass("ghost")} onClick={onCancel}>
            Отмена
          </button>
          <button type="button" data-autofocus className={buttonClass(danger ? "danger" : "primary", "md", "sm:min-w-[140px]")} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
