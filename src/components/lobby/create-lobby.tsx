"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import { createLobby } from "@/app/actions/lobby";
import { btnClass } from "../primitives";
import { useToast } from "../toast";
import { cn } from "../ui";
import { Icon, Sheet } from "./ui";

const TYPES: { key: "public" | "closed" | "private"; title: string; text: string; icon: ReactNode }[] = [
  { key: "public", title: "Публичное лобби", text: "Лобби видно в общем списке, и каждый игрок сможет к нему присоединиться", icon: Icon.globe("size-6") },
  { key: "closed", title: "Закрытое лобби", text: "Будет отображаться в общем списке, но для входа потребуется пароль", icon: Icon.lock("size-6") },
  { key: "private", title: "Приватное лобби", text: "Лобби скрыто от всех, в него можно войти только по ссылке и зная пароль", icon: Icon.eyeOff("size-6") },
];

/** Кнопка «Создать лобби» и окно выбора типа */
export function CreateLobbyButton({ loggedIn, className, label = "Создать лобби" }: { loggedIn: boolean; className?: string; label?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<(typeof TYPES)[number]["key"]>("public");
  const [password, setPassword] = useState("");
  const [pending, start] = useTransition();

  const submit = () =>
    start(async () => {
      const r = await createLobby(type, password);
      if (r?.error) {
        toast.error(r.error);
        if (r.code) router.push(`/lobby/${r.code}`);
        return;
      }
      if (r?.code) router.push(`/lobby/${r.code}`);
    });

  return (
    <>
      <button
        type="button"
        className={className ?? btnClass("primary", "md")}
        onClick={() => (loggedIn ? setOpen(true) : router.push(`/login?next=${encodeURIComponent("/lobbies")}`))}
      >
        {Icon.plus("size-4")}
        {label}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        width={480}
        title={<span className="block text-center">Создание лобби</span>}
        subtitle={<span className="block text-center">Играйте на серверах клуба с друзьями, выбрав настройки и модификаторы</span>}
        footer={
          <button type="button" data-autofocus disabled={pending} onClick={submit} className={btnClass("primary", "md", "w-full")}>
            {pending ? "Создаём…" : "Создать лобби"}
          </button>
        }
      >
        <div className="space-y-2">
          {TYPES.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setType(t.key)}
              className={cn(
                "flex w-full items-start gap-4 rounded-[12px] border px-4 py-4 text-left transition-colors",
                type === t.key ? "border-accent/40 bg-accent/[0.08]" : "border-transparent hover:bg-white/[0.04]",
              )}
            >
              <span className={cn("mt-0.5 shrink-0", type === t.key ? "text-accent" : "text-fg-3")}>{t.icon}</span>
              <span>
                <span className="block text-[15px] font-semibold text-fg">{t.title}</span>
                <span className="mt-1 block text-[13px] leading-relaxed text-fg-2">{t.text}</span>
              </span>
            </button>
          ))}
          {type !== "public" && (
            <label className="block pt-2">
              <span className="mb-1.5 block text-[13px] text-fg-2">Пароль лобби</span>
              <input
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                maxLength={32}
                placeholder="От 3 символов"
                className="h-11 w-full rounded-[8px] border border-white/[0.1] bg-surface-3 px-3 text-[14px] text-fg outline-none focus:border-accent/50"
              />
            </label>
          )}
        </div>
      </Sheet>
    </>
  );
}
