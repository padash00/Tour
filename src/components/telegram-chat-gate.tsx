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
 * Закрывается только кнопкой «Вступить» (открывает группу в новой вкладке). Отметка — в браузере игрока;
 * проверить участие в группе сайт не может (бот в группе не состоит), поэтому полагаемся на нажатие.
 */
const KEY = (id: string) => `f16:tg-chat-joined:${id}`;

export function TelegramChatGate() {
  const t = useT();
  const { player } = useViewer();
  const pathname = usePathname();
  const [show, setShow] = useState(false);
  const playerId = player?.id ?? null;

  useEffect(() => {
    if (!playerId || noChrome(pathname) || pathname === "/tg") return;
    let joined = false;
    try {
      joined = localStorage.getItem(KEY(playerId)) === "1";
    } catch {
      joined = true; // хранилище недоступно (приватный режим и т. п.) — не мучаем окном на каждой странице
    }
    // показываем после отрисовки страницы, чтобы не мешать первому экрану
    const id = setTimeout(() => setShow(!joined), 0);
    return () => clearTimeout(id);
  }, [playerId, pathname]);

  if (!show || !playerId) return null;
  const join = () => {
    try {
      localStorage.setItem(KEY(playerId), "1");
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
