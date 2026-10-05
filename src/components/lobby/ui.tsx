"use client";

import { createContext, useContext, useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../ui";

/** Большое окно лобби (создание, расширенные настройки, карты): заголовок, прокрутка, подвал */
export function Sheet({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  width = 640,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
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
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-[#03060bd9] backdrop-blur-[6px] animate-[fade_.15s_ease-out]" onClick={onClose} />
      <div
        ref={panel}
        className="relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-[16px] border border-white/[0.1] bg-surface-2 shadow-[var(--shadow-pop)] animate-[pop_.2s_cubic-bezier(.2,.8,.2,1)] sm:rounded-[16px]"
        style={{ maxWidth: width }}
      >
        <div className="flex items-start gap-4 px-6 pt-6 pb-4 sm:px-8">
          <div className="min-w-0 flex-1">
            <h2 className="text-[22px] font-semibold tracking-[-0.015em] text-fg">{title}</h2>
            {subtitle && <p className="mt-1.5 text-[14px] text-fg-2">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded-[8px] text-fg-3 hover:bg-white/[0.06] hover:text-fg" aria-label="Закрыть">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M6 6l12 12M18 6 6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6 sm:px-8">{children}</div>
        {footer && <div className="border-t border-white/[0.06] bg-black/[0.15] px-6 py-4 sm:px-8">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

type RowA11y = { labelId: string; hintId?: string };
const RowA11yContext = createContext<RowA11y | null>(null);

/** Строка настройки: видимая подпись программно связана с control справа. */
export function Row({ icon, label, badge, children, hint }: { icon?: ReactNode; label: ReactNode; badge?: ReactNode; children: ReactNode; hint?: ReactNode }) {
  const id = useId();
  const labelId = `${id}-label`;
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <RowA11yContext.Provider value={{ labelId, hintId }}>
      <div className="flex min-h-[56px] items-center gap-3 rounded-surface border border-line-subtle bg-surface px-4 py-2 transition-colors duration-[var(--dur-hover)] hover:border-line hover:bg-surface-2">
        {icon && <span className="grid size-6 shrink-0 place-items-center text-fg-3" aria-hidden>{icon}</span>}
        <div className="min-w-0 flex-1">
          <div id={labelId} className="flex items-center gap-2 text-[14px] text-fg">
            {label}
            {badge}
          </div>
          {hint && <div id={hintId} className="text-[12px] text-fg-3">{hint}</div>}
        </div>
        <div className="flex shrink-0 items-center gap-2">{children}</div>
      </div>
    </RowA11yContext.Provider>
  );
}

export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label?: string }) {
  const a11y = useContext(RowA11yContext);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      aria-labelledby={label ? undefined : a11y?.labelId}
      aria-describedby={a11y?.hintId}
      disabled={disabled || !onChange}
      onClick={() => onChange?.(!on)}
      className={cn(
        "group relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-[var(--dur-state)] ease-out disabled:cursor-default",
        on ? "border-accent/70 bg-accent shadow-[0_0_14px_-7px_var(--color-accent)]" : "border-line-strong bg-surface-3 hover:border-line-hover",
        disabled && "opacity-55",
      )}
    >
      <span className={cn("absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-state)] ease-out", on ? "translate-x-5" : "translate-x-0")} />
    </button>
  );
}

/** Сегменты: 1 · 3 · 5 */
export function Segments<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange?: (v: T) => void;
  disabled?: boolean;
}) {
  const a11y = useContext(RowA11yContext);
  return (
    <div role="radiogroup" aria-labelledby={a11y?.labelId} aria-describedby={a11y?.hintId} className="flex rounded-[8px] bg-black/30 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          disabled={disabled || !onChange}
          onClick={() => onChange?.(o.value)}
          className={cn(
            "num min-w-9 rounded-[6px] px-2.5 py-1 text-[13px] transition-colors disabled:cursor-default",
            o.value === value ? "bg-accent/20 text-fg" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Choice<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange?: (v: T) => void;
  disabled?: boolean;
}) {
  const a11y = useContext(RowA11yContext);
  return (
    <select
      aria-labelledby={a11y?.labelId}
      aria-describedby={a11y?.hintId}
      value={String(value)}
      disabled={disabled || !onChange}
      onChange={(e) => {
        const o = options.find((x) => String(x.value) === e.target.value);
        if (o) onChange?.(o.value);
      }}
      className="h-9 max-w-[200px] rounded-[8px] border border-white/[0.1] bg-surface-3 px-3 text-[13px] text-fg disabled:opacity-70"
    >
      {options.map((o) => (
        <option key={String(o.value)} value={String(o.value)}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Ползунок с полем числа; сохраняет по отпусканию / вводу */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  prefix,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  prefix?: string;
}) {
  const ro = disabled || !onChange;
  const a11y = useContext(RowA11yContext);
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-labelledby={a11y?.labelId}
        aria-describedby={a11y?.hintId}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        key={value}
        disabled={ro}
        onPointerUp={(e) => onChange?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onChange?.(Number((e.target as HTMLInputElement).value))}
        className="hidden w-32 accent-[var(--color-accent)] sm:block"
      />
      <div className="flex h-9 w-[92px] items-center rounded-[8px] border border-white/[0.1] bg-surface-3 px-2">
        {prefix && <span className="text-[13px] text-fg-3">{prefix}</span>}
        <input
          type="number"
          aria-labelledby={a11y?.labelId}
          aria-describedby={a11y?.hintId}
          min={min}
          max={max}
          defaultValue={value}
          key={value}
          disabled={ro}
          onBlur={(e) => Number(e.target.value) !== value && onChange?.(Number(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="num w-full bg-transparent text-right text-[13px] text-fg outline-none disabled:opacity-70"
        />
      </div>
    </div>
  );
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[12px] border border-white/[0.06] bg-black/[0.12] p-3 sm:p-4">
      <h3 className="mb-3 px-1 text-[13px] font-medium text-fg-2">{title}</h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

export const NewBadge = () => <span className="rounded-[4px] bg-ok/20 px-1.5 py-px text-[10px] font-bold uppercase tracking-wide text-ok">new</span>;

export { Icon } from "./icons";
