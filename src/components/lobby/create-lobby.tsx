"use client";

import { useRouter } from "next/navigation";
import { EyeOff, Globe2, LockKeyhole, Plus } from "lucide-react";
import { useState, useTransition, type ReactNode } from "react";
import { createLobby } from "@/app/actions/lobby";
import { useToast } from "../toast";
import { Button, Dialog, Field, Input, cn } from "@/components/ds";

type Visibility = "public" | "closed" | "private";

const TYPES: { key: Visibility; title: string; text: string; icon: ReactNode; meta: string }[] = [
  {
    key: "public",
    title: "Публичное",
    text: "Видно в общем списке. Игроки могут зайти без пароля.",
    icon: <Globe2 />,
    meta: "Для открытого набора",
  },
  {
    key: "closed",
    title: "По паролю",
    text: "Видно в списке, но вход только по паролю.",
    icon: <LockKeyhole />,
    meta: "Для своей компании",
  },
  {
    key: "private",
    title: "Приватное",
    text: "Не показывается в общем списке. Вход по ссылке и паролю.",
    icon: <EyeOff />,
    meta: "Только по приглашению",
  },
];

/**
 * Создание комнаты — только доступ/видимость.
 * Игровые настройки остаются внутри Lobby Room: action сохраняет последние настройки хоста.
 */
export function CreateLobbyButton({
  loggedIn,
  className,
  label = "Создать лобби",
}: {
  loggedIn: boolean;
  className?: string;
  label?: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<Visibility>("public");
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
      if (r?.code) {
        setOpen(false);
        router.push(`/lobby/${r.code}`);
      }
    });

  const trigger = () => {
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent("/lobbies")}`);
      return;
    }
    setOpen(true);
  };

  return (
    <>
      <Button onClick={trigger} icon={<Plus />} className={className}>
        {label}
      </Button>

      <Dialog
        open={open}
        onClose={() => !pending && setOpen(false)}
        title="Создать лобби"
        description="Сначала выберите доступ. Режим, карты, команды и сервер настраиваются уже внутри комнаты."
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
              Отмена
            </Button>
            <Button onClick={submit} loading={pending} disabled={type !== "public" && password.trim().length < 3} data-autofocus>
              Создать лобби
            </Button>
          </>
        }
      >
        <div className="grid gap-2">
          {TYPES.map((item) => {
            const selected = type === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setType(item.key)}
                aria-pressed={selected}
                className={cn(
                  "grid w-full grid-cols-[36px_minmax(0,1fr)] gap-3 rounded-surface border p-4 text-left transition-[border-color,background-color]",
                  selected ? "border-accent/45 bg-accent-dim" : "border-line-subtle bg-surface hover:border-line-strong hover:bg-surface-2",
                )}
              >
                <span className={cn("grid size-9 place-items-center rounded-control [&>svg]:size-[18px]", selected ? "bg-accent text-accent-ink" : "bg-surface-3 text-fg-3")}>
                  {item.icon}
                </span>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                    <span className="text-[14px] font-semibold text-fg">{item.title}</span>
                    <span className="text-micro text-fg-3">{item.meta}</span>
                  </span>
                  <span className="mt-1 block text-meta leading-relaxed text-fg-2">{item.text}</span>
                </span>
              </button>
            );
          })}
        </div>

        {type !== "public" && (
          <Field
            className="mt-5"
            label="Пароль"
            required
            hint="От 3 до 32 символов. Игроки смогут войти по нему или по действующей ссылке-приглашению."
          >
            {(field) => (
              <Input
                {...field}
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={3}
                maxLength={32}
                autoComplete="off"
                placeholder="Введите пароль"
              />
            )}
          </Field>
        )}

        <div className="mt-5 rounded-control border border-line-subtle bg-shell px-4 py-3 text-meta text-fg-3">
          Если вы уже создавали лобби, новые комнаты наследуют ваши последние игровые настройки. Их можно изменить до запуска матча.
        </div>
      </Dialog>
    </>
  );
}
