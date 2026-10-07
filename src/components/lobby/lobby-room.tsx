"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewMember } from "@/lib/lobby-view";
import type { LobbySettings } from "@/lib/lobby-settings";
import { mapLabel } from "@/lib/maps";
import { useToast } from "../toast";
import { AdvancedSettings, MapThumb, QuickSettings, type MapOption, type Template } from "./settings";
import { Button, Status, Steps, lobbyStatus, buttonClass as btnClass, cn } from "@/components/ds";
import { Icon } from "./ui";
import { MobileStickyCta } from "@/components/public/callout";
import { CenterColumn, StageBanner } from "./center";
import { Chat } from "./chat";
import { Countdown, LobbyClock } from "./countdown";
import { Gate, JoinGate } from "./join-gate";
import { EmptySlot, Panel, PlayerLine, TeamCard } from "./team-card";
import { phaseOf, useLobbyView, type Run } from "./use-lobby-view";

type Slot = ViewMember["slot"];

function LobbyProgress({ phase }: { phase: ReturnType<typeof phaseOf> }) {
  if (phase === "closed") return null;

  const labels = ["Комната", "Готовность", "Вето", "Сервер", "Игра"] as const;
  const current =
    phase === "waiting" || phase === "draft"
      ? 0
      : phase === "ready_check"
        ? 1
        : phase === "veto"
          ? 2
          : phase === "server"
            ? 3
            : 4;

  return (
    <Steps
      direction="horizontal"
      steps={labels.map((title, index) => ({
        title,
        state: index < current ? "done" : index === current ? "current" : "todo",
      }))}
    />
  );
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
  const { view, setView, load, offset, beginMutation, endMutation } = useLobbyView(code, initial);
  const [busy, start] = useTransition();
  const [tab, setTab] = useState<"chat" | "settings">(() => (initial.me?.isHost || initial.me?.isAdmin ? "settings" : "chat"));
  const [advanced, setAdvanced] = useState(false);
  const [templates, setTemplates] = useState(initialTemplates);
  const settingsQueue = useRef<Promise<void>>(Promise.resolve());

  const run = useCallback<Run>(
    (fn, ok) => {
      // Fence poll ДО старта transition, чтобы уже летящий stale request
      // не успел перетереть optimistic UI.
      beginMutation();
      start(async () => {
        try {
          const r = await fn();
          if (r?.error) toast.error(r.error);
          else if (ok) toast.success(ok);
        } finally {
          await endMutation();
        }
      });
    },
    [beginMutation, endMutation, toast],
  );

  const { lobby, me, members, game } = view;
  const s = lobby.settings;
  const isHost = !!me?.isHost || !!me?.isAdmin;
  const isMember = !!me?.slot;
  const editable = isHost && lobby.status === "waiting";

  const patch = useCallback(
    (p: Partial<LobbySettings>) => {
      setView((v) => ({ ...v, lobby: { ...v.lobby, settings: { ...v.lobby.settings, ...p } } }));
      run(() => {
        const update = settingsQueue.current.then(() => A.updateSettings(code, p));
        settingsQueue.current = update.then(() => undefined, () => undefined);
        return update;
      });
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
  const meMember = members.find((m) => m.id === me?.id);
  const needsReady =
    phase === "ready_check" &&
    !!meMember &&
    (meMember.slot === "team1" || meMember.slot === "team2") &&
    !meMember.ready;

  const join = (slot?: Slot) => run(() => A.joinLobby(code, { slot, invite: invite ?? undefined }));
  const clickEmpty = (slot: Slot) => {
    if (!me) return router.push(`/login?next=${encodeURIComponent(`/lobby/${code}`)}`);
    if (!isMember) return join(slot);
    run(() => A.moveSelf(code, slot));
  };

  const copyInvite = inviteUrl
    ? () =>
        navigator.clipboard
          .writeText(inviteUrl)
          .then(() => toast.success(lobby.visibility === "public" ? "Ссылка скопирована" : "Ссылка скопирована — по ней можно войти без пароля"))
    : null;
  const showProgress = phase !== "waiting" && phase !== "draft" && phase !== "closed";

  return (
    <LobbyClock value={offset}>
      <div className="mx-auto w-full max-w-wide px-4 pb-16 pt-6 sm:px-6 lg:px-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <main className="min-w-0 space-y-5">
            {/* баннер карты: навигация, число игроков, выход */}
            <MapThumb map={headMap} image={view.mapImages[headMap]} className="rounded-surface border border-line-subtle">
              <div className="relative flex min-h-[148px] flex-col justify-between gap-6 p-3 sm:p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <Link href="/lobbies" className="inline-flex h-10 items-center gap-2 rounded-control bg-[#070b12b3] px-3 text-[14px] font-medium text-fg backdrop-blur-sm transition-colors hover:bg-[#070b12e6]">
                      {Icon.back("size-4")}
                      <span className="hidden sm:inline">К списку лобби</span>
                    </Link>
                    {copyInvite && (
                      <button type="button" onClick={copyInvite} title="Скопировать ссылку-приглашение" aria-label="Скопировать ссылку-приглашение" className="grid size-10 place-items-center rounded-control bg-[#070b12b3] text-fg backdrop-blur-sm transition-colors hover:bg-[#070b12e6]">
                        {Icon.link("size-[18px]")}
                      </button>
                    )}
                  </div>
                  <span className="num absolute left-1/2 top-0 hidden -translate-x-1/2 rounded-b-control bg-[#070b12cc] px-4 py-2 text-[13px] font-medium text-fg-2 backdrop-blur-sm sm:block">
                    Игроков <span className="text-fg">{playersNow}/{s.team_size * 2}</span>
                  </span>
                  {isMember ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          const r = await A.leaveLobby(code);
                          if (!r?.error) router.push("/lobbies");
                          return r;
                        })
                      }
                      className="inline-flex h-10 items-center gap-2 rounded-control border border-danger/40 bg-[#1a0b10cc] px-3 text-[14px] font-medium text-danger backdrop-blur-sm transition-colors hover:bg-danger/20 disabled:opacity-60"
                    >
                      Покинуть лобби {Icon.exit("size-4")}
                    </button>
                  ) : (
                    lobby.status !== "closed" && (
                      <Button size="sm" onClick={() => (me ? join() : clickEmpty("wait"))}>
                        Войти в лобби
                      </Button>
                    )
                  )}
                </div>
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h1 className="num text-[22px] font-semibold tracking-[-0.02em] text-fg sm:text-[26px]">Лобби #{lobby.code}</h1>
                      <Status info={lobbyStatus[phase]} size="sm" />
                    </div>
                    <p className="mt-1 truncate text-meta text-fg-2">
                      {mapLabel(headMap)} · {lobby.visibility === "public" ? "открытое" : lobby.visibility === "closed" ? "по паролю" : "приватное"}
                    </p>
                  </div>
                  <span className="num rounded-control bg-[#070b12b3] px-3 py-1.5 text-meta text-fg-2 backdrop-blur-sm sm:hidden">
                    {playersNow}/{s.team_size * 2}
                  </span>
                </div>
              </div>
            </MapThumb>

            {showProgress && (
              <div className="rounded-surface border border-line-subtle bg-shell px-4 py-3">
                <LobbyProgress phase={phase} />
              </div>
            )}

            <StageBanner view={view} isHost={isHost} busy={busy} run={run} code={code} />

            {/* составы по бокам, в центре — главное действие и сводка, как в комнате матча */}
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)_minmax(0,1fr)]">
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
              <div className="order-first lg:order-none lg:pt-1">
                <CenterColumn view={view} isHost={isHost} busy={busy} run={run} code={code} onInvite={lobby.invite_token ? copyInvite : null} />
              </div>
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

            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
              <Panel
                title="В ожидании"
                count={waiting.length}
                right={
                  draft ? (
                    <span className="text-meta text-accent">
                      выбирает {byId.get(draft.captains[draft.turn - 1])?.nickname ?? "капитан"} · <Countdown deadline={draft.deadline} /> с
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

      {needsReady && (
        <MobileStickyCta
          note={
            <>
              Проверка готовности · <Countdown deadline={lobby.ready_check_until} /> с
            </>
          }
        >
          <Button block size="lg" loading={busy} onClick={() => run(() => A.toggleReady(code))}>
            Я готов
          </Button>
        </MobileStickyCta>
      )}
    </LobbyClock>
  );
}

// ───────────────────────── тип лобби (в панели настроек)

function VisibilityRow({ view, run, code }: { view: LobbyView; run: Run; code: string }) {
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
