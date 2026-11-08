"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronLeft, Flag, ImagePlus, Send, ShieldBan, X } from "lucide-react";
import { reportDm, sendDirectImage, sendDirectMessage, setDmBlock } from "@/app/actions/dm";
import { useToast } from "@/components/toast";
import { Avatar } from "@/components/ui";
import { cn } from "@/components/ds";
import { refreshViewer } from "@/components/viewer";
import { isOnline, seenLabel } from "@/lib/online";
import { intlLocale } from "@/lib/i18n/core";
import { useT } from "@/lib/i18n/client";

type Peer = { id: string; nickname: string; avatar_url: string | null; steam_id: string; last_seen_at: string | null };
type Msg = { id: number; sender_id: string; recipient_id: string; body: string; created_at: string; read_at: string | null; image: boolean };

const IMG_TYPES = ["image/png", "image/jpeg", "image/webp"];
const IMG_SIDE = 2000;
/**
 * Картинка перед отправкой: большие (фото с телефона, скрин 4K) уменьшаются до 2000 px по длинной стороне
 * и сжимаются в JPEG — так файл почти всегда меньше 1 МБ. Небольшие скрины уходят как есть (текст остаётся чётким).
 */
async function shrinkImage(file: File): Promise<Blob> {
  if (file.size < 900_000) return file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, IMG_SIDE / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    bmp.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.85));
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}
type Conv = { peer: Peer; last: Msg; unread: number };

const POLL_MS = 3000;
function PeerAvatar({ peer, now, size = 40 }: { peer: Peer; now: number; size?: number }) {
  const t = useT();
  return (
    <span className="relative shrink-0">
      <Avatar src={peer.avatar_url} name={peer.nickname} size={size} />
      {isOnline(peer.last_seen_at, now) && <span className="absolute bottom-0 right-0 size-3 rounded-full border-2 border-surface bg-ok" aria-label={t("в сети")} />}
    </span>
  );
}

/** Личные сообщения: список диалогов слева, переписка справа (на телефоне — по очереди). Опрос раз в 3 с, пока вкладка видна. */
export function MessagesApp({ withId }: { withId: string | null }) {
  const t = useT();
  const toast = useToast();
  const router = useRouter();
  const [convs, setConvs] = useState<Conv[] | null>(null);
  const [me, setMe] = useState<string | null>(null);
  const [support, setSupport] = useState<string | null>(null);
  const [peer, setPeer] = useState<Peer | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [blocks, setBlocks] = useState({ iBlocked: false, blockedMe: false });
  const [text, setText] = useState("");
  const [img, setImg] = useState<{ blob: Blob; url: string } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const lastId = useRef(0);

  const loadConvs = useCallback(async () => {
    try {
      const r = await fetch("/api/dm", { cache: "no-store" });
      if (!r.ok) return;
      const j = (await r.json()) as { me: string; support: string | null; conversations: Conv[] };
      setMe(j.me);
      setSupport(j.support);
      setConvs(j.conversations);
    } catch {}
  }, []);

  const loadThread = useCallback(
    async (full = false) => {
      if (!withId) return;
      try {
        const r = await fetch(`/api/dm?with=${withId}${!full && lastId.current ? `&after=${lastId.current}` : ""}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = (await r.json()) as { me: string; peer: Peer; messages: Msg[]; iBlocked: boolean; blockedMe: boolean };
        setMe(j.me);
        setPeer(j.peer);
        setBlocks({ iBlocked: j.iBlocked, blockedMe: j.blockedMe });
        setMsgs((prev) => {
          const next = full ? j.messages : [...prev, ...j.messages.filter((m) => !prev.some((p) => p.id === m.id))];
          if (next.length) lastId.current = next[next.length - 1].id;
          return next;
        });
        if (j.messages.some((m) => m.recipient_id === j.me && !m.read_at)) refreshViewer();
      } catch {}
    },
    [withId],
  );

  useEffect(() => {
    lastId.current = 0;
    const first = setTimeout(() => {
      setMsgs([]);
      setPeer(null);
      loadConvs();
      loadThread(true);
    }, 0);
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      setNow(Date.now());
      loadConvs();
      loadThread();
    }, POLL_MS);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, [loadConvs, loadThread]);

  const last = msgs[msgs.length - 1]?.id;
  useEffect(() => {
    const el = box.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [last]);

  const pickImage = async (file: File | null | undefined) => {
    if (!file) return;
    if (!IMG_TYPES.includes(file.type)) {
      toast.error(t("Картинка — PNG, JPG или WEBP"));
      return;
    }
    const blob = await shrinkImage(file);
    if (blob.size > 3 * 1024 * 1024) {
      toast.error(t("Картинка — не больше 3 МБ"));
      return;
    }
    setImg((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return { blob, url: URL.createObjectURL(blob) };
    });
  };
  const dropImage = () =>
    setImg((old) => {
      if (old) URL.revokeObjectURL(old.url);
      return null;
    });

  const send = () => {
    const body = text.trim();
    if ((!body && !img) || !withId) return;
    const pic = img;
    setText("");
    setImg(null);
    stick.current = true;
    start(async () => {
      let r;
      if (pic) {
        const form = new FormData();
        form.set("to", withId);
        form.set("body", body);
        form.set("file", pic.blob, "image");
        r = await sendDirectImage(form);
      } else r = await sendDirectMessage(withId, body);
      if (r?.error) {
        toast.error(r.error);
        setText(body);
        if (pic) setImg(pic);
      } else if (pic) URL.revokeObjectURL(pic.url);
      await loadThread();
      await loadConvs();
    });
  };
  const toggleBlock = () =>
    start(async () => {
      if (!withId || !peer) return;
      const block = !blocks.iBlocked;
      if (block && !window.confirm(t("Заблокировать {name}? Он не сможет вам писать, а вы — ему.", { name: peer.nickname }))) return;
      const r = await setDmBlock(withId, block);
      if (r?.error) toast.error(r.error);
      else toast.success(block ? t("Игрок заблокирован") : t("Блокировка снята"));
      await loadThread(true);
    });
  const report = (m: Msg) => {
    const reason = window.prompt(t("Почему жалуетесь? (необязательно)")) ?? null;
    if (reason === null) return;
    start(async () => {
      const r = await reportDm(m.id, reason);
      if (r?.error) toast.error(r.error);
      else toast.success(t("Жалоба отправлена администратору"));
    });
  };

  const time = useMemo(() => new Intl.DateTimeFormat(intlLocale(t.lang), { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }), [t.lang]);
  const day = useMemo(() => new Intl.DateTimeFormat(intlLocale(t.lang), { day: "numeric", month: "long", timeZone: "Asia/Almaty" }), [t.lang]);
  const lastSeenOther = [...msgs].reverse().find((m) => m.sender_id === me && m.read_at);

  const list = (
    <div className={cn("min-h-0 overflow-y-auto border-line-subtle md:border-r", withId && "hidden md:block")}>
      {convs === null && <p className="p-6 text-center text-[13px] text-fg-3">{t("Загружаем…")}</p>}
      {convs?.length === 0 && (
        <p className="p-6 text-center text-[14px] leading-relaxed text-fg-3">
          {t.rich("Диалогов пока нет. Откройте профиль игрока и нажмите «Написать» — например, в <a>списке игроков</a>.", {
            a: (c) => (
              <Link href="/players" className="font-semibold text-accent hover:underline">
                {c}
              </Link>
            ),
          })}
        </p>
      )}
      {convs?.map((c) => (
        <button
          key={c.peer.id}
          type="button"
          onClick={() => router.replace(`/messages?with=${c.peer.id}`, { scroll: false })}
          className={cn("flex w-full items-center gap-3 border-b border-line-subtle px-4 py-3 text-left transition-colors hover:bg-surface-2", c.peer.id === withId && "bg-accent-dim/50")}
        >
          <PeerAvatar peer={c.peer} now={now} />
          <span className="min-w-0 flex-1">
            <span className="flex items-baseline justify-between gap-2">
              <span className="truncate text-[15px] font-semibold text-fg">
                {c.peer.nickname}
                {c.peer.id === support && <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent-ink">{t("поддержка")}</span>}
              </span>
              <span className="num shrink-0 text-[11px] text-fg-4">{time.format(new Date(c.last.created_at))}</span>
            </span>
            <span className="flex items-center gap-2">
              <span className={cn("truncate text-[13px]", c.unread ? "font-semibold text-fg" : "text-fg-3")}>
                {c.last.sender_id === me ? `${t("Вы")}: ` : ""}
                {c.last.image ? `📷 ${c.last.body || t("Фото")}` : c.last.body}
              </span>
              {c.unread > 0 && <span className="ml-auto grid h-5 min-w-5 shrink-0 place-items-center rounded-full bg-accent px-1.5 text-[11px] font-bold text-accent-ink">{c.unread}</span>}
            </span>
          </span>
        </button>
      ))}
    </div>
  );

  const thread = withId ? (
    <div className="flex min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-3">
        <button type="button" onClick={() => router.replace("/messages", { scroll: false })} className="-ml-1 text-fg-3 hover:text-fg md:hidden" aria-label={t("К диалогам")}>
          <ChevronLeft className="size-5" />
        </button>
        {peer ? (
          <>
            <Link href={`/players/${peer.steam_id}`} className="flex min-w-0 items-center gap-3">
              <PeerAvatar peer={peer} now={now} size={36} />
              <span className="min-w-0">
                <span className="block truncate text-[15px] font-semibold text-fg hover:underline">
                  {peer.nickname}
                  {peer.id === support && <span className="ml-1.5 rounded bg-accent px-1.5 py-0.5 text-[10px] font-bold uppercase text-accent-ink">{t("поддержка F16")}</span>}
                </span>
                <span className={cn("block text-[12px]", isOnline(peer.last_seen_at, now) ? "text-ok" : "text-fg-3")}>{seenLabel(t, peer.last_seen_at, now)}</span>
              </span>
            </Link>
            <button type="button" onClick={toggleBlock} disabled={pending} className="ml-auto inline-flex items-center gap-1.5 text-[12px] text-fg-3 hover:text-danger" title={blocks.iBlocked ? t("Разблокировать") : t("Заблокировать")}>
              <ShieldBan className="size-4" />
              <span className="hidden sm:inline">{blocks.iBlocked ? t("Разблокировать") : t("Заблокировать")}</span>
            </button>
          </>
        ) : (
          <span className="text-[13px] text-fg-3">{t("Загружаем…")}</span>
        )}
      </div>
      <div
        ref={box}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="min-h-0 flex-1 space-y-2 overflow-y-auto p-4"
        aria-live="polite"
      >
        {peer && msgs.length === 0 && (
          <p className="pt-10 text-center text-[14px] text-fg-3">
            {peer.id === support ? t("Опишите вопрос — администратор ответит здесь, обычно в течение нескольких минут.") : t("Напишите первое сообщение")}
          </p>
        )}
        {msgs.map((m, i) => {
          const mine = m.sender_id === me;
          const d = day.format(new Date(m.created_at));
          const newDay = i === 0 || day.format(new Date(msgs[i - 1].created_at)) !== d;
          return (
            <div key={m.id}>
              {newDay && <p className="my-2 text-center text-[12px] font-semibold text-fg-3">{d}</p>}
              <div className={cn("group flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                {!mine && (
                  <button type="button" onClick={() => report(m)} className="order-2 text-fg-4 opacity-0 hover:text-danger group-hover:opacity-100" title={t("Пожаловаться")}>
                    <Flag className="size-3.5" />
                  </button>
                )}
                <div className={cn("max-w-[78%] rounded-[16px] px-3.5 py-2", mine ? "rounded-br-[4px] bg-accent text-accent-ink" : "rounded-bl-[4px] bg-surface-2 text-fg")}>
                  {m.image && (
                    <a href={`/api/dm/image/${m.id}`} target="_blank" rel="noreferrer" className="-mx-1.5 -mt-0.5 mb-1 block">
                      {/* eslint-disable-next-line @next/next/no-img-element -- закрытая картинка с проверкой доступа, не через оптимизатор */}
                      <img
                        src={`/api/dm/image/${m.id}`}
                        alt={t("Картинка")}
                        loading="lazy"
                        onLoad={() => {
                          const el = box.current;
                          if (el && stick.current) el.scrollTop = el.scrollHeight;
                        }}
                        className="max-h-72 max-w-full rounded-[12px] object-contain"
                      />
                    </a>
                  )}
                  {m.body && <p className="whitespace-pre-wrap break-words text-[15px] leading-snug">{m.body}</p>}
                  <p className={cn("num mt-0.5 text-right text-[10.5px]", mine ? "text-accent-ink/70" : "text-fg-4")}>
                    {time.format(new Date(m.created_at))}
                    {mine && lastSeenOther?.id === m.id ? ` · ${t("прочитано")}` : ""}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
      {blocks.iBlocked || blocks.blockedMe ? (
        <p className="border-t border-line-subtle p-4 text-center text-[14px] text-fg-3">
          {blocks.iBlocked ? t("Вы заблокировали этого игрока.") : t("Игрок ограничил сообщения от вас.")}
        </p>
      ) : (
        <form
          className="border-t border-line-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          {img && (
            <div className="relative mb-2 inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element -- превью локального файла */}
              <img src={img.url} alt={t("Картинка к отправке")} className="max-h-36 max-w-full rounded-[12px] border border-line-subtle object-contain" />
              <button type="button" onClick={dropImage} aria-label={t("Убрать картинку")} className="absolute -right-2 -top-2 grid size-7 place-items-center rounded-full bg-fg text-surface shadow">
                <X className="size-4" />
              </button>
            </div>
          )}
          <div className="flex items-end gap-2">
            <input
              ref={fileRef}
              type="file"
              accept={IMG_TYPES.join(",")}
              className="hidden"
              onChange={(e) => {
                void pickImage(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={pending}
              aria-label={t("Прикрепить картинку")}
              title={t("Прикрепить картинку (или вставьте скриншот: Ctrl+V)")}
              className="grid size-11 shrink-0 place-items-center rounded-control border border-line text-fg-3 transition-colors hover:border-accent hover:text-fg disabled:opacity-50"
            >
              <ImagePlus className="size-5" />
            </button>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const file = Array.from(e.clipboardData.files).find((f) => IMG_TYPES.includes(f.type));
                if (!file) return;
                e.preventDefault();
                void pickImage(file);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              maxLength={1000}
              placeholder={t("Сообщение…")}
              aria-label={t("Сообщение")}
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-control border border-line bg-shell px-3.5 py-2.5 text-[15px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]"
            />
            <button
              type="submit"
              disabled={pending || (!text.trim() && !img)}
              aria-label={t("Отправить")}
              className="grid size-11 shrink-0 place-items-center rounded-control bg-accent text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50"
            >
              <Send className="size-4" />
            </button>
          </div>
        </form>
      )}
    </div>
  ) : (
    <div className="hidden items-center justify-center p-6 text-center text-[14px] text-fg-3 md:flex">{t("Выберите диалог слева")}</div>
  );

  return (
    <div className="grid h-[72vh] min-h-[460px] overflow-hidden rounded-surface border border-line-subtle bg-surface md:grid-cols-[320px_minmax(0,1fr)]">
      {list}
      {thread}
    </div>
  );
}
