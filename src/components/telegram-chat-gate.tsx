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
import QRCode from "qrcode";

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
  // ссылка на бота и её QR — если на этом компьютере нет Telegram, игрок сканирует QR телефоном
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const toast = useToast();
  const playerId = player?.id ?? null;
  // страницы, где окна не показываем: служебные экраны, правила, вход, профиль (там своя кнопка подтверждения Telegram)
  const skip = noChrome(pathname) || ["/tg", "/privacy", "/rules", "/login", "/me/profile"].some((p) => pathname === p || pathname.startsWith(p + "/"));
  const [tick, setTick] = useState(0);

  // пока висит «Подтвердите Telegram» — перепроверяем, когда игрок вернулся во вкладку из Telegram
  useEffect(() => {
    if (!link) return;
    const again = () => {
      if (document.visibilityState === "visible") setTick((n) => n + 1);
    };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    return () => {
      document.removeEventListener("visibilitychange", again);
      window.removeEventListener("focus", again);
    };
  }, [link]);

  useEffect(() => {
    if (!playerId || skip) return;
    let alive = true;
    try {
      const c = JSON.parse(sessionStorage.getItem(CACHE(playerId)) ?? "null") as { show: boolean; link?: string | null; at: number } | null;
      // «нужно подтвердить Telegram» не кэшируем — всегда спрашиваем сервер, иначе окно висит после подтверждения
      if (c && !c.link && Date.now() - c.at < TTL) {
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
  }, [playerId, pathname, skip, tick]);

  if (!playerId || skip) return null;
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
                  setBotUrl(r.url);
                  QRCode.toDataURL(r.url, { margin: 1, width: 220 }).then(setQr, () => setQr(null));
                  if (!window.open(r.url, "_blank")) window.location.href = r.url;
                  setOpened(true);
                })
              }
            >
              <Send className="size-4" aria-hidden />
              {t("Подтвердить через бота")}
            </button>
            <button type="button" className={buttonClass("secondary", "lg", "w-full sm:w-auto")} onClick={recheck}>
              {t("Я нажал «Старт» — проверить")}
            </button>
          </div>
        }
      >
        <p className="text-[15px] text-fg-2">
          {opened ? t("В Telegram откроется бот @f16_tournament_bot — нажмите «Старт», затем вернитесь сюда и нажмите «Проверить».") : t("Нажмите кнопку — откроется бот @f16_tournament_bot, там нажмите «Старт». Это занимает 10 секунд.")}
        </p>
        {opened && botUrl && (
          <div className="mt-4 flex flex-col items-center gap-3 rounded-lg border border-line p-4 sm:flex-row sm:items-start">
            {/* eslint-disable-next-line @next/next/no-img-element -- QR из data: URL, оптимизировать нечего */}
            {qr && <img src={qr} alt="" width={160} height={160} className="shrink-0 rounded bg-white p-1" />}
            <div className="text-[14.5px] text-fg-2">
              <p className="font-semibold text-fg">{t("Telegram не открылся на этом компьютере?")}</p>
              <p className="mt-1">{t("Наведите камеру телефона на QR-код — откроется бот, нажмите «Старт». Потом здесь нажмите «Проверить».")}</p>
            </div>
          </div>
        )}
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
