"use client";

import { useActionState, useEffect } from "react";
import { serverCommand } from "@/app/actions/admin-server";
import { SubmitButton } from "@/components/forms";
import { useToast } from "@/components/toast";
import { cn } from "@/components/ui";

const LABEL = { start: "Включить", stop: "Выключить", restart: "Перезапустить", end_match: "Освободить сервер" } as const;
const HINT = {
  start: "Включить сервер, чтобы на нём можно было играть.",
  stop: "Полностью выключить сервер. Идущий матч прервётся.",
  restart: "Выключить и сразу включить заново. Помогает, если сервер завис.",
  end_match: "Убрать матч с сервера, чтобы на нём можно было играть другой.",
} as const;
const VARIANT = { start: "primary", stop: "danger", restart: "secondary", end_match: "secondary" } as const;

/** Кнопки сервера: одна форма, результат — уведомлением в углу (строка/карточка не прыгает) */
export function ServerActions({
  instance,
  running,
  align = "end",
  className,
  hints,
}: {
  instance: string;
  running: boolean;
  align?: "start" | "end";
  className?: string;
  /** подписать каждую кнопку одной строкой: что она делает */
  hints?: boolean;
}) {
  const [state, action, pending] = useActionState(serverCommand, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state, toast]);

  const types = running ? (["end_match", "restart", "stop"] as const) : (["start"] as const);
  const confirm: Record<string, string | undefined> = {
    stop: `Выключить ${instance}? Идущий матч прервётся и получит статус «ошибка сервера».`,
    restart: `Перезапустить ${instance}?`,
    end_match: `Освободить ${instance} от матча?`,
  };

  return (
    <form
      action={action}
      data-f16-action-pending={pending ? "true" : undefined}
      aria-busy={pending || undefined}
      className={cn(
        hints ? "flex flex-col gap-3" : "flex flex-wrap gap-2",
        !hints && (align === "end" ? "justify-end" : "justify-start"),
        className,
      )}
    >
      <input type="hidden" name="instance" value={instance} />
      {/* выключение подтверждает окно кнопки — для живого матча сервер требует этот флаг */}
      <input type="hidden" name="confirm" value="1" />
      {types.map((type) => (
        <div key={type} className={cn(hints && "flex flex-wrap items-center gap-x-4 gap-y-1.5")}>
          <SubmitButton
            name="type"
            value={type}
            size="sm"
            variant={VARIANT[type]}
            className={cn("sm:h-10", hints && "w-[11.5rem]")}
            confirm={confirm[type]}
          >
            {LABEL[type]}
          </SubmitButton>
          {hints && <p className="min-w-0 flex-1 basis-40 text-[13px] leading-snug text-fg-3">{HINT[type]}</p>}
        </div>
      ))}
    </form>
  );
}
