"use client";

import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { mapLabel } from "@/lib/maps";
import { MapThumb } from "./settings";
import { Button, CriticalSurface, FeatureSurface, cn } from "@/components/ds";
import { Countdown } from "./countdown";
import { CopyConnect } from "../copy-connect";
import type { Run } from "./use-lobby-view";

/** Адрес сервера виден, кнопка копирует его — как на FACEIT */
function ConnectBox({ address, label }: { address: string; label?: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyConnect address={address} label={label ? `Скопировать ${label}` : "Скопировать IP"} />
      <code className="num select-all rounded-control border border-line bg-shell px-3 py-2.5 text-[14px] text-fg-2">connect {address}</code>
    </div>
  );
}

// ───────────────────────── игра: вето, сервер, LIVE

export function GamePanel({ view, isHost, busy, run, code }: { view: LobbyView; isHost: boolean; busy: boolean; run: Run; code: string }) {
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
              <div className="num mt-1 text-[36px] font-semibold leading-none"><Countdown deadline={game.veto_deadline} /> с</div>
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
          {game.server_address && <ConnectBox address={game.server_address} />}
          {game.gotv_address && <ConnectBox address={game.gotv_address} label="GOTV" />}
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
            ? "Скопируйте адрес и вставьте в консоль CS2 (~). В разминке напишите .r — матч начнётся после готовности всех игроков."
            : "Адрес сервера доступен только игрокам матча и наблюдателям лобби."}
        </p>
        <div className="mt-5 flex flex-col items-start gap-3">
          {game.server_address && <ConnectBox address={game.server_address} />}
          {game.gotv_address && <ConnectBox address={game.gotv_address} label="GOTV" />}
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
