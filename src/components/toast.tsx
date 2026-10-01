"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "./ui";

/*
 * Глобальные уведомления сайта (тосты) — правый верхний угол.
 * ActionForm показывает сюда результат серверного действия автоматически.
 */

type ToastTone = "success" | "error" | "info";
type Toast = { id: number; tone: ToastTone; text: string };
type ToastApi = {
  show: (text: string, tone?: ToastTone) => void;
  success: (text: string) => void;
  error: (text: string) => void;
  info: (text: string) => void;
};

const noop = () => {};
const ToastContext = createContext<ToastApi>({ show: noop, success: noop, error: noop, info: noop });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);

  const dismiss = useCallback((id: number) => setItems((list) => list.filter((t) => t.id !== id)), []);

  const show = useCallback((text: string, tone: ToastTone = "info") => {
    const id = ++seq.current;
    // не больше четырёх одновременно — старые уходят
    setItems((list) => [...list.slice(-3), { id, tone, text }]);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (t) => show(t, "success"),
      error: (t) => show(t, "error"),
      info: (t) => show(t, "info"),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-4 top-4 z-[120] flex flex-col items-end gap-2.5 sm:inset-x-auto sm:right-6 sm:top-6 sm:w-[380px]"
        aria-live="polite"
        role="status"
      >
        {items.map((t) => (
          <ToastItem key={t.id} toast={t} onClose={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

const TONE: Record<ToastTone, { bar: string; icon: ReactNode }> = {
  success: {
    bar: "bg-ok",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px] text-ok" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="m5 12.5 4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  error: {
    bar: "bg-danger",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px] text-danger" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <path d="M12 7.5v5.5M12 16.5h.01" strokeLinecap="round" />
        <circle cx="12" cy="12" r="9" />
      </svg>
    ),
  },
  info: {
    bar: "bg-accent",
    icon: (
      <svg viewBox="0 0 24 24" className="size-[18px] text-accent" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5M12 7.5h.01" strokeLinecap="round" />
      </svg>
    ),
  },
};

function ToastItem({ toast, onClose }: { toast: Toast; onClose: () => void }) {
  // длинный текст держим дольше
  useEffect(() => {
    const ms = Math.min(9000, 3500 + toast.text.length * 40);
    const id = setTimeout(onClose, ms);
    return () => clearTimeout(id);
  }, [toast.text, onClose]);

  const tone = TONE[toast.tone];
  return (
    <div
      className={cn(
        "pointer-events-auto relative flex w-full items-start gap-3 overflow-hidden rounded-[10px] border border-white/[0.1]",
        "bg-surface-2/95 py-3.5 pl-4 pr-10 shadow-[var(--shadow-pop)] backdrop-blur-xl animate-[toast-in_.22s_cubic-bezier(.2,.8,.2,1)]",
      )}
    >
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", tone.bar)} />
      <span className="mt-px shrink-0">{tone.icon}</span>
      <p className="text-[14px] leading-[1.5] text-fg">{toast.text}</p>
      <button
        type="button"
        onClick={onClose}
        aria-label="Закрыть"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-fg-3 transition-colors hover:bg-white/[0.06] hover:text-fg"
      >
        <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
