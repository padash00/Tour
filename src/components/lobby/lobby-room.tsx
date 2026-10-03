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
import { useToast } from "../toast";
import { Avatar, FaceitLevel } from "../ui";
import { AdvancedSettings, MapThumb, QuickSettings, type MapOption, type Template } from "./settings";
import { Button, CriticalSurface, Dialog, Facts, FeatureSurface, Status, lobbyStatus, buttonClass as btnClass, cn } from "@/components/ds";
import { Icon } from "./ui";

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

function phaseOf(view: LobbyView) {
  const { lobby, game } = view;
  if (lobby.status === "closed") return "closed" as const;
  if (game?.status === "live") return "live" as const;
  if (game?.status === "veto") return "veto" as const;
  if (game?.status === "waiting") return "server" as const;
  if (lobby.ready_check_until) return "ready_check" as const;
  if (lobby.draft) return "draft" as const;
  return "waiting" as const;
}

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
  const phase = phaseOf(view);

  const join = (slot?: Slot) => run(() => A.joinLobby(code, { slot, invite: invite ?? undefined }));
  const clickEmpty = (slot: Slot) => {
    if (!me) return router.push(`/login?next=${encodeURIComponent(`/lobby/${code}`)}`);
    if (!isMember) return join(slot);
    run(() => A.moveSelf(code, slot));
  };

  return (
    <>
      <div className="border-b border-line-subtle bg-shell">
        <div className="mx-auto w-full max-w-wide px-4 py-5 sm:px-6 lg:px-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/lobbies" className={btnClass("ghost", "sm", "shrink-0")}>
                {Icon.back("size-4")}
                <span className="hidden sm:inline">Лобби</span>
              </Link>
              <MapThumb map={headMap} image={view.mapImages[headMap]} className="hidden h-14 w-24 shrink-0 rounded-control border border-line-subtle sm:block">
                <span className="absolute bottom-1.5 left-2 max-w-[80px] truncate text-[11px] font-medium text-fg">{mapLabel(headMap)}</span>
              </MapThumb>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="num text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">Лобби #{lobby.code}</h1>
                  <Status info={lobbyStatus[phase]} size="sm" />
                </div>
                <p className="mt-1 truncate text-meta text-fg-3">
                  Хост {lobby.host_name} · {MODES[s.mode].label.replace(" на ", "×")} · BO{s.best_of} · {s.network === "lan" ? "LAN" : "Интернет"} · {lobby.visibility === "public" ? "публичное" : lobby.visibility === "closed" ? "по паролю" : "приватное"}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <span className="num rounded-control border border-line-subtle bg-surface px-3 py-2 text-meta text-fg-2">
                {playersNow}/{s.team_size * 2} игроков
              </span>
              {inviteUrl && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    navigator.clipboard
                      .writeText(inviteUrl)
                      .then(() => toast.success(lobby.visibility === "public" ? "Ссылка скопирована" : "Ссылка скопирована — по ней можно войти без пароля"))
                  }
                >
                  {Icon.link("size-4")} Пригласить
                </Button>
              )}
              {isMember ? (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() =>
                    run(async () => {
                      const r = await A.leaveLobby(code);
                      if (!r?.error) router.push("/lobbies");
                      return r;
                    })
                  }
                >
                  Покинуть
                </Button>
              ) : (
                lobby.status !== "closed" && (
                  <Button size="sm" onClick={() => (me ? join() : clickEmpty("wait"))}>
                    Войти
                  </Button>
                )
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-wide px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <main className="min-w-0 space-y-6">
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

            {(game?.maps.length ?? 0) > 1 || (!game && s.map_choice === "host" && s.best_of > 1) ? (
              <section aria-label="Карты серии">
                <div className="mb-3 text-title text-fg">Карты</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                  {(game && game.maps.length ? game.maps.map((m) => m.map) : s.maps).map((m, i) => {
                    const gm = game?.maps[i];
                    return (
                      <MapThumb
                        key={`${m}-${i}`}
                        map={m}
                        image={view.mapImages[m]}
                        className={cn("h-20 rounded-surface border", gm?.status === "live" ? "border-live/60" : "border-line-subtle")}
                      >
                        <span className="absolute bottom-2 left-2.5 text-[12px] font-medium text-fg">{mapLabel(m)}</span>
                        {gm && gm.status !== "pending" && (
                          <span className="num absolute right-2.5 top-2 text-[13px] font-semibold text-fg">
                            {gm.team1_score}:{gm.team2_score}
                          </span>
                        )}
                      </MapThumb>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <section>
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="text-heading text-fg">Команды</h2>
                <span className="text-meta text-fg-3">Займите слот или дождитесь распределения хостом</span>
              </div>
              <div className="grid gap-4 lg:grid-cols-2">
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
            </section>

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel
                title="В ожидании"
                count={waiting.length}
                right={
                  draft ? (
                    <span className="text-meta text-accent">
                      выбирает {byId.get(draft.captains[draft.turn - 1])?.nickname ?? "капитан"} · {secondsLeft(draft.deadline, now)} с
                    </span>
                  ) : (
                    s.filter && <span className="text-meta text-fg-3">Фильтр игроков включён</span>
                  )
                }
              >
                <div className="grid gap-2 sm:grid-cols-2">
                  {waiting.map((m) => (
                    <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code}>
                      {myTurnInDraft && (
                        <Button size="sm" disabled={busy} onClick={() => run(() => A.pickInDraft(code, m.id))}>
                          Выбрать
                        </Button>
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
                <div className="divide-y divide-line-subtle">
                  {view.history.map((h) => (
                    <Link key={h.id} href={`/lobbies/games/${h.id}`} className="flex min-h-14 items-center gap-3 py-2.5 text-[14px] hover:text-accent">
                      <span className={cn("min-w-0 flex-1 truncate text-right", h.winner === 1 && "font-semibold")}>{h.team1}</span>
                      <span className="num shrink-0 rounded-control bg-white/[0.05] px-2 py-0.5 font-semibold">
                        {h.team1_score}:{h.team2_score}
                      </span>
                      <span className={cn("min-w-0 flex-1 truncate", h.winner === 2 && "font-semibold")}>{h.team2}</span>
                      <span className="hidden shrink-0 text-meta text-fg-3 sm:inline">{h.maps.map(mapLabel).join(", ")}</span>
                    </Link>
                  ))}
                </div>
              </Panel>
            )}
          </main>

          <aside className="min-w-0 xl:sticky xl:top-[calc(var(--shell-h)+24px)] xl:self-start">
            <div className="mb-3 grid grid-cols-2 gap-1 rounded-control border border-line-subtle bg-shell p-1">
              {(["chat", "settings"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={cn(
                    "h-9 rounded-[6px] text-[14px] font-medium transition-colors",
                    tab === t ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg",
                  )}
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
                  <div className="rounded-control border border-line-subtle bg-shell px-4 py-3 text-meta text-fg-3">
                    {lobby.status !== "waiting" ? "Идёт игра — настройки меняются между матчами." : "Менять настройки может только хост лобби."}
                  </div>
                )}
                <QuickSettings s={s} editable={editable} patch={patch} maps={maps} images={view.mapImages} onAdvanced={() => setAdvanced(true)} />
                {editable && <VisibilityRow view={view} run={run} code={code} />}
                <Button block onClick={() => setAdvanced(true)}>
                  {Icon.gear("size-5")} Расширенные настройки
                </Button>
                {isHost && lobby.status !== "closed" && (
                  <Button variant="danger" size="sm" block onClick={() => run(() => A.closeLobbyAction(code))}>
                    Закрыть лобби
                  </Button>
                )}
              </div>
            )}
          </aside>
        </div>
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
    </>
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
        <div className="relative">
          <button type="button" onClick={() => setMenu((x) => !x)} className="grid size-8 place-items-center rounded-[7px] text-fg-3 hover:bg-white/[0.06] hover:text-fg" aria-label="Действия">
            {Icon.more("size-5")}
          </button>
          {menu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setMenu(false)} />
              <div className="absolute right-0 top-9 z-50 w-56 overflow-hidden rounded-control border border-white/[0.1] bg-surface-3 py-1 shadow-[var(--shadow-pop)]">
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
  <button type="button" onClick={onClick} className="grid h-[52px] place-items-center rounded-control border border-dashed border-line text-fg-4 transition-colors hover:border-line-strong hover:bg-white/[0.03] hover:text-fg-2" aria-label="Занять место">
    {Icon.plus("size-5")}
  </button>
);

function Panel({ title, count, right, children }: { title: string; count?: ReactNode; right?: ReactNode; children: ReactNode }) {
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
  const { lobby, game, me } = view;
  const settings = lobby.settings;
  const active = game && ["veto", "waiting", "live"].includes(game.status) ? game : null;
  const inTeam = me?.slot === "team1" || me?.slot === "team2";
  const meReady = view.members.find((m) => m.id === me?.id)?.ready;
  const last = !active && game?.status === "finished" ? game : null;
  const phase = phaseOf(view);
  const draftCaptain = lobby.draft ? view.members.find((m) => m.id === lobby.draft?.captains[lobby.draft.turn - 1]) : null;
  const myDraftTurn = !!lobby.draft && me?.id === lobby.draft.captains[lobby.draft.turn - 1];

  const facts = [
    {
      label: "Карта",
      value:
        settings.maps.length === 1
          ? mapLabel(settings.maps[0])
          : settings.map_choice === "veto"
            ? `Вето из ${settings.maps.length}`
            : settings.map_choice === "random"
              ? `Случайно из ${settings.maps.length}`
              : `${settings.maps.length} карт`,
    },
    { label: "Формат", value: `${MODES[settings.mode].label.replace(" на ", "×")} · BO${settings.best_of}` },
    { label: "Сеть", value: settings.network === "lan" ? "LAN · в клубе" : "Интернет" },
    { label: "Хост", value: hostName },
  ];

  let state: ReactNode;
  if (active) {
    state = <GamePanel view={view} now={now} isHost={isHost} busy={busy} run={run} code={code} />;
  } else if (phase === "ready_check") {
    state = (
      <CriticalSurface tone="warn">
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-warn">Проверка готовности</div>
            <h2 className="mt-2 text-heading text-fg">Матч готов к старту</h2>
            <p className="mt-2 max-w-read text-[14px] text-fg-2">
              Команды собраны. Все игроки должны подтвердить готовность до окончания таймера.
            </p>
          </div>
          <div className="text-right">
            <div className="text-micro text-fg-3">Осталось</div>
            <div className="num mt-1 text-[36px] font-semibold leading-none text-warn">{secondsLeft(lobby.ready_check_until, now)} с</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap gap-2">
          {inTeam && (
            <Button
              size="lg"
              loading={busy}
              variant={meReady ? "secondary" : "primary"}
              onClick={() => run(() => A.toggleReady(code))}
            >
              {meReady ? "Готовность подтверждена" : "Я готов"}
            </Button>
          )}
          {isHost && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => run(() => A.cancelReadyCheck(code))}>
              Отменить проверку
            </Button>
          )}
        </div>
      </CriticalSurface>
    );
  } else if (phase === "draft" && lobby.draft) {
    state = (
      <CriticalSurface tone={myDraftTurn ? "accent" : "warn"}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{myDraftTurn ? "Ваш ход" : "Драфт капитанов"}</div>
            <h2 className="mt-2 text-heading text-fg">
              {myDraftTurn ? "Выберите следующего игрока" : `Выбирает ${draftCaptain?.nickname ?? "капитан"}`}
            </h2>
            <p className="mt-2 max-w-read text-[14px] text-fg-2">
              Игроки из блока «В ожидании» распределяются капитанами по командам.
            </p>
          </div>
          <div className="text-right">
            <div className="text-micro text-fg-3">На выбор</div>
            <div className="num mt-1 text-[36px] font-semibold leading-none">{secondsLeft(lobby.draft.deadline, now)} с</div>
          </div>
        </div>
      </CriticalSurface>
    );
  } else if (phase === "closed") {
    state = (
      <CriticalSurface tone="danger">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-danger">Лобби закрыто</div>
        <h2 className="mt-2 text-heading text-fg">Новые игры здесь больше не запускаются</h2>
      </CriticalSurface>
    );
  } else {
    state = (
      <FeatureSurface>
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">Текущее действие</div>
        <div className="mt-2 flex flex-wrap items-start justify-between gap-5">
          <div>
            <h2 className="text-heading text-fg">{last ? "Готовы сыграть ещё?" : "Соберите команды"}</h2>
            <p className="mt-2 max-w-read text-[14px] text-fg-2">
              {isHost
                ? settings.player_pick === "captains"
                  ? "Распределите капитанов и запустите драфт либо расставьте игроков вручную."
                  : "Расставьте игроков, при необходимости добавьте ботов и запускайте проверку готовности."
                : settings.start === "all_ready"
                  ? "Займите место в команде и подтвердите готовность. Матч запустится, когда команды будут готовы."
                  : "Займите место в команде. Когда составы будут готовы, хост запустит матч."}
            </p>
          </div>
          {lobby.invite_token && (
            <Button variant="secondary" size="sm" onClick={onInvite}>
              {Icon.users("size-4")} Пригласить игроков
            </Button>
          )}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {isHost && settings.player_pick === "captains" && !lobby.draft && (
            <Button variant="secondary" disabled={busy} onClick={() => run(() => A.beginDraft(code))}>
              Начать драфт капитанов
            </Button>
          )}
          {isHost && !lobby.ready_check_until && (
            <Button size="lg" disabled={busy || !!lobby.draft} onClick={() => run(() => A.startMatch(code))}>
              {last ? "Сыграть ещё раз" : "Начать матч"}
            </Button>
          )}
          {inTeam && settings.start === "all_ready" && (
            <Button variant={meReady ? "secondary" : "primary"} disabled={busy} onClick={() => run(() => A.toggleReady(code))}>
              {meReady ? "Не готов" : "Готов"}
            </Button>
          )}
        </div>

        {!isHost && settings.start === "host" && (
          <p className="mt-4 text-meta text-fg-3">Матч запускает хост{inTeam ? " — после запуска подтвердите готовность" : ""}.</p>
        )}
        {settings.start === "all_ready" && <p className="mt-4 text-meta text-fg-3">Матч стартует автоматически, когда команды полные и все игроки готовы.</p>}
      </FeatureSurface>
    );
  }

  return (
    <section aria-label="Текущее состояние лобби">
      {state}

      <div className="mt-4 rounded-surface border border-line-subtle bg-surface px-4 py-4 sm:px-5">
        <Facts items={facts} columns={4} />
      </div>

      {lobby.status === "waiting" && isHost && !lobby.draft && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {(
            [
              ["balance", Icon.scale("size-4"), "Баланс по ELO"],
              ["shuffle", Icon.shuffle("size-4"), "Перемешать"],
              ["swap", Icon.swap("size-4"), "Поменять команды"],
              ["clear", Icon.broom("size-4"), "Очистить команды"],
            ] as const
          ).map(([tool, icon, title]) => (
            <button
              key={tool}
              type="button"
              title={title}
              disabled={busy}
              onClick={() => run(() => A.teamTool(code, tool))}
              className={btnClass("ghost", "sm")}
            >
              {icon} {title}
            </button>
          ))}
        </div>
      )}

      {last && (
        <div className="mt-3 text-right">
          <Link href={`/lobbies/games/${last.id}`} className={btnClass("quiet", "sm")}>
            Последний матч · {last.team1_score}:{last.team2_score} →
          </Link>
        </div>
      )}
    </section>
  );
}

function GamePanel({ view, now, isHost, busy, run, code }: { view: LobbyView; now: number; isHost: boolean; busy: boolean; run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void; code: string }) {
  const game = view.game!;
  const me = view.me;

  if (game.status === "veto") {
    const team = game.veto_turn === 1 ? game.team1 : game.team2;
    const captainId = team.players[0]?.id ?? view.lobby.host_id;
    const myTurn = me?.id === captainId || (isHost && !team.players.length);
    const used = new Map(game.veto.map((v) => [v.map, v]));

    return (
      <CriticalSurface tone={myTurn ? "accent" : "warn"}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{myTurn ? "Ваш ход" : "Вето карт"}</div>
            <h2 className="mt-2 text-heading text-fg">
              {game.veto_turn ? `${team.name} · ${game.veto_action === "ban" ? "бан карты" : "пик карты"}` : "Вето завершается"}
            </h2>
            <p className="mt-2 text-[14px] text-fg-2">
              {myTurn ? "Нажмите на доступную карту ниже." : "Дождитесь выбора капитана. Комната обновится автоматически."}
            </p>
          </div>
          {game.veto_deadline && (
            <div className="text-right">
              <div className="text-micro text-fg-3">Осталось</div>
              <div className="num mt-1 text-[36px] font-semibold leading-none">{secondsLeft(game.veto_deadline, now)} с</div>
            </div>
          )}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {game.veto_pool.map((map) => {
            const action = used.get(map);
            const available = myTurn && !action && !busy;
            return (
              <button
                key={map}
                type="button"
                disabled={!available}
                onClick={() => run(() => A.lobbyVeto(code, map))}
                className={cn("text-left disabled:cursor-default", action?.action === "ban" && "opacity-40 grayscale")}
              >
                <MapThumb
                  map={map}
                  image={view.mapImages[map]}
                  className={cn(
                    "h-20 rounded-control border",
                    action?.action === "pick" || action?.action === "decider"
                      ? "border-accent"
                      : available
                        ? "border-line-strong hover:border-accent"
                        : "border-line-subtle",
                  )}
                >
                  <span className="absolute bottom-2 left-2 text-[12px] font-medium text-fg">{mapLabel(map)}</span>
                  {action && (
                    <span className={cn("absolute right-2 top-2 text-micro font-semibold uppercase", action.action === "ban" ? "text-danger" : "text-accent")}>
                      {action.action === "ban" ? "бан" : action.action === "pick" ? "пик" : "decider"}
                    </span>
                  )}
                </MapThumb>
              </button>
            );
          })}
        </div>

        {isHost && (
          <div className="mt-4">
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              Отменить игру
            </Button>
          </div>
        )}
      </CriticalSurface>
    );
  }

  const liveMap = game.maps.find((m) => m.status === "live") ?? game.maps[0];

  if (game.status === "live") {
    return (
      <FeatureSurface className="border-live/30">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-live">LIVE</div>
        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4">
          <div className="truncate text-right text-title text-fg">{game.team1.name}</div>
          <div className="num text-[36px] font-semibold leading-none text-fg sm:text-[44px]">
            {liveMap?.team1_score ?? 0}:{liveMap?.team2_score ?? 0}
          </div>
          <div className="truncate text-title text-fg">{game.team2.name}</div>
        </div>
        <div className="mt-3 text-center text-meta text-fg-3">
          {liveMap ? mapLabel(liveMap.map) : "Матч"}{game.best_of > 1 ? ` · серия ${game.team1_score}:${game.team2_score}` : ""}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {game.server_address && (
            <a href={`steam://connect/${game.server_address}`} className={btnClass("secondary", "md")}>
              Подключиться
            </a>
          )}
          {game.gotv_address && (
            <a href={`steam://connect/${game.gotv_address}`} className={btnClass("secondary", "md")}>
              Смотреть GOTV
            </a>
          )}
          {me?.isAdmin && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              Остановить матч
            </Button>
          )}
        </div>
      </FeatureSurface>
    );
  }

  if (game.server_state === "ready") {
    return (
      <CriticalSurface tone="ok">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-ok">Сервер готов</div>
        <h2 className="mt-2 text-heading text-fg">{game.server_address ? "Подключайтесь к матчу" : "Игроки подключаются"}</h2>
        <p className="mt-2 max-w-read text-[14px] text-fg-2">
          {game.server_address
            ? "Откройте сервер кнопкой ниже. В разминке напишите .r — матч начнётся после готовности всех игроков."
            : "Адрес сервера доступен только игрокам матча и наблюдателям лобби."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2">
          {game.server_address && (
            <a href={`steam://connect/${game.server_address}`} className={btnClass("primary", "lg")}>
              Подключиться
            </a>
          )}
          {game.gotv_address && (
            <a href={`steam://connect/${game.gotv_address}`} className={btnClass("secondary", "lg")}>
              Смотреть GOTV
            </a>
          )}
          {isHost && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              Отменить игру
            </Button>
          )}
        </div>
      </CriticalSurface>
    );
  }

  return (
    <FeatureSurface>
      <div className="text-micro font-semibold uppercase tracking-[0.14em] text-warn">Сервер</div>
      <h2 className="mt-2 text-heading text-fg">Готовим сервер</h2>
      <p className="mt-2 text-[14px] text-fg-2">{game.note ?? "Назначаем инстанс, загружаем карту и составы. Адрес появится здесь автоматически."}</p>
      <div className="mt-5 flex items-center gap-2 text-meta text-fg-3">
        <span className="size-2 animate-pulse rounded-full bg-warn" />
        Ожидание агента
      </div>
      {isHost && (
        <div className="mt-5">
          <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
            Отменить игру
          </Button>
        </div>
      )}
    </FeatureSurface>
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
    <Dialog
      open={open}
      onClose={() => {}}
      title="Матч готов к старту"
      description="Подтвердите, что вы на месте. Если время закончится, проверка готовности будет отменена."
      size="sm"
      footer={
        <Button block size="lg" loading={busy} onClick={onReady} data-autofocus>
          Я готов
        </Button>
      }
    >
      <div className="py-2 text-center">
        <div className="text-micro uppercase tracking-[0.14em] text-fg-3">Осталось</div>
        <div className={cn("num mt-2 text-[52px] font-semibold leading-none", left <= 10 ? "text-danger" : "text-fg")}>{left}</div>
        <div className="mt-5 flex flex-wrap justify-center gap-2" aria-label="Готовность игроков">
          {inTeams.map((member) => (
            <span
              key={member.id}
              className={cn("size-3 rounded-full border border-line", member.ready ? "bg-ok" : "bg-surface-3")}
              title={`${member.nickname}: ${member.ready ? "готов" : "ожидаем"}`}
            />
          ))}
        </div>
      </div>
    </Dialog>
  );
}

// ───────────────────────── тип лобби (в панели настроек)

function VisibilityRow({ view, run, code }: { view: LobbyView; run: (fn: () => Promise<A.LobbyResult>, ok?: string) => void; code: string }) {
  const [vis, setVis] = useState(view.lobby.visibility);
  const [pw, setPw] = useState("");
  const changed = vis !== view.lobby.visibility || pw.length > 0;
  return (
    <div className="space-y-2 rounded-control bg-white/[0.03] px-4 py-3">
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

// ───────────────────────── вход в закрытое лобби

function Gate({ title, text, children }: { title: string; text: string; children?: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-read px-5 py-20 sm:py-28">
      <FeatureSurface className="text-center">
        <h1 className="text-heading text-fg">{title}</h1>
        <p className="mx-auto mt-3 max-w-[520px] text-[14px] leading-relaxed text-fg-2">{text}</p>
        {children && <div className="mt-7">{children}</div>}
      </FeatureSurface>
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
      <Gate title="Вход в лобби" text="Авторизуйтесь через Steam — после входа вернём вас в эту же комнату.">
        <Button href={`/login?next=${encodeURIComponent(`/lobby/${code}${invite ? `?t=${invite}` : ""}`)}`} size="lg">
          Войти через Steam
        </Button>
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
      title={view.lobby.visibility === "private" ? "Приватное лобби" : "Лобби по паролю"}
      text={invite ? "У вас действующая ссылка-приглашение — пароль не нужен." : `Хост ${view.lobby.host_name !== "—" ? view.lobby.host_name : ""} ограничил вход в комнату.`}
    >
      <form
        className="mx-auto max-w-sm space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          join();
        }}
      >
        {!invite && (
          <input
            value={pw}
            onChange={(e) => setPw(e.target.value)}
            placeholder="Пароль"
            autoFocus
            className="h-12 w-full rounded-control border border-line bg-shell px-4 text-[15px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]"
          />
        )}
        <Button type="submit" block size="lg" loading={pending}>
          Войти в лобби
        </Button>
      </form>
    </Gate>
  );
}

