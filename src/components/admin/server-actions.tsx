"use client";

import { useActionState, useEffect } from "react";
import { serverCommand } from "@/app/actions/admin-server";
import { SubmitButton } from "@/components/forms";
import { useToast } from "@/components/toast";
import { cn } from "@/components/ui";

const LABEL = { start: "Запустить", stop: "Стоп", restart: "Рестарт", end_match: "Снять матч" } as const;

/** Кнопки инстанса: одна форма, результат — уведомлением в углу (строка/карточка не прыгает) */
export function ServerActions({
  instance,
  running,
  align = "end",
  className,
}: {
  instance: string;
  running: boolean;
  align?: "start" | "end";
  className?: string;
}) {
  const [state, action, pending] = useActionState(serverCommand, null);
  const toast = useToast();

  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) toast.success(state.success);
  }, [state, toast]);

  const types = running ? (["end_match", "restart", "stop"] as const) : (["start"] as const);
  const confirm: Record<string, string | undefined> = {
    stop: `Остановить ${instance}? Идущий матч прервётся и получит статус «ошибка сервера».`,
    restart: `Перезапустить ${instance}?`,
    end_match: `Снять матч с ${instance}?`,
  };

  return (
    <form action={action} data-f16-action-pending={pending ? "true" : undefined} aria-busy={pending || undefined} className={cn("flex flex-wrap gap-1", align === "end" ? "justify-end" : "justify-start", className)}>
      <input type="hidden" name="instance" value={instance} />
      {/* остановку подтверждает модальное окно кнопки — для живого матча сервер требует этот флаг */}
      <input type="hidden" name="confirm" value="1" />
      {types.map((type) => (
        <SubmitButton
          key={type}
          name="type"
          value={type}
          size="sm"
          variant={type === "start" ? "secondary" : "ghost"}
          className={type === "stop" ? "text-danger/80 hover:text-danger" : undefined}
          confirm={confirm[type]}
        >
          {LABEL[type]}
        </SubmitButton>
      ))}
    </form>
  );
}
