"use client";

import { useActionState, useCallback, useEffect, useState, useTransition } from "react";
import type { ActionResult, FormAction } from "@/components/forms";
import { Spinner, cn } from "@/components/ds";
import { useToast } from "@/components/toast";

/** Toggle for persisted settings: show the chosen value immediately and keep it until the server confirms it. */
export function ActionToggle({
  action,
  fields,
  stateField = "on",
  on,
  label,
  onLabel = "Включено",
  offLabel = "Выключено",
  disabled = false,
  onOptimisticChange,
  className,
}: {
  action: FormAction;
  fields: Record<string, string>;
  stateField?: string;
  on: boolean;
  label: string;
  onLabel?: string;
  offLabel?: string;
  disabled?: boolean;
  onOptimisticChange?: (value: boolean | null) => void;
  className?: string;
}) {
  const safeAction = useCallback(async (_previous: ActionResult, data: FormData): Promise<ActionResult> => {
    try {
      return await action(_previous, data);
    } catch {
      return { error: "Не удалось сохранить настройку. Попробуйте ещё раз." };
    }
  }, [action]);
  const [state, dispatch, pending] = useActionState(safeAction, null);
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<boolean | null>(null);
  const toast = useToast();
  const value = optimistic ?? on;

  useEffect(() => {
    if (optimistic !== null && optimistic === on) {
      setOptimistic(null);
      onOptimisticChange?.(null);
    }
  }, [on, optimistic, onOptimisticChange]);

  useEffect(() => {
    if (state?.error) {
      setOptimistic(null);
      onOptimisticChange?.(null);
      toast.error(state.error);
    } else if (state?.success) {
      toast.success(state.success);
    }
  }, [onOptimisticChange, state, toast]);

  const toggle = () => {
    const next = !value;
    const data = new FormData();
    for (const [key, fieldValue] of Object.entries(fields)) data.set(key, fieldValue);
    data.set(stateField, next ? "1" : "0");
    setOptimistic(next);
    onOptimisticChange?.(next);
    startTransition(() => dispatch(data));
  };

  return (
    <div
      data-f16-action-pending={pending ? "true" : undefined}
      aria-busy={pending || undefined}
      className={cn("inline-flex min-h-9 items-center gap-2.5", className)}
    >
      <button
        type="button"
        role="switch"
        aria-checked={value}
        aria-label={`${label}: ${value ? onLabel : offLabel}`}
        disabled={disabled || pending}
        onClick={toggle}
        className={cn(
          "group relative h-7 w-12 shrink-0 rounded-full border transition-[background-color,border-color,box-shadow] duration-[var(--dur-state)] ease-out",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg",
          value ? "border-accent/70 bg-accent shadow-[0_0_14px_-7px_var(--color-accent)]" : "border-line-strong bg-surface-3 hover:border-line-hover",
          (disabled || pending) && "cursor-not-allowed opacity-60",
        )}
      >
        <span
          className={cn(
            "absolute left-0.5 top-0.5 size-5 rounded-full bg-white shadow-sm transition-transform duration-[var(--dur-state)] ease-out",
            value ? "translate-x-5" : "translate-x-0",
          )}
        />
      </button>
      <span className={cn("text-meta font-medium", value ? "text-ok" : "text-fg-3")}>{value ? onLabel : offLabel}</span>
      <span className="grid size-4 place-items-center">
        {pending && <Spinner className="size-3.5 text-fg-3" />}
      </span>
      <span className="sr-only" aria-live="polite">{pending ? "Сохранение…" : ""}</span>
    </div>
  );
}
