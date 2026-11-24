"use client";

import { useState } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView } from "@/lib/lobby-view";
import { mapLabel } from "@/lib/maps";
import { MapThumb } from "./settings";
import { Button, CriticalSurface, FeatureSurface, cn } from "@/components/ds";
import { Countdown } from "./countdown";
import { CopyConnect } from "../copy-connect";
import type { Run } from "./use-lobby-view";
import { useT } from "@/lib/i18n/client";

/** Адрес сервера виден, кнопка копирует его — как на FACEIT */
function ConnectBox({ address, label }: { address: string; label?: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center gap-2">
      <CopyConnect address={address} label={label ? t("Скопировать {label}", { label }) : t("Скопировать IP")} />
      <code className="num select-all rounded-control border border-line bg-shell px-3 py-2.5 text-[14px] text-fg-2">connect {address}</code>
    </div>
  );
}

/** Хост: выбор карт заново — пока игре не назначен сервер. Галочка снимает ограничение времени на ход */
function RestartVeto({ code, busy, run, untimedNow }: { code: string; busy: boolean; run: Run; untimedNow: boolean }) {
  const t = useT();
  const [untimed, setUntimed] = useState(untimedNow);
  return (
    <>
      <Button variant="secondary" size="sm" disabled={busy} onClick={() => run(() => A.restartLobbyVeto(code, untimed))}>
        {t("Выбрать карты заново")}
      </Button>
      <label className="flex cursor-pointer items-center gap-2 text-meta text-fg-2">
        <input type="checkbox" className="size-4 accent-accent" checked={untimed} onChange={(e) => setUntimed(e.target.checked)} />
        {t("без ограничения времени")}
      </label>
    </>
  );
}

/** Метка стороны: CT — синяя, T — янтарная (цвета сторон из дизайн-системы) */
function SideTag({ side, className }: { side: "ct" | "t"; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-px text-[11px] font-bold uppercase leading-4 tracking-[0.06em]",
        side === "ct" ? "bg-side-ct/15 text-side-ct" : "bg-side-t/15 text-side-t",
        className,
      )}
    >
      {side === "ct" ? "CT" : "T"}
    </span>
  );
}

/** Стороны «по пикам»: под картами серии — кто за кого начинает; на решающей — ножевой */
function SeriesSides({ game }: { game: NonNullable<LobbyView["game"]> }) {
  const t = useT();
  if (!game.sides_by_pick || game.maps.length < 2) return null;
  return (
    <ol className="mt-5 grid gap-2 sm:grid-cols-3">
      {game.maps.map((m, i) => (
        <li key={m.map} className="rounded-control border border-line-subtle bg-shell px-3 py-2.5 text-left">
          <div className="flex items-center justify-between gap-2 text-micro text-fg-3">
            <span>{t("Карта {n}", { n: i + 1 })}</span>
            {m.status === "live" && <span className="font-semibold text-live">LIVE</span>}
          </div>
          <div className="mt-0.5 truncate text-[14px] font-medium text-fg">{mapLabel(m.map)}</div>
          {m.ct ? (
            <div className="mt-1.5 grid gap-1 text-meta text-fg-2">
              <span className="flex min-w-0 items-center gap-1.5"><SideTag side="ct" /><span className="truncate">{m.ct === 1 ? game.team1.name : game.team2.name}</span></span>
              <span className="flex min-w-0 items-center gap-1.5"><SideTag side="t" /><span className="truncate">{m.ct === 1 ? game.team2.name : game.team1.name}</span></span>
            </div>
          ) : (
            <div className="mt-1.5 text-meta text-fg-2">{t("Стороны — ножевой раунд")}</div>
          )}
        </li>
      ))}
    </ol>
  );
}

// ───────────────────────── игра: вето, сервер, LIVE

export function GamePanel({ view, isHost, busy, run, code }: { view: LobbyView; isHost: boolean; busy: boolean; run: Run; code: string }) {
  const t = useT();
  const game = view.game!;
  const me = view.me;

  if (game.status === "veto") {
    const team = game.veto_turn === 1 ? game.team1 : game.team2;
    const captainId = team.players[0]?.id ?? view.lobby.host_id;
    const myTurn = me?.id === captainId || (isHost && !team.players.length);
    const used = new Map(game.veto.map((v) => [v.map, v]));
    const choosing = game.veto_action === "side";
    const picker = game.veto_turn === 1 ? game.team2 : game.team1;
    /** кто начинает за CT на пикнутой карте: сторону выбирал соперник пикнувшего */
    const ctName = (v: { team: 1 | 2 | null; side?: "ct" | "t" }) =>
      v.team && v.side ? ((v.side === "ct") === (v.team === 1) ? game.team2.name : game.team1.name) : null;

    return (
      <CriticalSurface tone={myTurn ? "accent" : "warn"}>
        <div className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{myTurn ? t("Ваш ход") : t("Вето карт")}</div>
            <h2 className="mt-2 text-heading text-fg">
              {game.veto_turn
                ? `${team.name} · ${choosing ? t("выбор стороны") : game.veto_action === "ban" ? t("бан карты") : t("пик карты")}`
                : t("Вето завершается")}
            </h2>
            <p className="mt-2 text-[14px] text-fg-2">
              {choosing
                ? myTurn
                  ? t("{team} пикнули {map}. Выберите, за какую сторону вы начнёте эту карту.", { team: picker.name, map: mapLabel(game.side_map ?? "") })
                  : t("{team} пикнули {map} — сторону на этой карте выбирает соперник.", { team: picker.name, map: mapLabel(game.side_map ?? "") })
                : myTurn
                  ? t("Нажмите на доступную карту ниже.")
                  : t("Дождитесь выбора капитана. Комната обновится автоматически.")}
            </p>
          </div>
          {game.veto_deadline && (
            <div className="text-right">
              <div className="text-micro text-fg-3">{t("Осталось")}</div>
              <div className="num mt-1 text-[36px] font-semibold leading-none"><Countdown deadline={game.veto_deadline} /> {t("с")}</div>
            </div>
          )}
        </div>

        {choosing && game.side_map && (
          <div className="mt-5 grid items-stretch gap-3 sm:grid-cols-[minmax(0,220px)_1fr_1fr]">
            <MapThumb map={game.side_map} image={view.mapImages[game.side_map]} className="h-24 rounded-control border border-accent sm:h-full sm:min-h-28">
              <span className="absolute inset-x-3 bottom-2.5 grid gap-0.5">
                <span className="truncate text-[16px] font-semibold text-white">{mapLabel(game.side_map)}</span>
                <span className="truncate text-[12px] font-medium text-white/85">{t("пик")} · {picker.name}</span>
              </span>
            </MapThumb>
            {(["ct", "t"] as const).map((side) => (
              <button
                key={side}
                type="button"
                disabled={!myTurn || busy}
                onClick={() => run(() => A.lobbySide(code, side))}
                className={cn(
                  "group rounded-control border-2 px-4 py-4 text-left transition-colors disabled:cursor-default",
                  side === "ct" ? "border-side-ct/40 bg-side-ct/10" : "border-side-t/40 bg-side-t/10",
                  myTurn && !busy && (side === "ct" ? "hover:border-side-ct hover:bg-side-ct/20" : "hover:border-side-t hover:bg-side-t/20"),
                  !myTurn && "opacity-60",
                )}
              >
                <div className={cn("text-[28px] font-bold leading-none", side === "ct" ? "text-side-ct" : "text-side-t")}>{side === "ct" ? "CT" : "T"}</div>
                <div className="mt-2 text-[14px] font-medium text-fg">{side === "ct" ? t("Начать за защиту") : t("Начать за атаку")}</div>
                <div className="mt-0.5 text-meta text-fg-3">
                  {side === "ct" ? t("Спецназ: первая половина в обороне") : t("Террористы: первая половина в нападении")}
                </div>
              </button>
            ))}
            {game.veto_deadline && <p className="text-meta text-fg-3 sm:col-span-3">{t("Если время выйдет, сторона будет CT.")}</p>}
          </div>
        )}

        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {game.veto_pool.map((map) => {
            const action = used.get(map);
            const available = myTurn && !choosing && !action && !busy;
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
                  <span className="absolute inset-x-2 bottom-2 grid gap-0.5">
                    <span className="truncate text-[12px] font-medium text-white">{mapLabel(map)}</span>
                    {action && ctName(action) && (
                      <span className="flex min-w-0 items-center gap-1 text-[11px] font-medium text-white/90">
                        <span className="rounded-full bg-side-ct px-1.5 text-[10px] font-bold leading-4 text-white">CT</span>
                        <span className="truncate">{ctName(action)}</span>
                      </span>
                    )}
                  </span>
                  {game.map_edge?.[map] && !action && (game.map_edge[map].team1 || game.map_edge[map].team2) && (
                    <span
                      className="num absolute left-2 top-2 flex items-center gap-1 rounded-chip bg-black/55 px-1.5 py-0.5 text-[11px] font-semibold text-white/70"
                      title={t("Средний рейтинг команд на этой карте по играм Микса: {a} — {x}, {b} — {y}", { a: game.team1.name, x: game.map_edge[map].team1?.rating.toFixed(2) ?? "—", b: game.team2.name, y: game.map_edge[map].team2?.rating.toFixed(2) ?? "—" })}
                    >
                      <span className={cn((game.map_edge[map].team1?.rating ?? 0) > (game.map_edge[map].team2?.rating ?? 0) && "text-white")}>{game.map_edge[map].team1?.rating.toFixed(2) ?? "—"}</span>
                      <span className="text-white/50">:</span>
                      <span className={cn((game.map_edge[map].team2?.rating ?? 0) > (game.map_edge[map].team1?.rating ?? 0) && "text-white")}>{game.map_edge[map].team2?.rating.toFixed(2) ?? "—"}</span>
                    </span>
                  )}
                  {action && (
                    <span className={cn("absolute right-2 top-2 text-micro font-semibold uppercase", action.action === "ban" ? "text-danger" : "text-accent")}>
                      {action.action === "ban" ? t("бан") : action.action === "pick" ? t("пик") : "decider"}
                    </span>
                  )}
                </MapThumb>
              </button>
            );
          })}
        </div>

        {game.map_edge && (
          <p className="mt-3 text-meta text-fg-3">{t("Числа на картах — средний рейтинг команд на этой карте по играм Микса: слева {a}, справа {b}. Прочерк — на карте ещё никто из команды не играл.", { a: game.team1.name, b: game.team2.name })}</p>
        )}

        {isHost && (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <RestartVeto code={code} busy={busy} run={run} untimedNow={!game.veto_deadline} />
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              {t("Отменить игру")}
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
          {liveMap ? mapLabel(liveMap.map) : t("Матч")}{game.best_of > 1 ? ` · ${t("серия")} ${game.team1_score}:${game.team2_score}` : ""}
        </div>

        <div className="mt-5 flex flex-wrap justify-center gap-2">
          {game.server_address && <ConnectBox address={game.server_address} />}
          {game.gotv_address && <ConnectBox address={game.gotv_address} label="GOTV" />}
          {me?.isAdmin && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              {t("Остановить матч")}
            </Button>
          )}
        </div>
        <SeriesSides game={game} />
      </FeatureSurface>
    );
  }

  if (game.server_state === "ready") {
    return (
      <CriticalSurface tone="ok">
        <div className="text-micro font-semibold uppercase tracking-[0.14em] text-ok">{t("Сервер готов")}</div>
        <h2 className="mt-2 text-heading text-fg">{game.server_address ? t("Подключайтесь к матчу") : t("Игроки подключаются")}</h2>
        <p className="mt-2 max-w-read text-[14px] text-fg-2">
          {game.server_address
            ? t("Скопируйте адрес и вставьте в консоль CS2 (~). В разминке напишите .r — матч начнётся после готовности всех игроков.")
            : t("Адрес сервера доступен только игрокам матча и наблюдателям лобби.")}
        </p>
        <div className="mt-5 flex flex-col items-start gap-3">
          {game.server_address && <ConnectBox address={game.server_address} />}
          {game.gotv_address && <ConnectBox address={game.gotv_address} label="GOTV" />}
          {isHost && (
            <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
              {t("Отменить игру")}
            </Button>
          )}
        </div>
        <SeriesSides game={game} />
      </CriticalSurface>
    );
  }

  return (
    <FeatureSurface>
      <div className="text-micro font-semibold uppercase tracking-[0.14em] text-warn">{t("Сервер")}</div>
      <h2 className="mt-2 text-heading text-fg">{t("Готовим сервер")}</h2>
      <p className="mt-2 text-[14px] text-fg-2">{game.note ?? t("Назначаем инстанс, загружаем карту и составы. Адрес появится здесь автоматически.")}</p>
      <div className="mt-5 flex items-center gap-2 text-meta text-fg-3">
        <span className="size-2 animate-pulse rounded-full bg-warn" />
        {t("Ожидание агента")}
      </div>
      <SeriesSides game={game} />
      {isHost && (
        <div className="mt-5 flex flex-wrap items-center gap-3">
          {game.veto_pool.length > 0 && !game.server_state && <RestartVeto code={code} busy={busy} run={run} untimedNow={false} />}
          <Button variant="danger" size="sm" disabled={busy} onClick={() => run(() => A.cancelCurrentGame(code))}>
            {t("Отменить игру")}
          </Button>
        </div>
      )}
    </FeatureSurface>
  );
}
