"use client";

import { useActionState, useEffect, useRef } from "react";
import { sendChat } from "@/app/actions/admin-server";
import { SubmitButton } from "@/components/forms";
import { useToast } from "@/components/toast";
import { cn } from "@/components/ui";

const PRESETS = [
  "Пауза — ждём игрока",
  "Технические проблемы, ждите",
  "Матч начнётся через 5 минут",
  "Все на сервер, начинаем",
  "Спасибо за игру!",
];

/**
 * Сообщение в чат игры: поле, готовые фразы, выбор сервера (или все сразу).
 * В игре видно как «[F16 ADMIN] текст».
 */
export function ChatBox({ instances, fixed, className }: { instances?: string[]; fixed?: string; className?: string }) {
  const [state, action] = useActionState(sendChat, null);
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (state?.error) toast.error(state.error);
    else if (state?.success) {
      toast.success(state.success);
      if (input.current) input.current.value = "";
    }
  }, [state, toast]);

  return (
    <form action={action} className={cn("space-y-2", className)}>
      {fixed ? <input type="hidden" name="instance" value={fixed} /> : null}
      <div className="flex flex-wrap gap-1.5">
        {PRESETS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => {
              if (input.current) {
                input.current.value = p;
                input.current.focus();
              }
            }}
            className="h-7 rounded-full border border-white/[0.10] px-2.5 text-[12px] text-fg-2 transition-colors hover:border-white/[0.22] hover:text-fg"
          >
            {p}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {!fixed && (
          <select name="instance" defaultValue="all" aria-label="Сервер" className="field !h-9 !w-auto text-[13px]">
            <option value="all">Все серверы</option>
            {(instances ?? []).map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        )}
        <input ref={input} name="text" maxLength={180} placeholder="Сообщение игрокам в чат…" aria-label="Сообщение" className="field !h-9 min-w-[200px] flex-1 text-[13px]" />
        <SubmitButton size="sm">Отправить</SubmitButton>
      </div>
    </form>
  );
}
