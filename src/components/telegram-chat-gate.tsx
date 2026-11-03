"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!playerId || noChrome(pathname) || pathname === "/tg") return;
    let alive = true;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE(playerId)) ?? "null") as { show: boolean; at: number } | null;
      if (c && Date.now() - c.at < TTL) {
        const id = setTimeout(() => setShow(c.show), 0);
        return () => clearTimeout(id);
      }
    } catch {}
    fetch("/api/tg-chat", { cache: "no-store", credentials: "same-origin" })
      .then((r) => (r.ok ? r.json() : { show: false }))
      .then((d: { show: boolean }) => {
        if (!alive) return;
        try {
          sessionStorage.setItem(CACHE(playerId), JSON.stringify({ show: !!d.show, at: Date.now() }));
        } catch {}
        setShow(!!d.show);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [playerId, pathname]);

  if (!show || !playerId) return null;
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
