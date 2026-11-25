"use client";

import { ArrowLeftRight, Check, Headphones } from "lucide-react";
import { useState } from "react";
import { confirmVoiceLink } from "@/app/actions/voice";
import { Avatar, Button, Callout } from "@/components/ds";
import { useT } from "@/lib/i18n/client";

/*
 * Подтверждение привязки TeamSpeak. Ссылку присылает бот в канале «Привязка»;
 * привязка происходит только по кнопке — чужая ссылка, открытая случайно, ничего не меняет.
 */
export function VoiceLinkCard({
  token,
  valid,
  player,
  replaces,
  already,
}: {
  token: string;
  /** false — ссылка неверная или устарела */
  valid: boolean;
  player: { nickname: string; avatar_url: string | null } | null;
  replaces: string | null;
  already: boolean;
}) {
  const t = useT();
  const [state, setState] = useState<"idle" | "busy" | "done">(already ? "done" : "idle");
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setState("busy");
    setError(null);
    const r = await confirmVoiceLink(token).catch(() => ({ ok: false as const, error: t("Нет связи с сайтом. Попробуйте ещё раз.") }));
    if (r.ok) setState("done");
    else {
      setError(r.error);
      setState("idle");
    }
  };

  return (
    <div className="w-full max-w-[460px] rounded-feature border border-line-subtle bg-surface p-6 sm:p-8">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/teamspeak.svg" alt="TeamSpeak" width={118} height={32} className="h-8 w-auto [[data-theme=dark]_&]:brightness-0 [[data-theme=dark]_&]:invert" />

      {!valid || !player ? (
        <>
          <h1 className="mt-8 text-page text-fg">{t("Ссылка устарела")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-2">{t("Ссылка привязки действует 10 минут. Зайдите в канал «Привязка» на сервере TeamSpeak ещё раз — бот пришлёт новую.")}</p>
          <Button href="/teamspeak" variant="secondary" block className="mt-8">
            {t("Как подключиться")}
          </Button>
        </>
      ) : (
        <>
          <h1 className="mt-8 text-page text-fg">{state === "done" ? t("TeamSpeak привязан") : t("Привязать TeamSpeak")}</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
            {state === "done"
              ? t("Вернитесь в TeamSpeak: бот уже перенёс вас в канал «Телепорт». Когда начнётся игра, он сам переведёт вас в комнату вашей команды.")
              : t("Бот будет знать, что это вы, и перед игрой сам переведёт вас в комнату вашей команды.")}
          </p>

          <div className="mt-6 flex items-stretch gap-2">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-control border border-line-subtle bg-shell px-3 py-4 text-center">
              <span className="grid size-14 place-items-center rounded-full bg-ink/[0.06] text-fg-2">
                <Headphones className="size-6" aria-hidden />
              </span>
              <span className="w-full truncate text-[15px] font-semibold text-fg">TeamSpeak</span>
              <span className="text-meta text-fg-3">{t("ваше подключение")}</span>
            </div>
            <span className={`grid w-8 shrink-0 place-items-center ${state === "done" ? "text-ok" : "text-fg-3"}`} aria-hidden>
              {state === "done" ? <Check className="size-6" /> : <ArrowLeftRight className="size-5" />}
            </span>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-control border border-line-subtle bg-shell px-3 py-4 text-center">
              <Avatar src={player.avatar_url} name={player.nickname} size="lg" />
              <span className="w-full truncate text-[15px] font-semibold text-fg">{player.nickname}</span>
              <span className="text-meta text-fg-3">{t("профиль на сайте")}</span>
            </div>
          </div>

          {error && (
            <Callout tone="danger" className="mt-5">
              {error}
            </Callout>
          )}
          {state !== "done" && replaces && (
            <Callout className="mt-5">{t("Профиль сейчас привязан к подключению «{nick}» — оно будет отвязано.", { nick: replaces })}</Callout>
          )}

          {state === "done" ? (
            <Button href="/lobbies" variant="secondary" block className="mt-8">
              {t("К лобби")}
            </Button>
          ) : (
            <>
              <Button block className="mt-8" loading={state === "busy"} onClick={confirm}>
                {t("Привязать к моему профилю")}
              </Button>
              <p className="mt-4 text-meta leading-relaxed text-fg-3">
                {t("Не вы заходили в канал «Привязка»? Просто закройте страницу. Привязка сохраняется, пока вы сами не снимете её командой !отвязать в TeamSpeak.")}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
