"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { startTelegramLink } from "@/app/actions/player-profile";
import { useToast } from "@/components/toast";
import { Send } from "lucide-react";
import { Dialog, buttonClass } from "@/components/ds";
import { useViewer } from "@/components/viewer";
import { noChrome } from "@/components/shell/nav";
import { useT } from "@/lib/i18n/client";
import { TG_GROUP_URL } from "@/lib/tg-group";

/*
 * Обязательное окно для вошедших игроков: «Вступите в Telegram-чат игроков».
 * Показывать ли — решает сервер (/api/tg-chat): нажатие записывается на сайте, а у кого Telegram подтверждён,
 * бот проверяет участие в группе. Ответ кэшируется в браузере на 10 минут, чтобы не спрашивать на каждой странице.
 */
const CACHE = (id: string) => `f16:tg-chat-ask:${id}`;
const TTL = 10 * 60_000;

export function TelegramChatGate() {
  const t = useT();
  const { player } = useViewer();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);
  const [pending, start] = useTransition();
  const toast = useToast();
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!playerId || noChrome(pathname) || pathname === "/tg") return;
    let alive = true;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE(playerId)) ?? "null") as { show: boolean; link?: string | null; at: number } | null;
      if (c && Date.now() - c.at < (c.link ? 60_000 : TTL)) {
        const id = setTimeout(() => {
          setShow(c.show);
          setLink(c.link ?? null);
        }, 0);
        return () => clearTimeout(id);
      }
    } catch {}
    fetch("/api/tg-chat", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { show: false }))
      .then((d: { show: boolean; link?: string | null }) => {
        if (!alive) return;
        try {
          sessionStorage.setItem(CACHE(playerId), JSON.stringify({ show: !!d.show, link: d.link ?? null, at: Date.now() }));
        } catch {}
        setShow(!!d.show);
        setLink(d.link ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [playerId, pathname]);

  if (!playerId) return null;
  if (link) {
    const recheck = () => {
      try {
        sessionStorage.removeItem(CACHE(playerId));
      } catch {}
      window.location.reload();
    };
    return (
      <Dialog
        open
        onClose={() => {}}
        dismissible={false}
        title={t("Подтвердите Telegram — обязательно для участников")}
        description={t("Ваша команда участвует в «{name}». В день турнира бот пишет, за какими ПК садиться, и вызывает на матч — только тем, у кого подтверждён Telegram.", { name: link })}
        footer={
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            <button
              type="button"
              disabled={pending}
              className={buttonClass("primary", "lg", "w-full sm:w-auto")}
              onClick={() =>
                start(async () => {
                  const r = await startTelegramLink();
                  if (r.error || !r.url) return void toast.error(r.error ?? t("Не удалось открыть бота"));
                  // после await браузер может заблокировать новое окно — тогда открываем бота в этой вкладке
                  if (!window.open(r.url, "_blank")) window.location.href = r.url;
                  setOpened(true);
                })
              }
            >
              <Send className="size-4" aria-hidden />
              {t("Подтвердить через бота")}
            </button>
            {opened && (
              <button type="button" className={buttonClass("secondary", "lg", "w-full sm:w-auto")} onClick={recheck}>
                {t("Я нажал «Старт» — проверить")}
              </button>
            )}
          </div>
        }
      >
        <p className="text-[15px] text-fg-2">
          {opened ? t("В Telegram откроется бот @f16_tournament_bot — нажмите «Старт», затем вернитесь сюда и нажмите «Проверить».") : t("Нажмите кнопку — откроется бот @f16_tournament_bot, там нажмите «Старт». Это занимает 10 секунд.")}
        </p>
      </Dialog>
    );
  }
  if (!show) return null;
  const join = () => {
    fetch("/api/tg-chat", { method: "POST", credentials: "same-origin", keepalive: true }).catch(() => {});
    try {
      sessionStorage.setItem(CACHE(playerId), JSON.stringify({ show: false, at: Date.now() }));
    } catch {}
    setShow(false);
  };
  return (
    <Dialog
      open
      onClose={() => {}}
      dismissible={false}
      title={t("Вступите в Telegram-чат игроков")}
      description={t("Объявления турниров, расписание матчей, поиск тиммейтов и лобби — всё публикуем в общем чате F16 Arena Community. Вступление обязательно для всех игроков.")}
      footer={
        <a href={TG_GROUP_URL} target="_blank" rel="noreferrer" onClick={join} className={buttonClass("primary", "lg", "w-full sm:w-auto")}>
          <Send className="size-4" aria-hidden />
          {t("Вступить в чат")}
        </a>
      }
    >
      <p className="text-[15px] text-fg-2">{t("Нажмите кнопку — откроется Telegram, там нажмите «Присоединиться».")}</p>
    </Dialog>
  );
}
