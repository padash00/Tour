"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewMember } from "@/lib/lobby-view";
import { BOT_DIFFICULTY } from "@/lib/lobby-settings";
import { Avatar, FaceitLevel } from "../ui";
import { Menu, MenuItem as DsMenuItem, MenuSeparator, cn } from "@/components/ds";
import { Icon } from "./ui";
import type { Run } from "./use-lobby-view";

type Slot = ViewMember["slot"];

// ───────────────────────── команда

export function TeamCard({
  team,
  name,
  members,
  bots,
  size,
  view,
  isHost,
  busy,
  run,
  code,
  onEmpty,
}: {
  team: "team1" | "team2";
  name: string;
  members: ViewMember[];
  bots: string[];
  size: number;
  view: LobbyView;
  isHost: boolean;
  busy: boolean;
  run: Run;
  code: string;
  onEmpty: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const rated = members.filter((m) => m.faceit_elo);
  const avg = rated.length ? Math.round(rated.reduce((s, m) => s + (m.faceit_elo ?? 0), 0) / rated.length) : null;
  const empty = Math.max(0, size - members.length - bots.length);
  const canAddBot = isHost && view.lobby.status === "waiting" && !view.lobby.draft;
  const captain = view.captains[team === "team1" ? 0 : 1];

  return (
    <div className="overflow-hidden rounded-surface border border-line-subtle bg-surface">
      <div className="flex items-center gap-3 border-b border-line-subtle px-4 py-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-control", team === "team1" ? "bg-warn/15 text-warn" : "bg-steel/15 text-steel")}>{Icon.crown("size-5")}</span>
        <div className="min-w-0 flex-1">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setEditing(false);
                run(() => A.setTeamName(code, team, draftName));
              }}
            >
              <input autoFocus value={draftName} onChange={(e) => setDraftName(e.target.value)} onBlur={() => setEditing(false)} maxLength={24} className="h-8 w-full rounded-[6px] border border-accent/40 bg-surface-3 px-2 text-[15px] font-semibold text-fg outline-none" />
            </form>
          ) : (
            <div className="flex items-center gap-2">
              <span className="truncate text-[16px] font-semibold text-fg">{name}</span>
              {isHost && (
                <button type="button" onClick={() => (setDraftName(name), setEditing(true))} className="text-fg-3 hover:text-fg" aria-label="Переименовать">
                  {Icon.edit("size-4")}
                </button>
              )}
            </div>
          )}
          <div className="num text-[12px] text-fg-3">AVG ELO: {avg ?? "—"}</div>
        </div>
        <span className="num rounded-[6px] bg-white/[0.05] px-2 py-1 text-[13px] text-fg-2">
          {members.length + bots.length}/{size}
        </span>
      </div>
      <div className="divide-y divide-line-subtle">
        {members.map((m) => (
          <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code} big captain={m.id === captain} />
        ))}
        {bots.map((b) => (
          <div key={b} className="flex h-[64px] items-center gap-3 px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-fg-3">{Icon.bot("size-5")}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-fg">Bot {b}</div>
              <div className="text-[12px] text-fg-3">{BOT_DIFFICULTY[view.lobby.settings.bot_difficulty]}</div>
            </div>
            {canAddBot && (
              <button type="button" disabled={busy} onClick={() => run(() => A.removeBot(code, team, b))} className="grid size-8 place-items-center rounded-[7px] text-fg-3 hover:bg-white/[0.06] hover:text-danger" aria-label="Убрать бота">
                {Icon.x("size-4")}
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={i} className="flex h-[64px] items-stretch">
            <button type="button" onClick={onEmpty} className="grid flex-1 place-items-center text-fg-4 transition-colors hover:bg-white/[0.03] hover:text-fg-2" aria-label="Занять место">
              {Icon.plus("size-5")}
            </button>
            {canAddBot && (
              <button type="button" disabled={busy} onClick={() => run(() => A.addBot(code, team))} title="Добавить бота" className="grid w-16 place-items-center border-l border-white/[0.04] text-fg-4 transition-colors hover:bg-white/[0.03] hover:text-accent">
                {Icon.bot("size-5")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PlayerLine({
  m,
  view,
  isHost,
  run,
  code,
  big,
  captain,
  children,
}: {
  m: ViewMember;
  view: LobbyView;
  isHost: boolean;
  run: Run;
  code: string;
  big?: boolean;
  captain?: boolean;
  children?: ReactNode;
}) {
  const host = view.lobby.host_id === m.id;
  const self = view.me?.id === m.id;
  const inTeam = m.slot === "team1" || m.slot === "team2";
  const moves: { slot: Slot; label: string }[] = (
    [
      { slot: "team1", label: `В ${view.lobby.team1_name}` },
      { slot: "team2", label: `В ${view.lobby.team2_name}` },
      { slot: "wait", label: "В ожидание" },
      { slot: "spec", label: "В наблюдатели" },
    ] as { slot: Slot; label: string }[]
  ).filter((x) => x.slot !== m.slot);
  // готовность видна, пока идёт проверка или в режиме «когда все готовы»
  const showReady = big && inTeam && view.lobby.status === "waiting" && (!!view.lobby.ready_check_until || view.lobby.settings.start === "all_ready");

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 transition-[background-color,box-shadow] duration-300",
        big ? "h-[64px] px-4" : "rounded-control bg-white/[0.03] px-3 py-2",
        self && big && !(showReady && m.ready) && "bg-accent/[0.05]",
        showReady && m.ready && "bg-gradient-to-r from-ok/[0.28] via-ok/[0.16] to-ok/[0.08] shadow-[inset_3px_0_0_0_var(--color-ok)]",
      )}
    >
      <div className="relative shrink-0">
        <Avatar src={m.avatar_url} name={m.nickname} size={big ? 40 : 32} />
        <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface", m.online ? "bg-ok" : "bg-fg-4")} title={m.online ? "в лобби" : "не на странице"} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {host && <span className="text-warn" title="Хост">{Icon.crown("size-3.5")}</span>}
          {captain && !host && <span className="text-accent" title="Капитан">★</span>}
          <Link href={`/players/${m.steam_id}`} className="truncate text-[14px] font-medium text-fg hover:text-accent">
            {m.nickname}
          </Link>
        </div>
        <div className="flex items-center gap-2 text-[12px] text-fg-3">
          {m.faceit_elo ? <span className="num">{m.faceit_elo} ELO</span> : <span>без FACEIT</span>}
        </div>
      </div>
      {m.faceit_level ? <FaceitLevel level={m.faceit_level} /> : null}
      {showReady &&
        (m.ready ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ok text-[#06130c] shadow-[0_0_16px_-2px_var(--color-ok)] animate-[pop_.25s_cubic-bezier(.2,.8,.2,1)]" title="Готов">
            {Icon.check("size-5")}
          </span>
        ) : (
          <span className="size-7 shrink-0 animate-spin rounded-full border-[3px] border-warn/25 border-t-warn" title="Ждём подтверждения" />
        ))}
      {children}
      {isHost && !self && (
        <Menu
          label={`Действия с игроком ${m.nickname}`}
          trigger={
            <button type="button" className="grid size-9 place-items-center rounded-control text-fg-3 hover:bg-white/[0.06] hover:text-fg" aria-label={`Действия с игроком ${m.nickname}`}>
              {Icon.more("size-5")}
            </button>
          }
        >
          {!view.lobby.draft &&
            moves.map((move) => (
              <DsMenuItem key={move.slot} onSelect={() => run(() => A.movePlayer(code, m.id, move.slot))}>
                {move.label}
              </DsMenuItem>
            ))}
          <DsMenuItem onSelect={() => run(() => A.transferHost(code, m.id), `${m.nickname} теперь хост`)}>
            Сделать хостом
          </DsMenuItem>
          <MenuSeparator />
          <DsMenuItem danger onSelect={() => run(() => A.kickPlayer(code, m.id, false))}>
            Выгнать
          </DsMenuItem>
          <DsMenuItem danger onSelect={() => run(() => A.kickPlayer(code, m.id, true))}>
            Забанить в лобби
          </DsMenuItem>
        </Menu>
      )}
    </div>
  );
}

export const EmptySlot = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="grid h-[52px] place-items-center rounded-control border border-dashed border-line text-fg-4 transition-colors hover:border-line-strong hover:bg-white/[0.03] hover:text-fg-2" aria-label="Занять место">
    {Icon.plus("size-5")}
  </button>
);

export function Panel({ title, count, right, children }: { title: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-surface border border-line-subtle bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-title text-fg">{title}</h2>
        {count != null && <span className="num rounded-chip bg-white/[0.06] px-2 py-0.5 text-micro text-fg-2">{count}</span>}
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </section>
  );
}
