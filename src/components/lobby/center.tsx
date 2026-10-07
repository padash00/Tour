"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { Button, CriticalSurface, Facts, FeatureSurface, buttonClass as btnClass, cn } from "@/components/ds";
import { Icon } from "./ui";
import { Countdown } from "./countdown";
import { GamePanel } from "./game-panel";
import { phaseOf, type Run } from "./use-lobby-view";

// ───────────────────────── центр: статус, вето, сервер

export function Center({
  view,
  isHost,
  busy,
  run,
  code,
  hostName,
  onInvite,
}: {
  view: LobbyView;
  isHost: boolean;
  busy: boolean;
  run: Run;
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
  const readyMembers = view.members.filter((m) => m.slot === "team1" || m.slot === "team2");
  const readyCount = readyMembers.filter((m) => m.ready).length;

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
