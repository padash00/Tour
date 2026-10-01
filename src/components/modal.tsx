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
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#03060bcc] backdrop-blur-sm animate-[fade_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        className={cn(
          "card relative w-full max-w-[420px] p-6 shadow-[0_24px_64px_-12px_#000] animate-[pop_.18s_ease-out]",
          tone === "danger" && "border-[#ef7a7a44]",
        )}
      >
        <div className="flex items-start gap-3">
          {tone === "danger" && (
            <span className="mt-0.5 grid place-items-center size-8 shrink-0 rounded-lg bg-danger-dim text-danger">!</span>
          )}
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
            {children && <div className="mt-2 text-sm text-fg-2 leading-relaxed">{children}</div>}
          </div>
        </div>
        {footer && <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>}
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
          <button type="button" data-autofocus className={buttonClass(danger ? "danger" : "primary")} onClick={onConfirm}>
            {confirmLabel}
          </button>
        </>
      }
    />
  );
}
