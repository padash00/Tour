"use client";

import Link from "next/link";
import { useState } from "react";
import * as A from "@/app/actions/lobby";
import type { LobbyView, ViewCup, ViewMember } from "@/lib/lobby-view";
import { playersNeeded } from "@/lib/lobby-settings";
import { Button, Dialog, buttonClass as btnClass, cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { Icon } from "./ui";
import { PlayerLine } from "./team-card";
import type { Run } from "./use-lobby-view";

/*
 * Лобби на 20–40 игроков: команды (до восьми), назначение капитанов, сетка или круг матчей.
 * Каждый матч играется в своей комнате — отсюда в неё ведёт кнопка «Мой матч».
 */

/** Кнопка «Начать выбор игроков»: организатор назначает капитанов (по умолчанию — самые высокие по ELO) */
export function CaptainsButton({ view, busy, run, code, label, variant = "primary" }: { view: LobbyView; busy: boolean; run: Run; code: string; label: string; variant?: "primary" | "secondary" | "card" }) {
  const t = useT();
  const teams = view.teams.length;
  const need = playersNeeded(view.lobby.settings);
  const players = view.members.filter((m) => m.slot !== "spec").sort((a, b) => (b.faceit_elo ?? 0) - (a.faceit_elo ?? 0));
  const top = players.slice(0, teams).map((m) => m.id);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);

  const show = () => {
    setPicked(top);
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

/** Команды большого лобби: компактные карточки сеткой */
export function CupTeams({ view, isHost, busy, run, code }: { view: LobbyView; isHost: boolean; busy: boolean; run: Run; code: string }) {
  const t = useT();
  const size = view.lobby.settings.team_size;
  // организатор назначает капитанов и из пустой карточки команды — то же окно, что по главной кнопке
  const canAssign = isHost && view.lobby.status === "waiting" && !view.lobby.draft;
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {view.teams.map((team, i) => {
        const members = view.members.filter((m) => m.slot === team.slot);
        const rated = members.filter((m) => m.faceit_elo);
        const avg = rated.length ? Math.round(rated.reduce((s, m) => s + (m.faceit_elo ?? 0), 0) / rated.length) : null;
        const champion = view.cup?.state === "done" && view.cup.champion === i;
        return (
          <section key={team.slot} className={cn("overflow-hidden rounded-surface border bg-surface", champion ? "border-accent/60" : "border-line-subtle")}>
            <header className="flex items-center gap-2 border-b border-line-subtle px-3 py-2.5">
              <span className="num grid size-7 shrink-0 place-items-center rounded-control bg-ink/[0.06] text-[13px] font-semibold text-fg-2">{i + 1}</span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold text-fg">{team.name}</div>
                <div className="num text-micro text-fg-3">
                  {members.length}/{size}
                  {avg ? ` · ${t("средний ELO {n}", { n: avg })}` : ""}
                </div>
              </div>
              {champion && <span className="text-accent" title={t("Победитель")}>{Icon.crown("size-5")}</span>}
            </header>
            <div className="space-y-1.5 p-2">
              {members.map((m: ViewMember) => (
                <PlayerLine key={m.id} m={m} view={view} isHost={isHost} run={run} code={code} captain={view.captains[i] === m.id} />
              ))}
              {members.length === 0 &&
                (canAssign ? (
                  <CaptainsButton view={view} busy={busy} run={run} code={code} label={t("Назначить капитана")} variant="card" />
                ) : (
                  <div className="px-2 py-4 text-center text-meta text-fg-4">{t("Капитан ещё не назначен")}</div>
                ))}
            </div>
          </section>
        );
      })}
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
        <h2 className="text-title text-fg">{cup.format === "round" ? t("Круговая") : t("Сетка")}</h2>
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
              <th className="py-1.5 font-semibold">{t("Команда")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Матчи")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Победы")}</th>
              <th className="py-1.5 text-right font-semibold">{t("Карты")}</th>
            </tr>
          </thead>
          <tbody>
            {cup.table.map((row) => (
              <tr key={row.team} className="border-t border-line-subtle">
                <td className="py-2 font-medium text-fg">{cup.names[row.team]}</td>
                <td className="num py-2 text-right text-fg-2">{row.played}</td>
                <td className="num py-2 text-right font-semibold text-fg">{row.wins}</td>
                <td className="num py-2 text-right text-fg-2">
                  {row.maps}:{row.mapsLost}
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
