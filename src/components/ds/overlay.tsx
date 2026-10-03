"use client";

import { X } from "lucide-react";
import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Button, IconButton } from "./button";
import { cn } from "./cn";

/*
 * Всплывающие слои F16 DS — одна основа:
 *   Dialog  — короткий вопрос или форма по центру (на телефоне снизу)
 *   Sheet   — панель сбоку (настройки, приглашение); на телефоне — снизу на всю высоту
 *   ConfirmDialog — подтверждение необратимого: «Забанить Mirage?»
 *   Menu    — выпадающее меню действий «⋯»; опасные пункты отделены
 *   Tooltip — только пояснение. Критичные инструкции в тултип не прятать
 * Все: портал в body, затемнение, Esc, ловушка фокуса, возврат фокуса, блок прокрутки, тень только здесь.
 */

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Фокус внутри слоя, Esc закрывает, после закрытия фокус возвращается туда, откуда открыли */
function useModal(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close.current();
      }
      if (e.key === "Tab" && panel.current) {
        const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
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
    const auto = panel.current?.querySelector<HTMLElement>("[data-autofocus]") ?? panel.current?.querySelector<HTMLElement>(FOCUSABLE);
    auto?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
      back?.focus?.();
    };
  }, [open]);
  return panel;
}

function Layer({ children, onClose, align }: { children: ReactNode; onClose: () => void; align: "center" | "right" }) {
  return createPortal(
    <div className={cn("fixed inset-0 z-[100] flex", align === "center" ? "items-end justify-center sm:items-center sm:p-4" : "items-end justify-center sm:items-stretch sm:justify-end")}>
      <div className="absolute inset-0 bg-overlay backdrop-blur-[4px] animate-[fade_var(--dur-modal)_ease-out]" onClick={onClose} aria-hidden />
      {children}
    </div>,
    document.body,
  );
}

export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  size?: "sm" | "md" | "lg";
}) {
  const panel = useModal(open, onClose);
  const titleId = useId();
  if (!open || typeof document === "undefined") return null;
  const max = { sm: "sm:max-w-[400px]", md: "sm:max-w-[480px]", lg: "sm:max-w-[640px]" }[size];
  return (
    <Layer onClose={onClose} align="center">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cn(
          "relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-feature border border-line bg-elevated shadow-[var(--shadow-pop)] sm:rounded-feature",
          "animate-[pop_var(--dur-modal)_cubic-bezier(.2,.8,.2,1)]",
          max,
        )}
      >
        <div className="flex items-start gap-4 px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-title text-fg">
              {title}
            </h2>
            {description && <p className="mt-1.5 text-[14px] leading-relaxed text-fg-2">{description}</p>}
          </div>
          <IconButton label="Закрыть" size="sm" onClick={onClose} className="-mr-1.5 -mt-1">
            <X />
          </IconButton>
        </div>
        {children && <div className="min-h-0 flex-1 overflow-y-auto px-5 pt-4 pb-5 sm:px-6">{children}</div>}
        {footer && <div className="flex flex-col-reverse gap-2 border-t border-line-subtle px-5 py-4 sm:flex-row sm:justify-end sm:px-6">{footer}</div>}
        {!children && !footer && <div className="pb-5" />}
      </div>
    </Layer>
  );
}

/** Боковая панель: настройки, приглашение, фильтры. На телефоне — снизу почти на весь экран */
export function Sheet({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  width = 600,
  nav,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
  /** внутренняя навигация по разделам (вкладки сверху) */
  nav?: ReactNode;
}) {
  const panel = useModal(open, onClose);
  const titleId = useId();
  if (!open || typeof document === "undefined") return null;
  return (
    <Layer onClose={onClose} align="right">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        style={{ "--sheet-w": `${width}px` } as React.CSSProperties}
        className={cn(
          "relative flex max-h-[94dvh] w-full flex-col overflow-hidden rounded-t-feature border border-line bg-elevated shadow-[var(--shadow-pop)]",
          "sm:h-full sm:max-h-none sm:w-[var(--sheet-w)] sm:max-w-[calc(100vw-48px)] sm:rounded-none sm:rounded-l-feature sm:border-y-0 sm:border-r-0",
          "animate-[sheet-in-y_var(--dur-modal)_cubic-bezier(.2,.8,.2,1)] sm:animate-[sheet-in-x_var(--dur-modal)_cubic-bezier(.2,.8,.2,1)]",
        )}
      >
        <div className="flex items-start gap-4 border-b border-line-subtle px-5 py-4 sm:px-6">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-title text-fg">
              {title}
            </h2>
            {description && <p className="mt-1 text-meta text-fg-3">{description}</p>}
          </div>
          <IconButton label="Закрыть" size="sm" onClick={onClose} className="-mr-1.5">
            <X />
          </IconButton>
        </div>
        {nav && <div className="border-b border-line-subtle px-5 sm:px-6">{nav}</div>}
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
        {footer && <div className="border-t border-line-subtle px-5 py-4 sm:px-6">{footer}</div>}
      </div>
    </Layer>
  );
}

/** Подтверждение необратимого действия. Кнопка подтверждения называет действие: «Забанить Mirage» */
export function ConfirmDialog({
  open,
  onCancel,
  onConfirm,
  title,
  description = "Это действие нельзя отменить.",
  confirmLabel,
  danger,
  loading,
}: {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  title: ReactNode;
  description?: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  loading?: boolean;
}) {
  return (
    <Dialog
      open={open}
      onClose={onCancel}
      size="sm"
      title={title}
      description={description}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel}>
            Отмена
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm} loading={loading} data-autofocus>
            {confirmLabel}
          </Button>
        </>
      }
    />
  );
}

// ───────────────────────── меню

type MenuCtx = { close: () => void };
const MenuContext = createContext<MenuCtx>({ close: () => {} });

/**
 * Меню действий. trigger — элемент-кнопка (получит aria-атрибуты через обёртку).
 * Клавиатура: Enter/Space/↓ открывают, ↑/↓ — по пунктам, Esc закрывает и возвращает фокус.
 */
export function Menu({ trigger, children, align = "end", label = "Действия" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end"; label?: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const id = useId();
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        root.current?.querySelector<HTMLElement>("[data-menu-trigger] button, [data-menu-trigger] a")?.focus();
      }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...(list.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])];
        const i = items.indexOf(document.activeElement as HTMLElement);
        const next = e.key === "ArrowDown" ? items[(i + 1) % items.length] : items[(i - 1 + items.length) % items.length];
        next?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    list.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative inline-flex">
      <div
        data-menu-trigger
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((x) => !x)}
        onKeyDown={(e) => e.key === "ArrowDown" && (e.preventDefault(), setOpen(true))}
      >
        {trigger}
      </div>
      {open && (
        <div
          ref={list}
          id={id}
          role="menu"
          aria-label={label}
          className={cn(
            "absolute top-full z-50 mt-1.5 min-w-52 overflow-hidden rounded-popover border border-line bg-surface-4 py-1 shadow-[var(--shadow-pop)]",
            "animate-[menu-in_var(--dur-pop)_ease-out]",
            align === "end" ? "right-0" : "left-0",
          )}
        >
          <MenuContext.Provider value={{ close }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({ children, onSelect, danger, icon, disabled }: { children: ReactNode; onSelect: () => void; danger?: boolean; icon?: ReactNode; disabled?: boolean }) {
  const { close } = useContext(MenuContext);
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={() => {
        close();
        onSelect();
      }}
      className={cn(
        "flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[14px] outline-none transition-colors disabled:opacity-45",
        "hover:bg-white/[0.06] focus-visible:bg-white/[0.08]",
        danger ? "text-danger" : "text-fg",
        "[&>svg]:size-4 [&>svg]:text-current",
      )}
    >
      {icon}
      {children}
    </button>
  );
}

/** Разделитель: отделяет опасные пункты («Покинуть», «Удалить») от обычных */
export function MenuSeparator() {
  return <div role="separator" className="my-1 h-px bg-line-subtle" />;
}

// ───────────────────────── тултип

/** Пояснение при наведении и фокусе. Только дополнительное — не прятать сюда обязательные инструкции */
export function Tooltip({ text, children, side = "top" }: { text: ReactNode; children: ReactNode; side?: "top" | "bottom" }) {
  const id = useId();
  return (
    <span className="group/tip relative inline-flex" aria-describedby={id}>
      {children}
      <span
        id={id}
        role="tooltip"
        className={cn(
          "pointer-events-none absolute left-1/2 z-50 w-max max-w-64 -translate-x-1/2 rounded-chip border border-line bg-surface-4 px-2.5 py-1.5 text-meta text-fg-2 opacity-0 shadow-[var(--shadow-pop)]",
          "transition-opacity duration-[var(--dur-pop)] group-hover/tip:opacity-100 group-focus-within/tip:opacity-100",
          side === "top" ? "bottom-full mb-2" : "top-full mt-2",
        )}
      >
        {text}
      </span>
    </span>
  );
}
