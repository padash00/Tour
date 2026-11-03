"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { useT } from "@/lib/i18n/client";
import { tr } from "@/lib/i18n/core";
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
  const t = useT();
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
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-warn">{t("Проверка готовности")}</div>
            <h2 className="mt-2 text-heading text-fg">{t("Матч готов к старту")}</h2>
            <p className="mt-2 max-w-read text-[14px] text-fg-2">
              {t("Команды собраны. Все игроки должны подтвердить готовность до окончания таймера.")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-micro text-fg-3">{t("Осталось")}</div>
            <div className="num mt-1 text-[36px] font-semibold leading-none text-warn"><Countdown deadline={lobby.ready_check_until} /> {t("с")}</div>
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
              {meReady ? t("Отменить готовность") : t("Я готов")}
            </Button>
          )}
          {isHost && (
            <Button variant="ghost" size="lg" disabled={busy} onClick={() => run(() => A.cancelReadyCheck(code))}>
              {t("Отменить проверку")}
            </Button>
          )}
          <div className="ml-auto flex items-center gap-3 text-meta text-fg-3">
            <span>{t("Готовы {n}/{total}", { n: readyCount, total: readyMembers.length })}</span>
            <span className="flex items-center gap-1.5" aria-label={t("Готовы {n} из {total}", { n: readyCount, total: readyMembers.length })}>
              {readyMembers.map((member) => (
                <span
                  key={member.id}
                  className={cn("size-2.5 rounded-full border border-line", member.ready ? "bg-ok" : "bg-surface-3")}
                  title={`${member.nickname}: ${member.ready ? t("готов") : t("ожидаем")}`}
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
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{myDraftTurn ? t("Ваш ход") : t("Драфт капитанов")}</div>
            <h2 className="mt-2 text-heading text-fg">
              {myDraftTurn ? t("Выберите следующего игрока") : t("Выбирает {name}", { name: draftCaptain?.nickname ?? t("капитан") })}
            </h2>
            <p className="mt-2 max-w-read text-[14px] text-fg-2">
              {t("Игроки из блока «В ожидании» распределяются капитанами по командам.")}
            </p>
          </div>
          <div className="text-right">
            <div className="text-micro text-fg-3">{t("На выбор")}</div>
            <div className="num mt-1 text-[36px] font-semibold leading-none"><Countdown deadline={lobby.draft.deadline} /> {t("с")}</div>
          </div>
        </div>
      </CriticalSurface>
    );
  } else if (phase === "closed") {
    state = (
      <CriticalSurface tone="danger">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-danger">{t("Лобби закрыто")}</div>
        <h2 className="mt-2 text-heading text-fg">{t("Новые игры здесь больше не запускаются")}</h2>
      </CriticalSurface>
    );
  } else {
    return null;
  }

  return <section aria-label={t("Текущее состояние лобби")}>{state}</section>;
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
  const t = useT();
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
      label: t("Карта"),
      value:
        settings.maps.length === 1
          ? mapLabel(settings.maps[0])
          : settings.map_choice === "veto"
            ? t("Вето из {n}", { n: settings.maps.length })
            : settings.map_choice === "random"
              ? t("Случайно из {n}", { n: settings.maps.length })
              : t("{n} карт", { n: settings.maps.length }),
    },
    { icon: Icon.swords("size-[18px]"), label: t("Формат"), value: `${MODES[settings.mode].label.replace(" на ", "×")} · BO${settings.best_of}` },
    { icon: Icon.signal("size-[18px]"), label: t("Сеть"), value: settings.network === "lan" ? t("LAN · клуб") : t("Интернет") },
    { icon: Icon.user("size-[18px]"), label: t("Хост"), value: lobby.host_name },
  ];

  let primary: ReactNode;
  if (canStart) {
    primary = (
      <Button size="lg" block disabled={busy || !!lobby.draft} onClick={() => run(() => A.startMatch(code))}>
        {last ? t("Сыграть ещё раз") : t("Начать матч")}
      </Button>
    );
  } else if (waiting && inTeam && settings.start === "all_ready" && !lobby.ready_check_until) {
    primary = (
      <Button size="lg" block variant={meReady ? "secondary" : "primary"} disabled={busy} onClick={() => run(() => A.toggleReady(code))}>
        {meReady ? t("Не готов") : t("Готов")}
      </Button>
    );
  } else {
    const label = !waiting
      ? lobby.status === "closed"
        ? t("Лобби закрыто")
        : t("Идёт игра")
      : lobby.ready_check_until
        ? t("Проверка готовности")
        : lobby.draft
          ? t("Идёт драфт")
          : t("Ожидание игроков");
    primary = (
      <div className="grid h-12 place-items-center rounded-control border border-line bg-shell/60 text-[15px] font-medium text-fg-2">{label}</div>
    );
  }

  return (
    <section aria-label={t("О матче")} className="flex flex-col gap-4">
      {primary}

      {isHost && settings.player_pick === "captains" && waiting && !lobby.draft && !lobby.ready_check_until && (
        <Button variant="secondary" block disabled={busy} onClick={() => run(() => A.beginDraft(code))}>
          {t("Драфт капитанов")}
        </Button>
      )}

      {onInvite && (
        <button type="button" onClick={onInvite} className="mx-auto inline-flex items-center gap-2 text-[14px] font-medium text-accent transition-colors hover:text-fg">
          {Icon.users("size-4")} {t("Пригласить игроков")}
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
              ["balance", Icon.scale("size-[18px]"), tr("Баланс по ELO")],
              ["shuffle", Icon.shuffle("size-[18px]"), tr("Перемешать")],
              ["swap", Icon.swap("size-[18px]"), tr("Поменять команды")],
              ["clear", Icon.broom("size-[18px]"), tr("Очистить команды")],
            ] as const
          ).map(([tool, icon, title]) => (
            <button
              key={tool}
              type="button"
              title={t(title)}
              aria-label={t(title)}
              disabled={busy}
              onClick={() => run(() => A.teamTool(code, tool))}
              className="grid h-11 place-items-center border-l border-line-subtle text-fg-3 transition-colors first:border-l-0 hover:bg-ink/[0.04] hover:text-fg disabled:opacity-50"
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
              ? t("Назначьте капитанов и запустите драфт или расставьте игроков сами.")
              : t("Расставьте игроков, добавьте ботов и запускайте матч.")
            : settings.start === "all_ready"
              ? t("Займите место и нажмите «Готов» — матч стартует, когда готовы все.")
              : t("Займите место в команде — матч запускает хост.")}
        </p>
      )}

      {last && (
        <Link href={`/lobbies/games/${last.id}`} className={btnClass("quiet", "sm", "self-center")}>
          {t("Последний матч")} · {last.team1_score}:{last.team2_score} →
        </Link>
      )}
    </section>
  );
}
