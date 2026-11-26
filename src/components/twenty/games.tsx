import Link from "next/link";
import { Avatar, EmptyState, cn } from "@/components/ds";
import { formatDate, formatTime } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import { mapLabel } from "@/lib/maps";
import { MIX_GAMES_SHOWN, type MixGame, type MixTeam } from "@/lib/twenty";
import { SectionHead } from "./panels";
import type { Who } from "./tabs";

/* Вкладка «Игры»: сыгранные матчи по дням, внутри дня — по лобби: кто с кем играл, счёт серии и карт, убийства–смерти каждого за матч. */

function TeamColumn({ team, won, who, right }: { team: MixTeam; won: boolean; who: Who; right?: boolean }) {
  return (
    <div className={cn("min-w-0", right && "sm:text-right")}>
      <div className={cn("truncate text-[16px] font-bold", won ? "text-fg" : "text-fg-3")}>{team.name}</div>
      <ul className="mt-2 space-y-1.5">
        {team.players.map((p) => {
          const player = who(p.steam_id, p.name);
          return (
            <li key={p.steam_id} className={cn("flex items-center gap-2 text-[14px]", right && "sm:flex-row-reverse")}>
              <Link href={`/players/${p.steam_id}`} className={cn("flex min-w-0 items-center gap-2 text-fg hover:text-accent", right && "sm:flex-row-reverse")}>
                <Avatar src={player.avatar_url} name={player.nickname} size="xs" />
                <span className="truncate">{player.nickname}</span>
              </Link>
              <span className="num shrink-0 text-meta text-fg-3">
                {p.kills}–{p.deaths}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function GameCard({ g, who, t }: { g: MixGame; who: Who; t: T }) {
  return (
    <article className="overflow-hidden rounded-surface border border-line-subtle bg-surface">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-line-subtle px-4 py-2.5 text-meta text-fg-3">
        <span>{g.finished_at ? t("Закончилась в {time}", { time: formatTime(g.finished_at, t.lang) }) : "—"}</span>
        <Link href={`/lobbies/games/${g.id}`} className="font-medium text-fg-2 hover:text-accent">
          {t("Статистика матча")}
        </Link>
      </header>
      <div className="grid gap-4 p-4 sm:grid-cols-[1fr_auto_1fr] sm:gap-5">
        <TeamColumn team={g.teams[0]} won={g.winner === 1} who={who} />
        <div className="order-first text-center sm:order-none">
          <div className="num text-[28px] font-extrabold leading-none text-fg">
            <span className={cn(g.winner !== 1 && "text-fg-3")}>{g.score[0]}</span>
            <span className="px-1.5 text-fg-3">:</span>
            <span className={cn(g.winner !== 2 && "text-fg-3")}>{g.score[1]}</span>
          </div>
          <ul className="mt-2 space-y-0.5 text-meta text-fg-3">
            {g.maps.map((m, i) => (
              <li key={i} className="whitespace-nowrap">
                {mapLabel(m.map)} <span className="num text-fg-2">{m.team1_score}:{m.team2_score}</span>
              </li>
            ))}
          </ul>
        </div>
        <TeamColumn team={g.teams[1]} won={g.winner === 2} who={who} right />
      </div>
    </article>
  );
}

export function GamesTab({ games, total, who, t, evening }: { games: MixGame[]; total: number; who: Who; t: T; evening: boolean }) {
  if (!games.length) return <EmptyState title={t("Игр пока нет")} text={t("Здесь появятся сыгранные матчи: кто с кем играл и с каким счётом.")} />;
  // дни — от свежего к старому, внутри дня — лобби в порядке игр (игры уже отсортированы по времени окончания)
  const byDay = new Map<string, Map<string, MixGame[]>>();
  for (const g of games) {
    const lobbies = byDay.get(g.day) ?? byDay.set(g.day, new Map()).get(g.day)!;
    (lobbies.get(g.code ?? "") ?? lobbies.set(g.code ?? "", []).get(g.code ?? "")!).push(g);
  }
  const days = [...byDay].map(([day, lobbies]) => [day, [...lobbies]] as const);
  return (
    <section aria-label={t("Сыгранные игры")}>
      <SectionHead
        title={t("Сыгранные игры")}
        meta={`${t("По дням и лобби: кто с кем играл, счёт по картам и убийства–смерти каждого за матч.")} ${total > games.length ? t("Показаны последние {n} из {m}", { n: MIX_GAMES_SHOWN, m: total }) : t("Матчей: {n}", { n: total })}`}
      />
      <div className="space-y-8">
        {days.map(([day, lobbies]) => (
          <section key={day} aria-label={formatDate(day, t.lang)}>
            <h3 className="mb-3 flex items-baseline gap-3 text-[18px] font-bold text-fg">
              {formatDate(day, t.lang)}
              <span className="text-meta font-normal text-fg-3">{t("матчей: {n}", { n: lobbies.reduce((n, [, list]) => n + list.length, 0) })}</span>
            </h3>
            <div className="space-y-5">
              {lobbies.map(([code, list]) => (
                <div key={code || "single"}>
                  {!evening && (
                    <div className="mb-2 flex flex-wrap items-baseline gap-x-3 text-[14px]">
                      {code ? (
                        <>
                          <span className="font-semibold text-fg">
                            {t("Лобби")} <span className="num">#{code}</span>
                          </span>
                          <Link href={`/twenty?lobby=${code}`} className="text-meta text-fg-3 hover:text-accent">
                            {t("Рейтинг этого вечера")}
                          </Link>
                        </>
                      ) : (
                        <span className="font-semibold text-fg">{t("Отдельные игры на банк")}</span>
                      )}
                    </div>
                  )}
                  <div className="grid gap-3 xl:grid-cols-2">
                    {list.map((g) => (
                      <GameCard key={g.id} g={g} who={who} t={t} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
