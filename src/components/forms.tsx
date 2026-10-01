"use client";

import { useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmModal } from "./modal";
import { useToast } from "./toast";
import { Spinner, buttonClass, cn } from "./ui";

export type ActionResult = { error?: string; success?: string } | null;
export type FormAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

export function SubmitButton({
  children,
  variant = "primary",
  size = "md",
  className,
  pendingText,
  confirm,
  name,
  value,
}: {
  children: ReactNode;
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "warm";
  size?: "sm" | "md" | "lg";
  className?: string;
  pendingText?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending, data } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  // в форме с несколькими кнопками крутится только та, что отправила
  const mine = pending && (!name || data?.get(name) === (value ?? ""));

  return (
    <>
      <button
        ref={button}
        type="submit"
        name={name}
        value={value}
        disabled={pending}
        aria-busy={mine || undefined}
        className={buttonClass(variant, size, className)}
        onClick={(e) => {
          if (!confirm) return;
          if (confirmed.current) {
            confirmed.current = false;
            return;
          }
          e.preventDefault();
          setAsking(true);
        }}
      >
        {mine ? (
          <>
            <Spinner className="size-4" />
            {pendingText ?? children}
          </>
        ) : (
          children
        )}
      </button>
      {confirm && (
        <ConfirmModal
          open={asking}
          message={confirm}
          danger={variant === "danger"}
          confirmLabel={typeof children === "string" ? children : "Подтвердить"}
          onCancel={() => setAsking(false)}
          onConfirm={() => {
            setAsking(false);
            confirmed.current = true;
            // повторный клик отправит форму вместе с name/value этой кнопки
            button.current?.click();
          }}
        />
      )}
    </>
  );
}

/**
 * Форма с серверным действием.
 * Результат показывается тостом в углу; ошибка дополнительно остаётся под формой, рядом с полями.
 */
export function ActionForm({
  action,
  children,
  className,
  inline,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  inline?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state, toast]);

  return (
    <form action={formAction} className={cn(inline ? "inline-flex flex-col gap-2" : "", className)}>
      {children}
      {state?.error && (
        <p role="alert" className="mt-3 flex items-start gap-2 text-[13px] leading-snug text-danger">
          <span className="mt-[5px] size-1.5 shrink-0 rounded-full bg-current" />
          {state.error}
        </p>
      )}
    </form>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const toast = useToast();
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="field num text-[13px]" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className={buttonClass("secondary", "md", "shrink-0 w-32")}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          toast.success("Скопировано в буфер обмена");
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
