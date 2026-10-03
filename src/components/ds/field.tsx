"use client";

import { Check, ChevronDown, CircleAlert, Search, X } from "lucide-react";
import { useId, type ComponentProps, type ReactNode } from "react";
import { Spinner } from "./button";
import { cn } from "./cn";

/*
 * Поля F16 DS. Высота 44 (палец на телефоне), рамка line, фокус — акцентная рамка + мягкое кольцо.
 * Состояния: default · hover · focus · filled · disabled · error · success.
 * Ошибка поля показывается ПОД полем (Field error), а не тостом.
 */

const CONTROL =
  "w-full rounded-control border bg-shell text-[14px] text-fg outline-none placeholder:text-fg-3 " +
  "transition-[border-color,box-shadow,background-color] duration-[var(--dur-hover)] ease-out " +
  "hover:border-line-strong focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function stateBorder(state?: "error" | "success") {
  return state === "error" ? "border-danger/60 hover:border-danger/80" : state === "success" ? "border-ok/50" : "border-line";
}

type FieldIds = { id: string; "aria-invalid"?: true; "aria-describedby"?: string };

/**
 * Поле с подписью, подсказкой и сообщением. children — элемент или функция, получающая id и aria-атрибуты:
 *   <Field label="Тег" error={err}>{(p) => <Input {...p} name="tag" />}</Field>
 */
export function Field({
  label,
  hint,
  error,
  success,
  checking,
  required,
  children,
  className,
}: {
  label?: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  success?: ReactNode;
  /** идёт проверка (например, свободен ли тег) */
  checking?: ReactNode;
  required?: boolean;
  children: ReactNode | ((p: FieldIds) => ReactNode);
  className?: string;
}) {
  const id = useId();
  const msgId = `${id}-msg`;
  const message = error ?? checking ?? success ?? hint;
  const ids: FieldIds = { id, ...(error ? { "aria-invalid": true } : {}), ...(message ? { "aria-describedby": msgId } : {}) };
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <label htmlFor={id} className="text-meta font-medium text-fg-2">
          {label}
          {required && <span className="ml-0.5 text-danger">*</span>}
        </label>
      )}
      {typeof children === "function" ? children(ids) : children}
      {message && (
        <p
          id={msgId}
          role={error ? "alert" : undefined}
          className={cn("flex items-center gap-1.5 text-meta", error ? "text-danger" : checking ? "text-fg-3" : success ? "text-ok" : "text-fg-3")}
        >
          {error ? <CircleAlert className="size-3.5" /> : checking ? <Spinner className="size-3.5" /> : success ? <Check className="size-3.5" /> : null}
          {message}
        </p>
      )}
    </div>
  );
}

export function Input({ state, className, ...props }: ComponentProps<"input"> & { state?: "error" | "success" }) {
  return <input {...props} aria-invalid={state === "error" || props["aria-invalid"] || undefined} className={cn(CONTROL, "h-11 px-3.5", stateBorder(state), className)} />;
}

export function Textarea({ state, className, ...props }: ComponentProps<"textarea"> & { state?: "error" | "success" }) {
  return <textarea {...props} className={cn(CONTROL, "min-h-24 px-3.5 py-2.5 leading-relaxed", stateBorder(state), className)} />;
}

export function Select({ state, className, children, ...props }: ComponentProps<"select"> & { state?: "error" | "success" }) {
  return (
    <div className="relative">
      <select {...props} className={cn(CONTROL, "h-11 appearance-none pl-3.5 pr-10", stateBorder(state), className)}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
    </div>
  );
}

/** Поиск: иконка, очистка, индикатор загрузки */
export function SearchInput({
  value,
  onChange,
  loading,
  placeholder = "Поиск",
  className,
  ...props
}: Omit<ComponentProps<"input">, "onChange" | "value"> & { value: string; onChange: (v: string) => void; loading?: boolean }) {
  return (
    <div className={cn("relative", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" />
      <input
        {...props}
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(CONTROL, "h-11 border-line pl-9 pr-10 [&::-webkit-search-cancel-button]:hidden")}
      />
      <span className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center text-fg-3">
        {loading ? (
          <Spinner className="size-4" />
        ) : value ? (
          <button type="button" aria-label="Очистить" onClick={() => onChange("")} className="grid size-7 place-items-center rounded-tiny hover:bg-white/[0.06] hover:text-fg">
            <X className="size-4" />
          </button>
        ) : null}
      </span>
    </div>
  );
}

/** Флажок с подписью */
export function Checkbox({ label, description, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("group flex cursor-pointer items-start gap-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50", className)}>
      <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
        <input {...props} type="checkbox" className="peer size-5 appearance-none rounded-tiny border border-line-strong bg-shell transition-colors checked:border-accent checked:bg-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-dim)]" />
        <Check className="pointer-events-none absolute size-3.5 text-accent-ink opacity-0 peer-checked:opacity-100" />
      </span>
      <span>
        <span className="block text-[14px] text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-meta text-fg-3">{description}</span>}
      </span>
    </label>
  );
}

/** Переключатель-радио с подписью */
export function Radio({ label, description, className, ...props }: Omit<ComponentProps<"input">, "type"> & { label: ReactNode; description?: ReactNode }) {
  return (
    <label className={cn("flex cursor-pointer items-start gap-3 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50", className)}>
      <input
        {...props}
        type="radio"
        className="mt-0.5 size-5 shrink-0 appearance-none rounded-full border border-line-strong bg-shell transition-[border-width,border-color] checked:border-[6px] checked:border-accent focus-visible:shadow-[0_0_0_3px_var(--color-accent-dim)]"
      />
      <span>
        <span className="block text-[14px] text-fg">{label}</span>
        {description && <span className="mt-0.5 block text-meta text-fg-3">{description}</span>}
      </span>
    </label>
  );
}

/** Выключатель (вкл/выкл). Без onChange — только показ */
export function Toggle({ on, onChange, disabled, label }: { on: boolean; onChange?: (v: boolean) => void; disabled?: boolean; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled || !onChange}
      onClick={() => onChange?.(!on)}
      className={cn(
        "relative h-6 w-11 shrink-0 rounded-full transition-colors duration-[var(--dur-hover)] disabled:cursor-default",
        on ? "bg-accent" : "bg-white/[0.14]",
        disabled && "opacity-50",
      )}
    >
      <span className={cn("absolute top-1 size-4 rounded-full bg-white shadow-sm transition-[left] duration-[var(--dur-hover)] ease-out", on ? "left-6" : "left-1")} />
    </button>
  );
}

/** Сегменты: BO 1 · 3 · 5, режим, раунды */
export function Segmented<T extends string | number>({
  value,
  options,
  onChange,
  disabled,
  label,
  className,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange?: (v: T) => void;
  disabled?: boolean;
  label: string;
  className?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className={cn("inline-flex rounded-control border border-line-subtle bg-shell p-0.5", className)}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled || !onChange}
            onClick={() => onChange?.(o.value)}
            className={cn(
              "min-w-9 rounded-[6px] px-3 py-1.5 text-meta font-medium transition-colors duration-[var(--dur-hover)] disabled:cursor-default",
              active ? "bg-elevated text-fg shadow-[inset_0_0_0_1px_var(--color-line)]" : "text-fg-3 hover:text-fg",
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** Ползунок с числом. Значение применяется по отпусканию / вводу (не на каждый пиксель) */
export function Slider({
  value,
  min,
  max,
  step = 1,
  onChange,
  disabled,
  prefix,
  label,
}: {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange?: (v: number) => void;
  disabled?: boolean;
  prefix?: string;
  label: string;
}) {
  const ro = disabled || !onChange;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        defaultValue={value}
        key={`r${value}`}
        disabled={ro}
        onPointerUp={(e) => onChange?.(Number((e.target as HTMLInputElement).value))}
        onKeyUp={(e) => onChange?.(Number((e.target as HTMLInputElement).value))}
        className="hidden w-32 accent-[var(--color-accent)] disabled:opacity-50 sm:block"
      />
      <div className="flex h-9 w-24 items-center rounded-control border border-line bg-shell px-2 focus-within:border-accent">
        {prefix && <span className="text-meta text-fg-3">{prefix}</span>}
        <input
          type="number"
          aria-label={label}
          min={min}
          max={max}
          defaultValue={value}
          key={`n${value}`}
          disabled={ro}
          onBlur={(e) => Number(e.target.value) !== value && onChange?.(Number(e.target.value))}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="num w-full bg-transparent text-right text-meta text-fg outline-none disabled:opacity-60"
        />
      </div>
    </div>
  );
}
