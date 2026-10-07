"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { useToast } from "../toast";
import { Avatar } from "../ui";
import { cn } from "@/components/ds";
import { Icon } from "./ui";

// ───────────────────────── чат

export function Chat({ view, code, onSent, canWrite }: { view: LobbyView; code: string; onSent: () => Promise<void>; canWrite: boolean }) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [pending, start] = useTransition();
  const box = useRef<HTMLDivElement>(null);
  const lastId = view.messages[view.messages.length - 1]?.id;
  useEffect(() => {
    const el = box.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [lastId]);
  const send = () => {
    const body = text.trim();
    if (!body) return;
    setText("");
    start(async () => {
      const r = await A.sendLobbyMessage(code, body);
      if (r?.error) {
        toast.error(r.error);
        setText(body);
      }
      await onSent();
    });
  };
  const time = useMemo(() => new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" }), []);
  return (
    <div className="flex h-[440px] flex-col overflow-hidden rounded-surface border border-line-subtle bg-surface sm:h-[560px]">
      <div ref={box} className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
        {view.messages.length === 0 && <p className="pt-10 text-center text-[13px] text-fg-3">Сообщений пока нет</p>}
        {view.messages.map((m) =>
          m.player_id ? (
            <div key={m.id} className="flex gap-2.5">
              <Avatar src={m.avatar_url} name={m.nickname ?? "?"} size={28} />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className={cn("text-[13px] font-semibold", m.player_id === view.lobby.host_id ? "text-warn" : "text-fg")}>{m.nickname}</span>
                  <span className="num text-[11px] text-fg-4">{time.format(new Date(m.created_at))}</span>
                </div>
                <p className="break-words text-[14px] text-fg-2">{m.body}</p>
              </div>
            </div>
          ) : (
            <p key={m.id} className="text-center text-[12px] text-fg-3">
              {m.body}
            </p>
          ),
        )}
      </div>
      {canWrite ? (
        <form
          className="flex gap-2 border-t border-line-subtle p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Сообщение…" className="h-10 min-w-0 flex-1 rounded-control border border-line bg-shell px-3 text-[14px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]" />
          <button type="submit" disabled={pending || !text.trim()} className="grid size-10 place-items-center rounded-control bg-accent text-accent-ink transition-colors hover:bg-accent-strong disabled:opacity-50" aria-label="Отправить">
            {Icon.send("size-4")}
          </button>
        </form>
      ) : (
        <p className="border-t border-line-subtle p-3 text-center text-[13px] text-fg-3">Войдите в лобби, чтобы писать в чат</p>
      )}
    </div>
  );
}
