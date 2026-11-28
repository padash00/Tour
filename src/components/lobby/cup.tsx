"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewCup, ViewMember } from "@/lib/lobby-view";
import { playersNeeded } from "@/lib/lobby-settings";
import { mapLabel } from "@/lib/maps";
import { Button, Dialog, buttonClass as btnClass, cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./ui";
import { EmptySlot, PlayerLine } from "./team-card";
import { Countdown } from "./countdown";
import type { Run } from "./use-lobby-view";

/*
 * Лобби на 20–40 игроков: команды (до восьми), назначение капитанов, сетка или круг матчей.
 * Каждый матч играется в своей комнате — отсюда в неё ведёт кнопка «Мой матч».
 */

/** Кнопка «Начать выбор игроков»: капитанов назначает организатор (самых высоких по ELO можно отметить одной кнопкой) */
export function CaptainsButton({ view, busy, run, code, label, variant = "primary" }: { view: LobbyView; busy: boolean; run: Run; code: string; label: string; variant?: "primary" | "secondary" | "card" }) {
  const t = useT();
  const teams = view.teams.length;
  const need = playersNeeded(view.lobby.settings);
  const players = view.members.filter((m) => m.slot !== "spec").sort((a, b) => (b.faceit_elo ?? 0) - (a.faceit_elo ?? 0));
  const top = players.slice(0, teams).map((m) => m.id);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  // капитанов назначает организатор сам: окно открывается пустым, ELO — только кнопка-подсказка
  const show = () => {
    setPicked([]);
    setOpen(true);
  };
  const toggle = (id: string) => setPicked((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : cur.length < teams ? [...cur, id] : cur));
  const byElo = picked.length === teams && top.every((id) => picked.includes(id));

  return (
    <>
      {variant === "card" ? (
        <button type="button" disabled={busy} onClick={show} className="w-full rounded-control border border-dashed border-line px-2 py-4 text-center text-meta font-medium text-accent transition-colors hover:border-accent/50 hover:bg-accent-dim/40">
          {label}
        </button>
      ) : (
        <Button size={variant === "primary" ? "lg" : "md"} variant={variant} block disabled={busy} onClick={show}>
          {label}
        </Button>
      )}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title={t("Капитаны")}
        description={t("Отметьте капитанов: {n}. Каждый получает свою команду и по очереди разбирает игроков змейкой, первым выбирает капитан с меньшим ELO.", { n: teams })}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setPicked(top)} disabled={byElo} className="mr-auto">
              {t("Самые высокие по ELO")}
            </Button>
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("Отмена")}
            </Button>
            <Button
              disabled={busy || picked.length !== teams || players.length !== need}
              onClick={() => {
                setOpen(false);
                run(() => A.beginDraft(code, picked));
              }}
            >
              {t("Начать выбор игроков")}
            </Button>
          </>
        }
      >
        {players.length !== need && (
          <p className="mb-3 rounded-control border border-warn/40 bg-warn/10 px-3 py-2 text-meta text-fg-2">
            {players.length < need
              ? t("Нужно {need} игроков — сейчас {n}", { need, n: players.length })
              : t("В игре {need} мест, а игроков {n} — лишних переведите в наблюдатели", { need, n: players.length })}
          </p>
        )}
        <div className="mb-2 text-meta text-fg-3">{t("Выбрано {n} из {need}", { n: picked.length, need: teams })}</div>
        <div className="grid max-h-[360px] gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
          {players.map((m) => {
            const on = picked.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(m.id)}
                className={cn(
                  "flex items-center justify-between gap-3 rounded-control border px-3 py-2 text-left transition-[border-color,background-color]",
                  on ? "border-accent/50 bg-accent-dim" : "border-line-subtle bg-surface hover:border-line-strong",
                )}
              >
                <span className="min-w-0 truncate text-[14px] font-medium text-fg">
                  {on && <span className="mr-1.5 text-accent">★</span>}
                  {m.nickname}
                </span>
                <span className="num shrink-0 text-meta text-fg-3">{m.faceit_elo ? `${m.faceit_elo} ELO` : t("без FACEIT")}</span>
              </button>
            );
          })}
        </div>
      </Dialog>
    </>
  );
}

/** Цвет номера команды — чтобы команды различались с одного взгляда (после восьмой повторяются) */
const TEAM_TONE = ["bg-warn/15 text-warn", "bg-steel/15 text-steel", "bg-ok/15 text-ok", "bg-danger/15 text-danger"];

/** Карточка одной команды большого лобби. slots — показывать свободные места (на доске выбора игроков) */
function TeamBox({ view, index, isHost, busy, run, code, slots }: { view: LobbyView; index: number; isHost: boolean; busy: boolean; run: Run; code: string; slots?: boolean }) {
  const t = useT();
  const team = view.teams[index];
  const size = view.lobby.settings.team_size;
  const draft = view.lobby.draft;
  // организатор назначает капитанов и из пустой карточки команды — то же окно, что по главной кнопке
  const canAssign = isHost && view.lobby.status === "waiting" && !draft;
  const captain = view.captains[index];
  const members = view.members.filter((m) => m.slot === team.slot).sort((x, y) => Number(y.id === captain) - Number(x.id === captain));
  const rated = members.filter((m) => m.faceit_elo);
  const avg = rated.length ? Math.round(rated.reduce((sum, m) => sum + (m.faceit_elo ?? 0), 0) / rated.length) : null;
  // средний рейтинг команды в «Миксе» — по тем, кто там играл: видно, равны ли составы
  const mixed = members.filter((m) => m.mix);
  const mixAvg = mixed.length ? (mixed.reduce((sum, m) => sum + (m.mix?.rating ?? 0), 0) / mixed.length).toFixed(2) : null;
  const champion = view.cup?.state === "done" && view.cup.champion === index;
  const picking = !!draft && draft.turn - 1 === index;
  // на доске выбора у команды всегда видны все места: первое — капитан, остальные ждут выбора
  const free = slots ? Math.max(0, size - Math.max(members.length, 1)) : 0;
  return (
    // без overflow-hidden: меню игрока (три точки) выходит за край карточки
    <section className={cn("rounded-surface border bg-surface transition-[border-color,box-shadow]", picking ? "border-accent/70 shadow-[0_0_0_1px_var(--color-accent)]" : champion ? "border-accent/60" : "border-line-subtle")}>
      <header className="flex items-center gap-2.5 border-b border-line-subtle px-3 py-2.5">
        <span className={cn("num grid size-7 shrink-0 place-items-center rounded-control text-[13px] font-semibold", picking ? "bg-accent text-accent-ink" : TEAM_TONE[index % TEAM_TONE.length])}>{index + 1}</span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold text-fg">{team.name}</div>
          <div className="num text-micro text-fg-3">
            {members.length}/{size}
            {avg ? ` · ${t("средний ELO {n}", { n: avg })}` : ""}
            {mixAvg && <span title={t("Средний рейтинг состава в Миксе — по {n} игрокам, которые там играли", { n: mixed.length })}> · {t("Микс {n}", { n: mixAvg })}</span>}
          </div>
        </div>
        {picking && <span className="shrink-0 rounded-chip bg-accent-dim px-2 py-0.5 text-micro font-semibold text-accent">{t("выбирает")}</span>}
        {champion && <span className="text-accent" title={t("Победитель")}>{Icon.crown("size-5")}</span>}
      </header>
      <div className="space-y-1.5 p-2">
        {members.map((m: ViewMember) => (
          <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code} captain={captain === m.id} />
        ))}
        {members.length === 0 &&
          (canAssign ? (
            <CaptainsButton view={view} busy={busy} run={run} code={code} label={t("Назначить капитана")} variant="card" />
          ) : (
            <div className="px-2 py-4 text-center text-meta text-fg-4">{t("Капитан ещё не назначен")}</div>
          ))}
        {Array.from({ length: free }, (_, i) => (
          <div key={i} className="h-11 rounded-control border border-dashed border-line" aria-hidden />
        ))}
      </div>
    </section>
  );
}

/** Команды большого лобби сеткой — когда идут матчи и выбирать уже некого */
export function CupTeams({ view, isHost, busy, run, code }: { view: LobbyView; isHost: boolean; busy: boolean; run: Run; code: string }) {
  return (
    <div className="grid items-start gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {view.teams.map((team, i) => (
        <TeamBox key={team.slot} view={view} index={i} isHost={isHost} busy={busy} run={run} code={code} />
      ))}
    </div>
  );
}

/**
 * Доска выбора игроков: команды столбцами слева и справа, посередине — главное действие (или чей сейчас ход)
 * и свободные игроки. Капитан выбирает, не прокручивая страницу до блока «В ожидании».
 */
export function CupBoard({ view, isHost, busy, run, code, actions, below, onJoin, onInvite }: { view: LobbyView; isHost: boolean; busy: boolean; run: Run; code: string; actions: ReactNode; below?: ReactNode; onJoin: () => void; onInvite: (() => void) | null }) {
  const t = useT();
  const { lobby, me } = view;
  const draft = lobby.draft;
  const half = Math.ceil(view.teams.length / 2);
  const pool = view.members.filter((m) => m.slot === "wait").sort((x, y) => (y.faceit_elo ?? 0) - (x.faceit_elo ?? 0));
  const picker = draft ? view.members.find((m) => m.id === draft.captains[draft.turn - 1]) : null;
  const myTurn = !!draft && me?.id === draft.captains[draft.turn - 1];
  const need = playersNeeded(lobby.settings);
  const gathered = view.members.filter((m) => m.slot !== "spec").length;
  const column = (from: number, to: number) => (
    <div className="min-w-0 space-y-3">
      {view.teams.slice(from, to).map((team, i) => (
        <TeamBox key={team.slot} view={view} index={from + i} isHost={isHost} busy={busy} run={run} code={code} slots />
      ))}
    </div>
  );
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)_minmax(0,1fr)]">
      {column(0, half)}
      {/* середина: свободные игроки, под ними — сведения о матче (место под списком иначе пустует) */}
      <div className="order-first min-w-0 space-y-4 lg:order-none">
      <section aria-label={t("Свободные игроки")} className={cn("@container min-w-0 rounded-surface border bg-surface", myTurn ? "border-accent/70" : "border-line-subtle")}>
        <div className="border-b border-line-subtle p-4">
          {draft ? (
            <div className="flex items-end justify-between gap-4">
              <div className="min-w-0">
                <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{myTurn ? t("Ваш ход") : t("Выбор игроков змейкой")}</div>
                <h2 className="mt-1.5 truncate text-heading text-fg">{myTurn ? t("Выберите следующего игрока") : t("Выбирает {name}", { name: picker?.nickname ?? t("капитан") })}</h2>
                <div className="mt-1 truncate text-meta text-fg-3">{view.teams[draft.turn - 1]?.name}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="text-micro text-fg-3">{t("На выбор")}</div>
                {lobby.settings.pick_seconds ? (
                  <div className="num mt-1 text-[32px] font-semibold leading-none">
                    <Countdown deadline={draft.deadline} /> {t("с")}
                  </div>
                ) : (
                  <div className="mt-1 text-[16px] font-semibold leading-none">{t("без ограничения")}</div>
                )}
              </div>
            </div>
          ) : (
            <>
              {actions}
              <div className="mt-4 flex items-center gap-3">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
                  <div className={cn("h-full rounded-full transition-[width]", gathered >= need ? "bg-ok" : "bg-accent")} style={{ width: `${Math.min(100, (gathered / need) * 100)}%` }} />
                </div>
                <span className="num shrink-0 text-meta text-fg-2">{t("Игроков")} {gathered}/{need}</span>
                {onInvite && (
                  <button type="button" onClick={onInvite} className="inline-flex shrink-0 items-center gap-1.5 text-meta font-medium text-accent transition-colors hover:text-fg">
                    {Icon.users("size-4")} {t("Пригласить")}
                  </button>
                )}
              </div>
            </>
          )}
        </div>
        <div className="flex items-center gap-3 px-4 pt-4">
          <h2 className="text-title text-fg">{t("Свободные игроки")}</h2>
          <span className="num rounded-chip bg-ink/[0.06] px-2 py-0.5 text-micro text-fg-2">{pool.length}</span>
          {lobby.settings.filter && <span className="ml-auto text-meta text-fg-3">{t("Фильтр игроков включён")}</span>}
        </div>
        <div className="grid gap-1.5 p-4 pt-3 @[560px]:grid-cols-2">
          {pool.map((m) => (
            <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code} slim>
              {myTurn && (
                <Button size="sm" disabled={busy} onClick={() => run(() => A.pickInDraft(code, m.id))}>
                  {t("Выбрать")}
                </Button>
              )}
            </PlayerLine>
          ))}
          {pool.length === 0 && <p className="py-3 text-center text-meta text-fg-3 @[560px]:col-span-2">{draft ? t("Все игроки разобраны по командам") : t("Свободных игроков нет")}</p>}
          {!draft && <EmptySlot onClick={onJoin} />}
        </div>
      </section>
      {below}
      </div>
      {column(half, view.teams.length)}
    </div>
  );
}

const stateLabel = { pending: "ждёт соперников", playing: "идёт", done: "сыгран", cancelled: "отменён" } as const;

/** Сетка или круг матчей: по кругам слева направо; свой матч подсвечен */
export function CupBracket({ cup, isHost, busy, run, code }: { cup: ViewCup; isHost: boolean; busy: boolean; run: Run; code: string }) {
  const t = useT();
  const name = (i: number | null) => (i === null ? t("победитель предыдущего матча") : cup.names[i]);
  return (
    <section aria-label={t("Матчи")} className="rounded-surface border border-line-subtle bg-surface p-4 sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-title text-fg">{cup.format === "round" ? t("Круговая") : t("Сетка")}</h2>
          <Link href={`/twenty?lobby=${code}`} className={btnClass("quiet", "sm")}>
            {t("Рейтинг игроков")}
          </Link>
        </div>
        {cup.state === "done" && cup.champion !== null && (
          <span className="rounded-control bg-accent-dim px-3 py-1.5 text-[14px] font-semibold text-accent">{t("Победитель — {name}", { name: cup.names[cup.champion] })}</span>
        )}
      </div>
      <div className="grid gap-4" style={{ gridTemplateColumns: `repeat(${cup.rounds.length}, minmax(200px, 1fr))`, overflowX: "auto" }}>
        {cup.rounds.map((r) => (
          <div key={r.round} className="min-w-0">
            <div className="mb-2 text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t(r.title)}</div>
            <div className="space-y-2">
              {r.matches.map((m) => (
                <div key={m.id} className={cn("rounded-control border p-3", m.mine ? "border-accent/50 bg-accent-dim/40" : "border-line-subtle bg-shell/60")}>
                  {([["a", m.a, 0], ["b", m.b, 1]] as const).map(([key, team, side]) => (
                    <div key={key} className="flex items-center justify-between gap-2 py-0.5">
                      <span className={cn("min-w-0 truncate text-[14px]", team === null ? "text-fg-4" : m.winner === team ? "font-semibold text-fg" : m.state === "done" ? "text-fg-3" : "text-fg")}>{name(team)}</span>
                      <span className="num shrink-0 text-[14px] font-semibold text-fg">{m.score ? m.score[side] : ""}</span>
                    </div>
                  ))}
                  {/* счёт по картам: сыгранные и идущая (её счёт по раундам обновляется по ходу) */}
                  {m.maps.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 border-t border-line-subtle pt-1.5 text-micro text-fg-3">
                      {m.maps.map((x, i) => (
                        <span key={i} className={cn("num whitespace-nowrap", x.live && "font-semibold text-live")}>
                          {x.live && <span className="mr-1 inline-block size-1.5 rounded-full bg-live align-middle animate-pulse" />}
                          {mapLabel(x.map)} {x.a}:{x.b}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className={cn("text-micro", m.state === "playing" ? "text-live" : m.state === "cancelled" ? "text-danger" : "text-fg-3")}>{t(stateLabel[m.state])}</span>
                    {m.code ? (
                      <Link href={`/lobby/${m.code}`} className={btnClass(m.mine ? "primary" : "quiet", "sm")}>
                        {m.mine ? t("Мой матч") : t("Открыть")}
                      </Link>
                    ) : (
                      isHost &&
                      m.state === "cancelled" &&
                      cup.state === "playing" && (
                        <Button size="sm" variant="secondary" disabled={busy} onClick={() => run(() => A.restartCupMatchAction(code, m.id))}>
                          {t("Запустить заново")}
                        </Button>
                      )
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      {cup.table && (
        <table className="mt-5 w-full text-[14px]">
          <thead>
            <tr className="text-left text-micro uppercase tracking-[0.1em] text-fg-3">
              <th className="w-8 py-1.5 font-semibold">#</th>
              <th className="py-1.5 font-semibold">{t("Команда")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Матчи")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Очки")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Раунды")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Разница")}</th>
            </tr>
          </thead>
          <tbody>
            {cup.table.map((row, i) => (
              <tr key={row.team} className="border-t border-line-subtle">
                <td className={cn("num py-2 font-semibold", i < 3 ? "text-accent" : "text-fg-3")}>{i + 1}</td>
                <td className="py-2 font-medium text-fg">{cup.names[row.team]}</td>
                <td className="num py-2 text-right text-fg-2">{row.played}</td>
                <td className="num py-2 text-right font-semibold text-fg">{row.points}</td>
                <td className="num py-2 text-right text-fg-2">
                  {row.rounds}:{row.roundsLost}
                </td>
                <td className="num py-2 text-right text-fg-2">
                  {row.rounds - row.roundsLost > 0 ? "+" : ""}
                  {row.rounds - row.roundsLost}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

/** Комната матча большого лобби: откуда она и как вернуться к сетке */
export function CupRoomBanner({ parent }: { parent: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-accent/30 bg-accent-dim/40 px-4 py-3">
      <span className="text-[14px] text-fg">{t("Это комната матча лобби #{code}. После игры она закроется, итог попадёт в сетку.", { code: parent })}</span>
      <Link href={`/lobby/${parent}`} className={btnClass("secondary", "sm")}>
        {t("К сетке")}
      </Link>
    </div>
  );
}

/** В большом лобби идут матчи, и у зрителя сейчас свой матч */
export function MyMatchBanner({ room }: { room: string }) {
  const t = useT();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-live/40 bg-live/10 px-4 py-3">
      <span className="text-[15px] font-semibold text-fg">{t("Ваш матч начался — бан-пик и адрес сервера в комнате матча.")}</span>
      <Link href={`/lobby/${room}`} className={btnClass("primary", "md")}>
        {t("Мой матч")}
      </Link>
    </div>
  );
}
