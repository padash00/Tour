"use client";

import Link from "next/link";
import { Headphones } from "lucide-react";
import { useState, type ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewMember } from "@/lib/lobby-view";
import { BOT_DIFFICULTY } from "@/lib/lobby-settings";
import { Avatar, FaceitLevel } from "../ui";
import { Menu, MenuItem as DsMenuItem, MenuSeparator, cn } from "@/components/ds";
import { Icon } from "./ui";
import type { Run } from "./use-lobby-view";
import { PaidChip, TierBadge } from "./pot";
import { useT } from "@/lib/i18n/client";
import { mapLabel } from "@/lib/maps";
import { ROLES } from "@/lib/twenty-core";

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
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(name);
  const rated = members.filter((m) => m.faceit_elo);
  const avg = rated.length ? Math.round(rated.reduce((s, m) => s + (m.faceit_elo ?? 0), 0) / rated.length) : null;
  // средний рейтинг команды в «Миксе» — по тем, кто там играл: видно, равны ли составы
  const mixed = members.filter((m) => m.mix);
  const mixAvg = mixed.length ? (mixed.reduce((sum, m) => sum + (m.mix?.rating ?? 0), 0) / mixed.length).toFixed(2) : null;
  const empty = Math.max(0, size - members.length - bots.length);
  const canAddBot = isHost && view.lobby.status === "waiting" && !view.lobby.draft && !view.lobby.settings.pot;
  const captain = view.captains[team === "team1" ? 0 : 1];

  return (
    <div className="rounded-surface border border-line-subtle bg-surface">
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
                <button type="button" onClick={() => (setDraftName(name), setEditing(true))} className="text-fg-3 hover:text-fg" aria-label={t("Переименовать")}>
                  {Icon.edit("size-4")}
                </button>
              )}
            </div>
          )}
          <div className="num text-[12px] text-fg-3">
            {t("AVG ELO: {n}", { n: avg ?? "—" })}
            {mixAvg && <span title={t("Средний рейтинг состава в Миксе — по {n} игрокам, которые там играли", { n: mixed.length })}> · {t("Микс {n}", { n: mixAvg })}</span>}
          </div>
        </div>
        <span className="num rounded-[6px] bg-ink/[0.05] px-2 py-1 text-[13px] text-fg-2">
          {members.length + bots.length}/{size}
        </span>
      </div>
      {/* карточка не обрезает содержимое: меню игрока выходит за её край; низ последней строки скругляем сами */}
      <div className="divide-y divide-line-subtle [&>*:last-child]:rounded-b-surface">
        {members.map((m) => (
          <div key={m.id}>
            <PlayerLine m={m} view={view} isHost={isHost} run={run} code={code} big captain={m.id === captain} />
            <MixStats mix={m.mix} />
          </div>
        ))}
        {bots.map((b) => (
          <div key={b} className="flex h-[64px] items-center gap-3 px-4">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-3 text-fg-3">{Icon.bot("size-5")}</span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px] font-medium text-fg">Bot {b}</div>
              <div className="text-[12px] text-fg-3">{t(BOT_DIFFICULTY[view.lobby.settings.bot_difficulty])}</div>
            </div>
            {canAddBot && (
              <button type="button" disabled={busy} onClick={() => run(() => A.removeBot(code, team, b))} className="grid size-8 place-items-center rounded-[7px] text-fg-3 hover:bg-ink/[0.06] hover:text-danger" aria-label={t("Убрать бота")}>
                {Icon.x("size-4")}
              </button>
            )}
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={i} className="flex h-[64px] items-stretch">
            <button type="button" onClick={onEmpty} className="grid flex-1 place-items-center text-fg-4 transition-colors hover:bg-ink/[0.03] hover:text-fg-2" aria-label={t("Занять место")}>
              {Icon.plus("size-5")}
            </button>
            {canAddBot && (
              <button type="button" disabled={busy} onClick={() => run(() => A.addBot(code, team))} title={t("Добавить бота")} className="grid w-16 place-items-center border-l border-ink/[0.04] text-fg-4 transition-colors hover:bg-ink/[0.03] hover:text-accent">
                {Icon.bot("size-5")}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Цифры игрока из «Микса» под его строкой в составе — как в комнате матча: капитан сразу видит, кто как играет.
 * Те, кто в «Миксе» ещё не играл, отмечены отдельно, чтобы пустая строка не выглядела как нулевая статистика.
 */
function MixStats({ mix }: { mix: ViewMember["mix"] }) {
  const t = useT();
  if (!mix) return <div className="px-4 pb-2.5 text-[12px] text-fg-4">{t("В Миксе ещё не играл")}</div>;
  const cells: [string, string, string?][] = [
    [String(mix.maps), t("Карт")],
    [mix.matches ? `${Math.round((100 * mix.wins) / mix.matches)}%` : "—", t("Побед")],
    [mix.rating.toFixed(2), t("Рейтинг"), mix.rating >= 1.15 ? "text-ok" : mix.rating >= 1 ? "text-fg" : "text-fg-3"],
    [mix.kd.toFixed(2), "K/D"],
    [String(mix.adr), "ADR"],
    [`${mix.hsPct}%`, "HS%"],
  ];
  return (
    <div className="grid grid-cols-[repeat(6,auto)_minmax(0,1fr)] items-end gap-x-3.5 overflow-hidden px-4 pb-2.5 sm:gap-x-4" title={t("Статистика игрока в Миксе")}>
      {cells.map(([value, label, tone]) => (
        <span key={label}>
          <span className={cn("num block text-[14px] font-bold leading-tight", tone ?? "text-fg")}>{value}</span>
          <span className="block whitespace-nowrap text-[10.5px] leading-tight text-fg-3">{label}</span>
        </span>
      ))}
      <span className="min-w-0 text-right">
        <span className="block truncate text-[13px] font-bold leading-tight text-gold">{mix.best ? mapLabel(mix.best.map) : "—"}</span>
        <span className="block truncate text-[10.5px] leading-tight text-fg-3">{mix.role ? t(ROLES[mix.role].label) : t("Карта")}</span>
      </span>
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
  slim,
  children,
}: {
  m: ViewMember;
  view: LobbyView;
  isHost: boolean;
  run: Run;
  code: string;
  big?: boolean;
  captain?: boolean;
  /** узкая ячейка (свободные игроки в две колонки): без значка уровня FACEIT — ELO и так написан */
  slim?: boolean;
  children?: ReactNode;
}) {
  const t = useT();
  const host = view.lobby.host_id === m.id;
  const self = view.me?.id === m.id;
  const inTeam = m.slot.startsWith("team");
  const moves: { slot: Slot; label: string }[] = (
    [
      ...view.teams.map((team) => ({ slot: team.slot, label: t("В {name}", { name: team.name }) })),
      { slot: "wait", label: t("В ожидание") },
      { slot: "spec", label: t("В наблюдатели") },
    ] as { slot: Slot; label: string }[]
  ).filter((x) => x.slot !== m.slot && (x.slot !== "spec" || view.lobby.settings.max_spectators > 0));
  // готовность видна, пока идёт проверка или в режиме «когда все готовы»
  const showReady = big && inTeam && view.lobby.status === "waiting" && (!!view.lobby.ready_check_until || view.lobby.settings.start === "all_ready");

  return (
    <div
      className={cn(
        "relative flex items-center gap-3 transition-[background-color,box-shadow] duration-300",
        big ? "h-[64px] px-4" : "rounded-control bg-ink/[0.03] px-3 py-2",
        self && big && !(showReady && m.ready) && "bg-accent/[0.05]",
        showReady && m.ready && "bg-gradient-to-r from-ok/[0.28] via-ok/[0.16] to-ok/[0.08] shadow-[inset_3px_0_0_0_var(--color-ok)]",
      )}
    >
      <div className="relative shrink-0">
        <Avatar src={m.avatar_url} name={m.nickname} size={big ? 40 : 32} />
        <span className={cn("absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface", m.online ? "bg-ok" : "bg-fg-4")} title={m.online ? t("в лобби") : t("не на странице")} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          {host && <span className="text-warn" title={t("Хост")}>{Icon.crown("size-3.5")}</span>}
          {captain && !host && <span className="text-accent" title={t("Капитан")}>★</span>}
          <Link href={`/players/${m.steam_id}`} className="truncate text-[14px] font-medium text-fg hover:text-accent">
            {m.nickname}
          </Link>
          {m.voice && (
            <span className="shrink-0 text-ok" title={t("В TeamSpeak — бот переведёт в комнату команды")}>
              <Headphones className="size-3.5" aria-label={t("в голосе")} />
            </span>
          )}
        </div>
        {/* в узкой карточке отметка о взносе уходит во вторую строку и переносится — иначе она наезжает на ник и ELO */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-fg-3">
          {m.tier && <TierBadge tier={m.tier} />}
          {m.faceit_elo ? <span className="num whitespace-nowrap">{m.faceit_elo} ELO</span> : <span className="whitespace-nowrap">{t("без FACEIT")}</span>}
          {m.mix && !big && (
            <span
              className="num whitespace-nowrap rounded-chip bg-gold/[0.14] px-1.5 text-[11px] font-semibold leading-[18px] text-gold"
              title={[t("Рейтинг в Миксе: {n}", { n: m.mix.rating.toFixed(2) }), m.mix.role ? t(ROLES[m.mix.role].label) : null, m.mix.best ? t("коронная карта — {map} ({n})", { map: mapLabel(m.mix.best.map), n: m.mix.best.rating.toFixed(2) }) : null].filter(Boolean).join(" · ")}
            >
              {m.mix.rating.toFixed(2)}
              {m.mix.best && !slim ? ` · ${mapLabel(m.mix.best.map)}` : ""}
            </span>
          )}
          {!big && <PaidChip m={m} view={view} isHost={isHost} run={run} code={code} />}
        </div>
      </div>
      {big && <PaidChip m={m} view={view} isHost={isHost} run={run} code={code} />}
      {m.faceit_level && !m.tier && !slim ? <FaceitLevel level={m.faceit_level} /> : null}
      {showReady &&
        (m.ready ? (
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-ok text-[#06130c] shadow-[0_0_16px_-2px_var(--color-ok)] animate-[pop_.25s_cubic-bezier(.2,.8,.2,1)]" title={t("Готов")}>
            {Icon.check("size-5")}
          </span>
        ) : (
          <span className="size-7 shrink-0 animate-spin rounded-full border-[3px] border-warn/25 border-t-warn" title={t("Ждём подтверждения")} />
        ))}
      {children}
      {isHost && !self && (
        <Menu
          label={t("Действия с игроком {name}", { name: m.nickname })}
          trigger={
            <button type="button" className="grid size-9 place-items-center rounded-control text-fg-3 hover:bg-ink/[0.06] hover:text-fg" aria-label={t("Действия с игроком {name}", { name: m.nickname })}>
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
          <DsMenuItem onSelect={() => run(() => A.transferHost(code, m.id), t("{name} теперь хост", { name: m.nickname }))}>
            {t("Сделать хостом")}
          </DsMenuItem>
          <MenuSeparator />
          <DsMenuItem danger onSelect={() => run(() => A.kickPlayer(code, m.id, false))}>
            {t("Выгнать")}
          </DsMenuItem>
          <DsMenuItem danger onSelect={() => run(() => A.kickPlayer(code, m.id, true))}>
            {t("Забанить в лобби")}
          </DsMenuItem>
        </Menu>
      )}
    </div>
  );
}

export function EmptySlot({ onClick }: { onClick: () => void }) {
  const t = useT();
  return (
  <button type="button" onClick={onClick} className="grid h-[52px] place-items-center rounded-control border border-dashed border-line text-fg-4 transition-colors hover:border-line-strong hover:bg-ink/[0.03] hover:text-fg-2" aria-label={t("Занять место")}>
    {Icon.plus("size-5")}
  </button>
  );
}

export function Panel({ title, count, right, children }: { title: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-surface border border-line-subtle bg-surface p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-3">
        <h2 className="text-title text-fg">{title}</h2>
        {count != null && <span className="num rounded-chip bg-ink/[0.06] px-2 py-0.5 text-micro text-fg-2">{count}</span>}
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </section>
  );
}
