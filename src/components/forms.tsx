"use client";

import { useActionState, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ConfirmModal } from "./modal";
import { buttonClass, cn } from "./ui";

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
  variant?: "primary" | "secondary" | "ghost" | "danger" | "warm";
  size?: "sm" | "md" | "lg";
  className?: string;
  pendingText?: string;
  confirm?: string;
  name?: string;
  value?: string;
}) {
  const { pending } = useFormStatus();
  const [asking, setAsking] = useState(false);
  const confirmed = useRef(false);
  const button = useRef<HTMLButtonElement>(null);

  return (
    <>
      <button
        ref={button}
        type="submit"
        name={name}
        value={value}
        disabled={pending}
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
        {pending ? (pendingText ?? "Секунду…") : children}
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

/** Форма с серверным действием и выводом ошибки/успеха под ней */
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
  return (
    <form action={formAction} className={cn(inline ? "inline-flex flex-col gap-2" : "", className)}>
      {children}
      {state?.error && <p className="mt-3 text-sm text-danger">{state.error}</p>}
      {state?.success && <p className="mt-3 text-sm text-ok">{state.success}</p>}
    </form>
  );
}

export function CopyField({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex gap-2">
      <input readOnly value={value} className="field num text-[13px]" onFocus={(e) => e.currentTarget.select()} />
      <button
        type="button"
        className={buttonClass("secondary", "md", "shrink-0 w-32")}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
      >
        {copied ? "Скопировано" : "Копировать"}
      </button>
    </div>
  );
}
