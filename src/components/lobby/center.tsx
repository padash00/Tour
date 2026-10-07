"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { Button, CriticalSurface, buttonClass as btnClass, cn } from "@/components/ds";
import { Icon } from "./ui";
import { Countdown } from "./countdown";
import { GamePanel } from "./game-panel";
import { phaseOf, type Run } from "./use-lobby-view";

// ───────────────────────── центр: статус, вето, сервер

/** Крупная плашка этапа: проверка готовности, драфт, игра, закрыто. В обычном ожидании — ничего */
export function StageBanner({
  view,
  isHost,
  busy,
  run,
  code,
}: {
  view: LobbyView;
  isHost: boolean;
  busy: boolean;
  run: Run;
  code: string;
}) {
  const { lobby, game, me } = view;
  const active = game && ["veto", "waiting", "live"].includes(game.status) ? game : null;
  const inTeam = me?.slot === "team1" || me?.slot === "team2";
  const meReady = view.members.find((m) => m.id === me?.id)?.ready;
  const phase = phaseOf(view);
  const draftCaptain = lobby.draft ? view.members.find((m) => m.id === lobby.draft?.captains[lobby.draft.turn - 1]) : null;
  const myDraftTurn = !!lobby.draft && me?.id === lobby.draft.captains[lobby.draft.turn - 1];
  const readyMembers = view.members.filter((m) => m.slot === "team1" || m.slot === "team2");
  const readyCount = readyMembers.filter((m) => m.ready).length;

  let state: ReactNode;
  if (active) {
    state = <GamePanel view={view} isHost={isHost} busy={busy} run={run} code={code} />;
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
            <div className="num mt-1 text-[36px] font-semibold leading-none text-warn"><Countdown deadline={lobby.ready_check_until} /> с</div>
          </div>
        </div>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {inTeam && (
            <Button
              size="lg"
              loading={busy}
              variant={meReady ? "secondary" : "primary"}
              onClick={() => run(() => A.toggleReady(code))}
            >
              {meReady ? "Отменить готовность" : "Я готов"}
            </Button>
          )}
          {isHost && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => run(() => A.cancelReadyCheck(code))}>
              Отменить проверку
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3 text-meta text-fg-3">
            <span>Готовы {readyCount}/{readyMembers.length}</span>
            <span className="flex items-center gap-1.5" aria-label={`Готовы ${readyCount} из ${readyMembers.length}`}>
              {readyMembers.map((member) => (
                <span
                  key={member.id}
                  className={cn("size-2.5 rounded-full border border-line", member.ready ? "bg-ok" : "bg-surface-3")}
                  title={`${member.nickname}: ${member.ready ? "готов" : "ожидаем"}`}
                />
              ))}
            </span>
          </div>
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
            <div className="num mt-1 text-[36px] font-semibold leading-none"><Countdown deadline={lobby.draft.deadline} /> с</div>
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
    return null;
  }

  return <section aria-label="Текущее состояние лобби">{state}</section>;
}

// ───────────────────────── средняя колонка между командами

/** Между составами: главное действие, приглашение, коротко о матче и инструменты хоста */
export function CenterColumn({
  view,
  isHost,
  busy,
  run,
  code,
  onInvite,
}: {
  view: LobbyView;
  isHost: boolean;
  busy: boolean;
  run: Run;
  code: string;
  onInvite: (() => void) | null;
}) {
  const { lobby, game, me } = view;
  const settings = lobby.settings;
  const inTeam = me?.slot === "team1" || me?.slot === "team2";
  const meReady = view.members.find((m) => m.id === me?.id)?.ready;
  const waiting = lobby.status === "waiting";
  const last = waiting && game?.status === "finished" ? game : null;
  const canStart = isHost && waiting && !lobby.ready_check_until;

  const facts: { icon: ReactNode; label: string; value: ReactNode }[] = [
    {
      icon: Icon.map("size-[18px]"),
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
    { icon: Icon.swords("size-[18px]"), label: "Формат", value: `${MODES[settings.mode].label.replace(" на ", "×")} · BO${settings.best_of}` },
    { icon: Icon.signal("size-[18px]"), label: "Сеть", value: settings.network === "lan" ? "LAN · клуб" : "Интернет" },
    { icon: Icon.user("size-[18px]"), label: "Хост", value: lobby.host_name },
  ];

  let primary: ReactNode;
  if (canStart) {
    primary = (
      <Button size="lg" block disabled={busy || !!lobby.draft} onClick={() => run(() => A.startMatch(code))}>
        {last ? "Сыграть ещё раз" : "Начать матч"}
      </Button>
    );
  } else if (waiting && inTeam && settings.start === "all_ready" && !lobby.ready_check_until) {
    primary = (
      <Button size="lg" block variant={meReady ? "secondary" : "primary"} disabled={busy} onClick={() => run(() => A.toggleReady(code))}>
        {meReady ? "Не готов" : "Готов"}
      </Button>
    );
  } else {
    const label = !waiting
      ? lobby.status === "closed"
        ? "Лобби закрыто"
        : "Идёт игра"
      : lobby.ready_check_until
        ? "Проверка готовности"
        : lobby.draft
          ? "Идёт драфт"
          : "Ожидание игроков";
    primary = (
      <div className="grid h-12 place-items-center rounded-control border border-line bg-shell/60 text-[15px] font-medium text-fg-2">{label}</div>
    );
  }

  return (
    <section aria-label="О матче" className="flex flex-col gap-4">
      {primary}

      {isHost && settings.player_pick === "captains" && waiting && !lobby.draft && !lobby.ready_check_until && (
        <Button variant="secondary" block disabled={busy} onClick={() => run(() => A.beginDraft(code))}>
          Драфт капитанов
        </Button>
      )}

      {onInvite && (
        <button type="button" onClick={onInvite} className="mx-auto inline-flex items-center gap-2 text-[14px] font-medium text-accent transition-colors hover:text-fg">
          {Icon.users("size-4")} Пригласить игроков
        </button>
      )}

      <dl className="divide-y divide-line-subtle border-y border-line-subtle">
        {facts.map((f) => (
          <div key={f.label} className="flex items-center gap-3 py-3">
            <span className="text-fg-3">{f.icon}</span>
            <dt className="text-[14px] text-fg-2">{f.label}</dt>
            <dd className="ml-auto min-w-0 truncate text-right text-[14px] font-medium text-fg">{f.value}</dd>
          </div>
        ))}
      </dl>

      {waiting && isHost && !lobby.draft && (
        <div className="grid grid-cols-4 overflow-hidden rounded-control border border-line-subtle bg-shell/60">
          {(
            [
              ["balance", Icon.scale("size-[18px]"), "Баланс по ELO"],
              ["shuffle", Icon.shuffle("size-[18px]"), "Перемешать"],
              ["swap", Icon.swap("size-[18px]"), "Поменять команды"],
              ["clear", Icon.broom("size-[18px]"), "Очистить команды"],
            ] as const
          ).map(([tool, icon, title]) => (
            <button
              key={tool}
              type="button"
              title={title}
              aria-label={title}
              disabled={busy}
              onClick={() => run(() => A.teamTool(code, tool))}
              className="grid h-11 place-items-center border-l border-line-subtle text-fg-3 transition-colors first:border-l-0 hover:bg-white/[0.04] hover:text-fg disabled:opacity-50"
            >
              {icon}
            </button>
          ))}
        </div>
      )}

      {waiting && (
        <p className="text-center text-meta text-fg-3">
          {isHost
            ? settings.player_pick === "captains"
              ? "Назначьте капитанов и запустите драфт или расставьте игроков сами."
              : "Расставьте игроков, добавьте ботов и запускайте матч."
            : settings.start === "all_ready"
              ? "Займите место и нажмите «Готов» — матч стартует, когда готовы все."
              : "Займите место в команде — матч запускает хост."}
        </p>
      )}

      {last && (
        <Link href={`/lobbies/games/${last.id}`} className={btnClass("quiet", "sm", "self-center")}>
          Последний матч · {last.team1_score}:{last.team2_score} →
        </Link>
      )}
    </section>
  );
}
