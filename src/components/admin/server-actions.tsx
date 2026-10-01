"use client";

import { useActionState, useEffect, useState } from "react";
import { serverCommand } from "@/app/actions/admin-server";
import { SubmitButton } from "@/components/forms";
import { cn } from "@/components/ui";

const LABEL = { start: "Запустить", stop: "Стоп", restart: "Рестарт", end_match: "Снять матч" } as const;

/** Кнопки инстанса в таблице серверов: одна форма, результат — короткой строкой, гаснет сам */
export function ServerActions({ instance, running }: { instance: string; running: boolean }) {
  const [state, action] = useActionState(serverCommand, null);
  const [shown, setShown] = useState<typeof state>(null);

  useEffect(() => {
    if (!state) return;
    const show = setTimeout(() => setShown(state), 0);
    const hide = setTimeout(() => setShown(null), 5000);
    return () => {
      clearTimeout(show);
      clearTimeout(hide);
    };
  }, [state]);

  const types = running ? (["end_match", "restart", "stop"] as const) : (["start"] as const);
  const confirm: Record<string, string | undefined> = {
    stop: `Остановить ${instance}? Матч на нём прервётся.`,
    restart: `Перезапустить ${instance}?`,
    end_match: `Снять матч с ${instance}?`,
  };

  return (
    <form action={action} className="relative flex justify-end gap-1">
      <input type="hidden" name="instance" value={instance} />
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
      {shown && (
        <span
          className={cn(
            "absolute right-0 top-full mt-0.5 max-w-[260px] truncate text-[11px] leading-4",
            shown.error ? "text-danger" : "text-ok",
          )}
          title={shown.error ?? shown.success}
        >
          {shown.error ?? "Команда отправлена агенту"}
        </span>
      )}
    </form>
  );
}
