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
    <form action={action} className={cn("space-y-3", className)}>
      {fixed ? <input type="hidden" name="instance" value={fixed} /> : null}
      <div>
        <div className="mb-2 text-[13.5px] font-semibold text-fg-3">Готовые фразы — нажмите, и текст подставится в поле</div>
        <div className="flex flex-wrap gap-2">
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
              className="h-9 rounded-full border border-line-strong bg-surface px-3.5 text-[13.5px] font-medium text-fg-2 transition-colors hover:border-line-hover hover:bg-surface-2 hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              {p}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!fixed && (
          <select name="instance" defaultValue="all" aria-label="На какой сервер отправить" className="field !h-11 !w-auto text-[15px]">
            <option value="all">Все серверы</option>
            {(instances ?? []).map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        )}
        <input ref={input} name="text" maxLength={180} placeholder="Сообщение игрокам в чат…" aria-label="Сообщение" className="field !h-11 min-w-[200px] flex-1 text-[15px]" />
        <SubmitButton size="md">Отправить игрокам</SubmitButton>
      </div>
      <p className="text-[13px] text-fg-3">В игре сообщение появится в чате с пометкой «[F16 ADMIN]».</p>
    </form>
  );
}
