"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewMember } from "@/lib/lobby-view";
import type { LobbySettings } from "@/lib/lobby-settings";
import { BOT_DIFFICULTY } from "@/lib/lobby-settings";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { btnClass } from "../primitives";
import { useToast } from "../toast";
import { Avatar, cn, FaceitLevel } from "../ui";
import { AdvancedSettings, MapThumb, QuickSettings, type MapOption, type Template } from "./settings";
import { Icon, Sheet } from "./ui";

type Slot = ViewMember["slot"];

// ───────────────────────── данные

function useLobbyView(code: string, initial: LobbyView) {
  const [view, setView] = useState(initial);
  const [offset, setOffset] = useState(() => new Date(initial.now).getTime() - Date.now());
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/lobbies/${code}`, { cache: "no-store" });
      if (!r.ok) return;
      const v = (await r.json()) as LobbyView;
      setView(v);
      setOffset(new Date(v.now).getTime() - Date.now());
    } catch {
      // сеть моргнула — следующий опрос
    }
  }, [code]);
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    let stop = false;
    const loop = async () => {
      await load();
      if (!stop) t = setTimeout(loop, document.visibilityState === "visible" ? 1500 : 6000);
    };
    t = setTimeout(loop, 1500);
    const onVisible = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stop = true;
      clearTimeout(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [load]);
  return { view, setView, load, offset };
}

function useNow(offset: number) {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now() + offset), 250);
    return () => clearInterval(id);
  }, [offset]);
  return now;
}
const secondsLeft = (iso: string | null | undefined, now: number) => (iso ? Math.max(0, Math.ceil((new Date(iso).getTime() - now) / 1000)) : 0);

/** Короткий сигнал (браузер пускает звук после любого клика на сайте) */
function chime() {
  try {
    const ctx = new AudioContext();
    [660, 990].forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      const t = ctx.currentTime + i * 0.16;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.2, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.35);
    });
    setTimeout(() => ctx.close(), 900);
  } catch {}
}

// ───────────────────────── страница

export function LobbyRoom({
  code,
  initial,
  maps,
  templates: initialTemplates,
  invite,
  origin,
}: {
  code: string;
  initial: LobbyView;
  maps: MapOption[];
  templates: Template[];
  invite: string | null;
  /** адрес сайта для ссылки-приглашения (с сервера — разметка совпадает) */
  origin: string;
}) {
  const router = useRouter();
  const toast = useToast();
  const { view, setView, load, offset } = useLobbyView(code, initial);
  const now = useNow(offset);
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<"chat" | "settings">("chat");
  const [advanced, setAdvanced] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);

  const run = useCallback(
    (fn: () => Promise<A.LobbyResult>, ok?: string) =>
      start(async () => {
        const r = await fn();
        if (r?.error) toast.error(r.error);
        else if (ok) toast.success(ok);
        await load();
      }),
    [load, toast],
  );

  const { lobby, me, members, game } = view;
  const s = lobby.settings;
  const isHost = !!me?.isHost || !!me?.isAdmin;
  const isMember = !!me?.slot;
  const editable = isHost && lobby.status === "waiting";

  const patch = useCallback(
    (p: Partial<LobbySettings>) => {
      setView((v) => ({ ...v, lobby: { ...v.lobby, settings: { ...v.lobby.settings, ...p } } }));
      run(() => A.updateSettings(code, p));
    },
    [code, run, setView],
  );

  // звук: началась проверка готовности / сервер готов
  const prevCheck = useRef(lobby.ready_check_until);
  const prevServer = useRef(game?.server_state);
  useEffect(() => {
    if (lobby.ready_check_until && !prevCheck.current && (me?.slot === "team1" || me?.slot === "team2")) chime();
    if (game?.server_state === "ready" && prevServer.current !== "ready" && me?.inGame) chime();
    prevCheck.current = lobby.ready_check_until;
    prevServer.current = game?.server_state;
  }, [lobby.ready_check_until, game?.server_state, me?.slot, me?.inGame]);

  if (view.access === "closed_lobby") {
    return (
      <Gate title="Лобби закрыто" text="Это лобби уже закрыто. Создайте новое или найдите открытое в списке.">
        <Link href="/lobbies" className={btnClass("primary", "md")}>
          К списку лобби
        </Link>
      </Gate>
    );
  }
  if (view.access === "password") return <JoinGate code={code} view={view} invite={invite} onJoined={load} />;

  const byId = new Map(members.map((m) => [m.id, m]));
  const team1 = members.filter((m) => m.slot === "team1");
  const team2 = members.filter((m) => m.slot === "team2");
  const waiting = members.filter((m) => m.slot === "wait");
  const specs = members.filter((m) => m.slot === "spec");
  const playersNow = team1.length + team2.length + lobby.bots.team1.length + lobby.bots.team2.length;
  const draft = lobby.draft;
  const myTurnInDraft = !!draft && me?.id === draft.captains[draft.turn - 1];
  const inviteUrl = origin && lobby.invite_token ? `${origin}/lobby/${lobby.code}?t=${lobby.invite_token}` : null;
  const headMap = game?.maps.find((m) => m.status !== "finished")?.map ?? game?.maps[0]?.map ?? s.maps[0] ?? "de_mirage";

  const join = (slot?: Slot) => run(() => A.joinLobby(code, { slot, invite: invite ?? undefined }));
  const clickEmpty = (slot: Slot) => {
    if (!me) return router.push(`/login?next=${encodeURIComponent(`/lobby/${code}`)}`);
    if (!isMember) return join(slot);
    run(() => A.moveSelf(code, slot));
  };

  return (
    <div className="mx-auto w-full max-w-[1500px] px-3 pt-4 pb-16 sm:px-6 lg:pt-6">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        {/* ───────── левая часть */}
        <div className="min-w-0 space-y-4">
          {/* шапка */}
          <MapThumb map={headMap} image={view.mapImages[headMap]} className="rounded-[14px] border border-white/[0.06]">
            <div className="relative flex min-h-[132px] flex-col justify-between p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Link href="/lobbies" className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-black/50 px-3 text-[14px] text-fg backdrop-blur hover:bg-black/70">
                    {Icon.back("size-4")} <span className="hidden sm:inline">К списку лобби</span>
                  </Link>
                  {inviteUrl && (
                    <button
                      type="button"
                      title="Скопировать ссылку-приглашение"
                      onClick={() => navigator.clipboard.writeText(inviteUrl).then(() => toast.success(lobby.visibility === "public" ? "Ссылка скопирована" : "Ссылка скопирована — по ней пускает без пароля"))}
                      className="grid size-10 place-items-center rounded-[9px] bg-black/50 text-fg backdrop-blur hover:bg-black/70"
                    >
                      {Icon.link("size-4")}
                    </button>
                  )}
                </div>
                <span className="num rounded-[8px] bg-black/50 px-3 py-1.5 text-[13px] text-fg backdrop-blur">
                  Игроков {playersNow}/{s.team_size * 2}
                </span>
                {isMember ? (
                  <button
                    type="button"
                    onClick={() => run(async () => {
                      const r = await A.leaveLobby(code);
                      if (!r?.error) router.push("/lobbies");
                      return r;
                    })}
                    className="inline-flex h-10 items-center gap-2 rounded-[9px] bg-danger/20 px-3 text-[14px] font-medium text-danger backdrop-blur hover:bg-danger/30"
                  >
                    <span className="hidden sm:inline">Покинуть лобби</span> {Icon.exit("size-4")}
                  </button>
                ) : (
                  lobby.status !== "closed" && (
                    <button type="button" onClick={() => (me ? join() : clickEmpty("wait"))} className={btnClass("primary", "sm")}>
                      Войти в лобби
                    </button>
                  )
                )}
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="num rounded-[6px] bg-black/50 px-2 py-1 font-semibold tracking-wider text-fg">#{lobby.code}</span>
                  <span className="rounded-[6px] bg-black/50 px-2 py-1">{lobby.visibility === "public" ? "Публичное" : lobby.visibility === "closed" ? "Закрытое" : "Приватное"}</span>
                  {lobby.status === "closed" && <span className="rounded-[6px] bg-danger/30 px-2 py-1 text-danger">закрыто</span>}
                </div>
              </div>
            </div>
          </MapThumb>

          {/* карты серии */}
          {(game?.maps.length ?? 0) > 1 || (!game && s.map_choice === "host" && s.best_of > 1) ? (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {(game && game.maps.length ? game.maps.map((m) => m.map) : s.maps).map((m, i) => {
                const gm = game?.maps[i];
                return (
                  <MapThumb key={`${m}-${i}`} map={m} image={view.mapImages[m]} className={cn("h-16 rounded-[10px] border", gm?.status === "live" ? "border-live/70" : "border-white/[0.06]")}>
                    <span className="absolute bottom-1.5 left-2 text-[12px] font-medium text-fg">{mapLabel(m)}</span>
                    {gm && gm.status !== "pending" && (
                      <span className="num absolute right-2 top-1.5 text-[13px] font-semibold text-fg">
                        {gm.team1_score}:{gm.team2_score}
                      </span>
                    )}
                  </MapThumb>
                );
              })}
            </div>
          ) : null}

          {/* команды и центр */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,320px)_minmax(0,1fr)]">
            <TeamCard
              team="team1"
              name={lobby.team1_name}
              members={team1}
              bots={lobby.bots.team1}
              size={s.team_size}
              view={view}
              isHost={isHost}
              busy={busy}
              run={run}
              code={code}
              onEmpty={() => clickEmpty("team1")}
            />
            <Center
              view={view}
              now={now}
              isHost={isHost}
              busy={busy}
              run={run}
              code={code}
              hostName={lobby.host_name}
              onInvite={() => inviteUrl && navigator.clipboard.writeText(inviteUrl).then(() => toast.success("Ссылка-приглашение скопирована"))}
            />
            <TeamCard
              team="team2"
              name={lobby.team2_name}
              members={team2}
              bots={lobby.bots.team2}
              size={s.team_size}
              view={view}
              isHost={isHost}
              busy={busy}
              run={run}
              code={code}
              onEmpty={() => clickEmpty("team2")}
            />
          </div>

          {/* ожидание и наблюдатели */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
            <Panel
              title="В ожидании"
              count={waiting.length}
              right={
                draft ? (
                  <span className="text-[13px] text-accent">
                    Драфт · выбирает {byId.get(draft.captains[draft.turn - 1])?.nickname ?? "капитан"} · {secondsLeft(draft.deadline, now)} с
                  </span>
                ) : (
                  s.filter && <span className="text-[12px] text-fg-3">Фильтр игроков включён</span>
                )
              }
            >
              <div className="grid gap-2 sm:grid-cols-2">
                {waiting.map((m) => (
                  <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code}>
                    {myTurnInDraft && (
                      <button type="button" disabled={busy} onClick={() => run(() => A.pickInDraft(code, m.id))} className={btnClass("primary", "sm")}>
                        Выбрать
                      </button>
                    )}
                  </PlayerLine>
                ))}
                <EmptySlot onClick={() => clickEmpty("wait")} />
              </div>
            </Panel>
            <Panel title="Наблюдатели" count={`${specs.length}/${s.max_spectators}`}>
              <div className="grid gap-2">
                {specs.map((m) => (
                  <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code} />
                ))}
                {specs.length < s.max_spectators && <EmptySlot onClick={() => clickEmpty("spec")} />}
              </div>
            </Panel>
          </div>

          {view.history.length > 0 && (
            <Panel title="Сыгранные матчи" count={view.history.length}>
              <div className="divide-y divide-white/[0.06]">
                {view.history.map((h) => (
                  <Link key={h.id} href={`/lobbies/games/${h.id}`} className="flex items-center gap-3 py-2.5 text-[14px] hover:text-accent">
                    <span className={cn("min-w-0 flex-1 truncate text-right", h.winner === 1 && "font-semibold")}>{h.team1}</span>
                    <span className="num shrink-0 rounded-[6px] bg-white/[0.05] px-2 py-0.5 font-semibold">
                      {h.team1_score}:{h.team2_score}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate", h.winner === 2 && "font-semibold")}>{h.team2}</span>
                    <span className="hidden shrink-0 text-[12px] text-fg-3 sm:inline">{h.maps.map(mapLabel).join(", ")}</span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
        </div>

        {/* ───────── правая часть */}
        <aside className="min-w-0 space-y-3 xl:sticky xl:top-[110px] xl:self-start">
          <div className="grid grid-cols-2 gap-1 rounded-[12px] bg-surface p-1">
            {(["chat", "settings"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={cn("h-10 rounded-[9px] text-[14px] font-medium transition-colors", tab === t ? "bg-accent text-accent-ink" : "text-fg-2 hover:text-fg")}
              >
                {t === "chat" ? "Чат" : "Настройки"}
              </button>
            ))}
          </div>
          {tab === "chat" ? (
            <Chat view={view} code={code} onSent={load} canWrite={isMember || !!me?.isAdmin} />
          ) : (
            <div className="space-y-3">
              {!editable && (
                <div className="rounded-[10px] bg-white/[0.03] px-4 py-3 text-[13px] text-fg-3">
                  {lobby.status !== "waiting" ? "Идёт игра — настройки меняются между матчами." : "Менять настройки может только хост лобби."}
                </div>
              )}
              <QuickSettings s={s} editable={editable} patch={patch} maps={maps} images={view.mapImages} onAdvanced={() => setAdvanced(true)} />
              {editable && <VisibilityRow view={view} run={run} code={code} />}
              <button
                type="button"
                onClick={() => setAdvanced(true)}
                className="flex h-14 w-full items-center gap-3 rounded-[12px] bg-accent px-5 text-[15px] font-semibold text-accent-ink hover:bg-accent-strong"
              >
                {Icon.gear("size-5")} <span className="flex-1 text-left">Расширенные настройки</span> ↗
              </button>
              {isHost && lobby.status !== "closed" && (
                <button type="button" onClick={() => run(() => A.closeLobbyAction(code))} className={btnClass("ghost", "sm", "w-full text-danger")}>
                  Закрыть лобби
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      <AdvancedSettings
        open={advanced}
        onClose={() => setAdvanced(false)}
        s={s}
        editable={editable}
        patch={patch}
        maps={maps}
        images={view.mapImages}
        templates={templates}
        onTemplatesChange={() => A.myTemplates().then(setTemplates)}
      />

      <ReadyCheck view={view} now={now} busy={busy} onReady={() => run(() => A.toggleReady(code))} />
    </div>
  );
}

// ───────────────────────── команда

function TeamCard({
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
  run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void;
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
    <div className="overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface">
      <div className="flex items-center gap-3 border-b border-white/[0.06] px-4 py-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[9px]", team === "team1" ? "bg-warn/15 text-warn" : "bg-steel/15 text-steel")}>{Icon.crown("size-5")}</span>
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
      <div className="divide-y divide-white/[0.04]">
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

function PlayerLine({
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
  run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void;
  code: string;
  big?: boolean;
  captain?: boolean;
  children?: ReactNode;
}) {
  const [menu, setMenu] = useState(false);
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
        big ? "h-[64px] px-4" : "rounded-[10px] bg-white/[0.03] px-3 py-2",
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
        <div className="relative">
          <button type="button" onClick={() => setMenu((x) => !x)} className="grid size-8 place-items-center rounded-[7px] text-fg-3 hover:bg-white/[0.06] hover:text-fg" aria-label="Действия">
            {Icon.more("size-5")}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-[10px] border border-white/[0.1] bg-surface-3 py-1 shadow-[var(--shadow-pop)]">
                {!view.lobby.draft &&
                  moves.map((x) => (
                    <MenuItem key={x.slot} onClick={() => (setMenu(false), run(() => A.movePlayer(code, m.id, x.slot)))}>
                      {x.label}
                    </MenuItem>
                  ))}
                <MenuItem onClick={() => (setMenu(false), run(() => A.transferHost(code, m.id), `${m.nickname} теперь хост`))}>Сделать хостом</MenuItem>
                <MenuItem danger onClick={() => (setMenu(false), run(() => A.kickPlayer(code, m.id, false)))}>
                  Выгнать
                </MenuItem>
                <MenuItem danger onClick={() => (setMenu(false), run(() => A.kickPlayer(code, m.id, true)))}>
                  Забанить в лобби
                </MenuItem>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

const MenuItem = ({ children, onClick, danger }: { children: ReactNode; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={cn("block w-full px-3.5 py-2 text-left text-[13px] hover:bg-white/[0.06]", danger ? "text-danger" : "text-fg")}>
    {children}
  </button>
);

const EmptySlot = ({ onClick }: { onClick: () => void }) => (
  <button type="button" onClick={onClick} className="grid h-[52px] place-items-center rounded-[10px] border border-dashed border-white/[0.08] text-fg-4 hover:border-white/20 hover:text-fg-2" aria-label="Занять место">
    {Icon.plus("size-5")}
  </button>
);

function Panel({ title, count, right, children }: { title: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[14px] border border-white/[0.06] bg-surface p-4">
      <div className="mb-3 flex items-center gap-3">
        <h2 className="text-[17px] font-semibold text-fg">{title}</h2>
        {count != null && <span className="num rounded-[6px] bg-white/[0.06] px-2 py-0.5 text-[12px] text-fg-2">{count}</span>}
        <span className="ml-auto">{right}</span>
      </div>
      {children}
    </section>
  );
}

// ───────────────────────── центр: статус, вето, сервер

function Center({
  view,
  now,
  isHost,
  busy,
  run,
  code,
  hostName,
  onInvite,
}: {
  view: LobbyView;
  now: number;
  isHost: boolean;
  busy: boolean;
  run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void;
  code: string;
  hostName: string;
  onInvite: () => void;
}) {
  const toast = useToast();
  const { lobby, game, me } = view;
  const s = lobby.settings;
  const active = game && ["veto", "waiting", "live"].includes(game.status) ? game : null;
  const inTeam = me?.slot === "team1" || me?.slot === "team2";
  const meReady = view.members.find((m) => m.id === me?.id)?.ready;
  const last = !active && game?.status === "finished" ? game : null;

  const info: [ReactNode, string, ReactNode][] = [
    [Icon.map("size-5"), "Карта", s.maps.length === 1 ? mapLabel(s.maps[0]) : s.map_choice === "veto" ? `вето из ${s.maps.length}` : s.map_choice === "random" ? `случайно из ${s.maps.length}` : `${s.maps.length} карт`],
    [Icon.swords("size-5"), "Формат", `${MODES[s.mode].label.replace(" на ", "×")} · BO${s.best_of}`],
    [Icon.signal("size-5"), "Сеть", s.network === "lan" ? "LAN (клуб)" : "Интернет"],
    [Icon.user("size-5"), "Хост", hostName],
  ];

  return (
    <div className="flex flex-col gap-3">
      {active ? (
        <GamePanel view={view} now={now} isHost={isHost} busy={busy} run={run} code={code} />
      ) : (
        <>
          <div className="grid min-h-[60px] place-items-center rounded-[12px] border border-white/[0.12] px-4 text-center text-[15px] text-fg">
            {lobby.status === "closed"
              ? "Лобби закрыто"
              : lobby.ready_check_until
                ? `Проверка готовности · ${secondsLeft(lobby.ready_check_until, now)} с`
                : lobby.draft
                  ? "Капитаны выбирают игроков"
                  : "Ожидание игроков"}
          </div>
          {lobby.invite_token && (
            <button type="button" onClick={onInvite} className="mx-auto inline-flex items-center gap-2 text-[14px] font-medium text-accent hover:text-accent-strong">
              {Icon.users("size-4")} Пригласить игроков
            </button>
          )}
          {last && (
            <Link href={`/lobbies/games/${last.id}`} className="rounded-[12px] border border-white/[0.06] bg-white/[0.02] px-4 py-3 text-center hover:border-accent/40">
              <div className="text-[12px] text-fg-3">Последний матч</div>
              <div className="num mt-1 text-[22px] font-semibold text-fg">
                {last.team1_score}:{last.team2_score}
              </div>
              <div className="text-[12px] text-fg-2">
                {last.winner ? `победил ${last.winner === 1 ? last.team1.name : last.team2.name}` : "ничья"} · статистика →
              </div>
            </Link>
          )}
        </>
      )}

      <div className="divide-y divide-white/[0.05] rounded-[12px] bg-surface">
        {info.map(([icon, label, value]) => (
          <div key={label} className="flex items-center gap-3 px-4 py-3 text-[14px]">
            <span className="text-fg-3">{icon}</span>
            <span className="text-fg-2">{label}</span>
            <span className="ml-auto truncate text-fg">{value}</span>
          </div>
        ))}
      </div>

      {lobby.status === "waiting" && (
        <>
          {isHost && !lobby.draft && (
            <div className="grid grid-cols-4 gap-1 rounded-[12px] bg-surface p-1">
              {(
                [
                  ["balance", Icon.scale("size-5"), "Баланс по ELO"],
                  ["shuffle", Icon.shuffle("size-5"), "Перемешать"],
                  ["swap", Icon.swap("size-5"), "Поменять команды"],
                  ["clear", Icon.broom("size-5"), "Очистить команды"],
                ] as const
              ).map(([tool, icon, title]) => (
                <button key={tool} type="button" title={title} disabled={busy} onClick={() => run(() => A.teamTool(code, tool))} className="grid h-11 place-items-center rounded-[9px] text-fg-3 hover:bg-white/[0.06] hover:text-fg">
                  {icon}
                </button>
              ))}
            </div>
          )}
          {isHost && s.player_pick === "captains" && !lobby.draft && (
            <button type="button" disabled={busy} onClick={() => run(() => A.beginDraft(code))} className={btnClass("secondary", "md", "w-full")}>
              Начать драфт капитанов
            </button>
          )}
          {isHost && !lobby.ready_check_until && (
            <button
              type="button"
              disabled={busy || !!lobby.draft}
              onClick={() => run(() => A.startMatch(code))}
              className={btnClass("primary", "lg", "w-full")}
            >
              {last ? "Сыграть ещё раз" : "Начать матч"}
            </button>
          )}
          {isHost && lobby.ready_check_until && (
            <button type="button" disabled={busy} onClick={() => run(() => A.cancelReadyCheck(code))} className={btnClass("ghost", "md", "w-full")}>
              Отменить проверку
            </button>
          )}
          {inTeam && (s.start === "all_ready" || lobby.ready_check_until) && (
            <button type="button" disabled={busy} onClick={() => run(() => A.toggleReady(code))} className={btnClass(meReady ? "secondary" : "primary", "md", "w-full")}>
              {meReady ? "Не готов" : "Готов"}
            </button>
          )}
          {!isHost && s.start === "host" && !lobby.ready_check_until && (
            <p className="text-center text-[13px] text-fg-3">Матч запускает хост{inTeam ? " — когда начнёт, подтвердите готовность" : ""}</p>
          )}
          {s.start === "all_ready" && <p className="text-center text-[13px] text-fg-3">Матч начнётся сам, когда команды полные и все готовы</p>}
        </>
      )}
      {isHost && active && active.status !== "live" && (
        <button type="button" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))} className={btnClass("ghost", "sm", "w-full text-danger")}>
          Отменить игру
        </button>
      )}
      {active?.status === "live" && me?.isAdmin && (
        <button type="button" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))} className={btnClass("ghost", "sm", "w-full text-danger")}>
          Остановить матч (админ)
        </button>
      )}
      {active?.server_address && (
        <button type="button" onClick={() => navigator.clipboard.writeText(`connect ${active.server_address}`).then(() => toast.success("Команда скопирована — вставьте в консоль CS2"))} className="text-[12px] text-fg-3 hover:text-fg">
          Скопировать «connect {active.server_address}»
        </button>
      )}
    </div>
  );
}

function GamePanel({ view, now, isHost, busy, run, code }: { view: LobbyView; now: number; isHost: boolean; busy: boolean; run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void; code: string }) {
  const g = view.game!;
  const me = view.me;
  if (g.status === "veto") {
    const team = g.veto_turn === 1 ? g.team1 : g.team2;
    const captainId = team.players[0]?.id ?? view.lobby.host_id;
    const myTurn = me?.id === captainId || (isHost && !team.players.length);
    const used = new Map(g.veto.map((v) => [v.map, v]));
    return (
      <div className="rounded-[12px] border border-white/[0.08] bg-surface p-3">
        <div className="mb-2 text-center text-[14px]">
          {g.veto_turn ? (
            <>
              <span className="font-semibold">{team.name}</span> {g.veto_action === "ban" ? "банит" : "выбирает"} карту ·{" "}
              <span className="num text-warn">{secondsLeft(g.veto_deadline, now)} с</span>
            </>
          ) : (
            "Вето завершено"
          )}
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {g.veto_pool.map((m) => {
            const v = used.get(m);
            return (
              <button
                key={m}
                type="button"
                disabled={!myTurn || !!v || busy}
                onClick={() => run(() => A.lobbyVeto(code, m))}
                className={cn("text-left disabled:cursor-default", v?.action === "ban" && "opacity-35 grayscale")}
              >
                <MapThumb map={m} image={view.mapImages[m]} className={cn("h-12 rounded-[8px] border", v?.action === "pick" || v?.action === "decider" ? "border-accent" : myTurn && !v ? "border-white/20 hover:border-accent" : "border-white/[0.06]")}>
                  <span className="absolute bottom-1 left-1.5 text-[12px] font-medium text-fg">{mapLabel(m)}</span>
                  {v && <span className="absolute right-1.5 top-1 text-[10px] uppercase text-fg-2">{v.action === "ban" ? "бан" : v.action === "pick" ? "пик" : "десайдер"}</span>}
                </MapThumb>
              </button>
            );
          })}
        </div>
        {myTurn && <p className="mt-2 text-center text-[12px] text-accent">Ваш ход — нажмите на карту</p>}
      </div>
    );
  }

  const live = g.maps.find((m) => m.status === "live");
  return (
    <div className="rounded-[12px] border border-white/[0.08] bg-surface p-4 text-center">
      {g.status === "live" ? (
        <>
          <div className="inline-flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.2em] text-live">
            <span className="size-2 animate-pulse rounded-full bg-live" /> Live
          </div>
          <div className="mt-2 flex items-center justify-center gap-3">
            <span className="min-w-0 flex-1 truncate text-right text-[14px]">{g.team1.name}</span>
            <span className="num text-[30px] font-semibold leading-none">
              {(live ?? g.maps[0])?.team1_score ?? 0}:{(live ?? g.maps[0])?.team2_score ?? 0}
            </span>
            <span className="min-w-0 flex-1 truncate text-left text-[14px]">{g.team2.name}</span>
          </div>
          {g.best_of > 1 && (
            <div className="num mt-1 text-[12px] text-fg-3">
              серия {g.team1_score}:{g.team2_score} · {live ? mapLabel(live.map) : ""}
            </div>
          )}
        </>
      ) : g.server_state === "ready" ? (
        <div className="text-[15px] font-semibold text-ok">Игроки заходят на сервер</div>
      ) : (
        <div className="text-[14px] text-fg-2">
          <span className="mr-2 inline-block size-2 animate-pulse rounded-full bg-warn" />
          {g.note ?? "Готовим сервер…"}
        </div>
      )}
      {g.server_address && (
        <a href={`steam://connect/${g.server_address}`} className={btnClass("primary", "lg", "mt-3 w-full")}>
          Подключиться
        </a>
      )}
      {!g.server_address && g.server_state === "ready" && !me?.inGame && <p className="mt-2 text-[12px] text-fg-3">Адрес видят игроки матча и наблюдатели лобби</p>}
      {g.gotv_address && (
        <a href={`steam://connect/${g.gotv_address}`} className={btnClass("secondary", "sm", "mt-2 w-full")}>
          Смотреть через GOTV
        </a>
      )}
      {g.server_state === "ready" && g.status !== "live" && me?.inGame && (
        <p className="mt-2 text-[12px] text-fg-3">Зайдите на сервер и напишите .r в чат — матч начнётся, когда будут готовы все игроки</p>
      )}
    </div>
  );
}

// ───────────────────────── проверка готовности

function ReadyCheck({ view, now, busy, onReady }: { view: LobbyView; now: number; busy: boolean; onReady: () => void }) {
  const { lobby, me } = view;
  const mine = view.members.find((m) => m.id === me?.id);
  const open = !!lobby.ready_check_until && !!mine && (mine.slot === "team1" || mine.slot === "team2") && !mine.ready;
  const left = secondsLeft(lobby.ready_check_until, now);
  const inTeams = view.members.filter((m) => m.slot === "team1" || m.slot === "team2");
  return (
    <Sheet open={open} onClose={() => {}} width={420} title={<span className="block text-center">Матч готов к старту</span>} subtitle={<span className="block text-center">Подтвердите, что вы на месте</span>}>
      <div className="text-center">
        <div className="num text-[48px] font-semibold text-fg">{left}</div>
        <div className="mb-5 flex flex-wrap justify-center gap-1.5">
          {inTeams.map((m) => (
            <span key={m.id} className={cn("size-3 rounded-full", m.ready ? "bg-ok" : "bg-white/15")} title={m.nickname} />
          ))}
        </div>
        <button type="button" data-autofocus disabled={busy} onClick={onReady} className={btnClass("primary", "lg", "w-full")}>
          Готов
        </button>
      </div>
    </Sheet>
  );
}

// ───────────────────────── тип лобби (в панели настроек)

function VisibilityRow({ view, run, code }: { view: LobbyView; run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void; code: string }) {
  const [vis, setVis] = useState(view.lobby.visibility);
  const [pw, setPw] = useState("");
  const changed = vis !== view.lobby.visibility || pw.length > 0;
  return (
    <div className="space-y-2 rounded-[10px] bg-white/[0.03] px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="text-fg-3">{Icon.lock()}</span>
        <span className="flex-1 text-[14px]">Тип лобби</span>
        <select value={vis} onChange={(e) => setVis(e.target.value as typeof vis)} className="h-9 rounded-[8px] border border-white/[0.1] bg-surface-3 px-3 text-[13px] text-fg">
          <option value="public">Открытое</option>
          <option value="closed">Закрытое</option>
          <option value="private">Приватное</option>
        </select>
      </div>
      {vis !== "public" && (
        <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder={view.lobby.has_password ? "Новый пароль (не обязательно)" : "Пароль"} maxLength={32} className="h-9 w-full rounded-[8px] border border-white/[0.1] bg-surface-3 px-3 text-[13px] text-fg outline-none" />
      )}
      {changed && (
        <button type="button" onClick={() => (setPw(""), run(() => A.setVisibility(code, vis, pw), "Тип лобби изменён"))} className={btnClass("primary", "sm", "w-full")}>
          Сохранить
        </button>
      )}
    </div>
  );
}

// ───────────────────────── чат

function Chat({ view, code, onSent, canWrite }: { view: LobbyView; code: string; onSent: () => Promise<void>; canWrite: boolean }) {
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
    <div className="flex h-[560px] flex-col overflow-hidden rounded-[14px] border border-white/[0.06] bg-surface">
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
          className="flex gap-2 border-t border-white/[0.06] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <input value={text} onChange={(e) => setText(e.target.value)} maxLength={300} placeholder="Сообщение…" className="h-10 min-w-0 flex-1 rounded-[9px] border border-white/[0.1] bg-surface-3 px-3 text-[14px] text-fg outline-none focus:border-accent/50" />
          <button type="submit" disabled={pending || !text.trim()} className="grid size-10 place-items-center rounded-[9px] bg-accent text-accent-ink disabled:opacity-50" aria-label="Отправить">
            {Icon.send("size-4")}
          </button>
        </form>
      ) : (
        <p className="border-t border-white/[0.06] p-3 text-center text-[13px] text-fg-3">Войдите в лобби, чтобы писать в чат</p>
      )}
    </div>
  );
}

// ───────────────────────── вход в закрытое лобби

function Gate({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto max-w-[460px] px-5 py-24 text-center">
      <h1 className="text-[26px] font-semibold tracking-[-0.015em]">{title}</h1>
      <p className="mt-3 text-[15px] text-fg-2">{text}</p>
      <div className="mt-8">{children}</div>
    </div>
  );
}

function JoinGate({ code, view, invite, onJoined }: { code: string; view: LobbyView; invite: string | null; onJoined: () => Promise<void> }) {
  const router = useRouter();
  const toast = useToast();
  const [pw, setPw] = useState("");
  const [pending, start] = useTransition();
  if (!view.me) {
    return (
      <Gate title="Вход в лобби" text="Чтобы войти в лобби, авторизуйтесь через Steam.">
        <Link href={`/login?next=${encodeURIComponent(`/lobby/${code}${invite ? `?t=${invite}` : ""}`)}`} className={btnClass("primary", "md")}>
          Войти через Steam
        </Link>
      </Gate>
    );
  }
  const join = () =>
    start(async () => {
      const r = await A.joinLobby(code, { password: pw, invite: invite ?? undefined });
      if (r?.error) {
        toast.error(r.error);
        if (r.code && r.code !== code) router.push(`/lobby/${r.code}`);
        return;
      }
      await onJoined();
    });
  return (
    <Gate
      title={view.lobby.visibility === "private" ? "Приватное лобби" : "Закрытое лобби"}
      text={invite ? "Вас пригласили — пароль не нужен." : `Хост ${view.lobby.host_name !== "—" ? view.lobby.host_name : ""} защитил лобби паролем.`}
    >
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        {!invite && (
          <input value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Пароль" autoFocus className="h-12 w-full rounded-[9px] border border-white/[0.1] bg-surface-3 px-4 text-[15px] text-fg outline-none focus:border-accent/50" />
        )}
        <button type="submit" disabled={pending} className={btnClass("primary", "lg", "w-full")}>
          {pending ? "Входим…" : "Войти в лобби"}
        </button>
      </form>
    </Gate>
  );
}
