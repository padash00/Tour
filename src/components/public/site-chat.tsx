"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { deleteChatMessage, sendChatMessage, setChatMuted } from "@/app/actions/chat";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/ui";
import { cn } from "@/components/ds";
import { intlLocale } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

type Msg = { id: number; player_id: string; nickname: string; avatar_url: string | null; steam_id: string; body: string; created_at: string; is_admin: boolean };
type Me = { id: string; admin: boolean; banned: boolean; muted: boolean } | null;

const POLL_MS = 3000;
const MAX_KEEP = 200;

/** Общий чат сайта: опрос /api/chat раз в 3 с (пока вкладка видна), у админа — удалить сообщение и запретить писать */
export function SiteChat() {
  const t = useT();
  const toast = useToast();
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [me, setMe] = useState<Me>(null);
  const [loaded, setLoaded] = useState(false);
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef(0);

  const load = useCallback(async (full = false) => {
    try {
      const r = await fetch(`/api/chat${!full && lastId.current ? `?after=${lastId.current}` : ""}`, { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { messages: Msg[]; me: Me };
      setMe(j.me);
      setMsgs((prev) => {
        const next = full ? j.messages : [...prev, ...j.messages.filter((m) => !prev.some((p) => p.id === m.id))];
        if (next.length) lastId.current = next[next.length - 1].id;
        return next.slice(-MAX_KEEP);
      });
      setLoaded(true);
    } catch {}
  }, []);

  useEffect(() => {
    const first = setTimeout(() => load(true), 0);
    let fullTick = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      // раз в минуту — полная загрузка: подтянуть удаления модератора
      fullTick = (fullTick + 1) % 20;
      load(fullTick === 0);
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [load]);

  const last = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [last]);

  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    stick.current = true;
    start(async () => {
      const r = await sendChatMessage(body);
      if (r?.error) {
        toast.error(r.error);
        setText(body);
      }
      await load();
    });
  };
  const remove = (id: number) =>
    start(async () => {
      const r = await deleteChatMessage(id);
      if (r?.error) toast.error(r.error);
      else setMsgs((l) => l.filter((m) => m.id !== id));
    });
  const mute = (m: Msg) => {
    if (!window.confirm(`Запретить ${m.nickname} писать в чат? Его сообщения за последний час будут удалены.`)) return;
    start(async () => {
      const r = await setChatMuted(m.player_id, true);
      if (r?.error) toast.error(r.error);
      else {
        toast.success(`${m.nickname} больше не может писать в чат`);
        await load(true);
      }
    });
  };

  const time = useMemo(() => new Intl.DateTimeFormat(intlLocale(t.lang), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }), [t.lang]);
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(t.lang), { day: "numeric", month: "long", timeZone: "Asia/Almaty" }), [t.lang]);

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col overflow-hidden rounded-surface border border-line-subtle bg-surface">
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4"
        aria-live="polite"
      >
        {!loaded && <p className="pt-10 text-center text-[13px] text-fg-3">{t("Загружаем…")}</p>}
        {loaded && msgs.length === 0 && <p className="pt-10 text-center text-[14px] text-fg-3">{t("Сообщений пока нет — напишите первым!")}</p>}
        {msgs.map((m, i) => {
          const d = day.format(new Date(m.created_at));
          const newDay = i === 0 || day.format(new Date(msgs[i - 1].created_at)) !== d;
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-[12px] font-semibold text-fg-3">{d}</p>}
              <div className="group flex gap-2.5">
                <Link href={`/players/${m.steam_id}`} className="shrink-0">
                  <Avatar src={m.avatar_url} name={m.nickname} size={32} />
                </Link>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <Link href={`/players/${m.steam_id}`} className={cn("text-[14px] font-semibold hover:underline", m.is_admin ? "text-accent" : "text-fg")}>
                      {m.nickname}
                    </Link>
                    {m.is_admin && <span className="text-[11px] font-semibold uppercase tracking-wide text-accent">{t("админ")}</span>}
                    <span className="num text-[11px] text-fg-4">{time.format(new Date(m.created_at))}</span>
                    {me?.admin && m.player_id !== me.id && (
                      <span className="ml-auto flex gap-3 text-[12px] opacity-60 group-hover:opacity-100">
                        <button type="button" onClick={() => remove(m.id)} className="text-fg-3 hover:text-danger" disabled={pending}>
                          Удалить
                        </button>
                        {!m.is_admin && (
                          <button type="button" onClick={() => mute(m)} className="text-fg-3 hover:text-danger" disabled={pending}>
                            Запретить писать
                          </button>
                        )}
                      </span>
                    )}
                    {me?.admin && m.player_id === me.id && (
                      <button type="button" onClick={() => remove(m.id)} className="ml-auto text-[12px] text-fg-3 opacity-60 hover:text-danger group-hover:opacity-100" disabled={pending}>
                        Удалить
                      </button>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap break-words text-[15px] leading-snug text-fg-2">{m.body}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {!me ? (
        <div className="border-t border-line-subtle p-4 text-center text-[14px] text-fg-2">
          {t.rich("<a>Войдите через Steam</a>, чтобы писать в чат", {
            a: (c) => (
              <Link href="/login?next=%2Fchat" className="font-semibold text-accent hover:underline">
                {c}
              </Link>
            ),
          })}
        </div>
      ) : me.banned || me.muted ? (
        <p className="border-t border-line-subtle p-4 text-center text-[14px] text-fg-3">
          {me.banned ? t("Ваш аккаунт заблокирован.") : t("Администратор запретил вам писать в чат.")}
        </p>
      ) : (
        <form
          className="flex gap-2 border-t border-line-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            maxLength={300}
            placeholder={t("Сообщение…")}
            aria-label={t("Сообщение")}
            className="h-11 min-w-0 flex-1 rounded-control border border-line bg-shell px-3.5 text-[15px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]"
          />
          <button
            type="submit"
            disabled={pending || !text.trim()}
            className="h-11 shrink-0 rounded-control bg-accent px-5 text-[15px] font-semibold text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
          >
            {t("Отправить")}
          </button>
        </form>
      )}
    </div>
  );
}
