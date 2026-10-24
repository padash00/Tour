import Link from "next/link";
import { Activity, Award, Crosshair, Crown, Flame, HeartHandshake, Shield, Target, Zap } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Nomination } from "@/lib/nominations";
import type { NominationKey } from "@/lib/nominations-core";
import type { LeaderboardRow } from "@/lib/stats";
import { Avatar, CARD_SECTION, SectionTitle, TeamLogo, cn } from "@/components/ds";

/*
 * Награды турнира по регламенту (lib/nominations-core): MVP, снайпер, рифлер, опорник — по статистике,
 * капитан — решение судей. Пока турнир идёт — «лидер сейчас», после финала — победитель.
 */

const ICON: Record<NominationKey, LucideIcon> = {
  mvp: Crown,
  sniper: Target,
  rifler: Crosshair,
  support: HeartHandshake,
  entry: Zap,
  clutch: Shield,
  stable: Activity,
  multikill: Flame,
  captain: Award,
};

/** Как выбирается — коротко, простыми словами (полное правило — в регламенте и админке) */
const HOW: Record<NominationKey, string> = {
  mvp: "Больше всех помог команде выигрывать раунды",
  sniper: "Больше всего убийств из AWP и SSG 08",
  rifler: "Лучший рейтинг среди игроков без снайперки",
  support: "Ассисты, ослепления и урон гранатами",
  entry: "Чаще всех делает первое убийство в раунде",
  clutch: "Больше всего выиграл раундов последним живым",
  stable: "Полезен почти в каждом раунде (KAST)",
  multikill: "Больше всего эйсов и раундов с 4 убийствами",
  captain: "Выбирают судьи после финала",
};

export function TournamentAwards({ nominations, rows, finished }: { nominations: Nomination[]; rows: LeaderboardRow[]; finished: boolean }) {
  if (!nominations.length) return null;
  const byPlayer = new Map(rows.filter((r) => r.player_id).map((r) => [r.player_id!, r]));
  return (
    <section className={CARD_SECTION}>
      <SectionTitle
        description={
          finished
            ? "Победители номинаций. Решение судей главнее статистики."
            : "Кто ведёт в каждой номинации сейчас. Итог — после финала; учитываются игроки, сыгравшие не меньше половины карт команды."
        }
      >
        Награды турнира
      </SectionTitle>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {nominations.map((n) => {
          const Icon = ICON[n.key];
          const w = n.winner;
          const row = w?.playerId ? byPlayer.get(w.playerId) : undefined;
          const nick = row?.player?.nickname ?? w?.name ?? null;
          return (
            <div key={n.key} className={cn("flex min-w-0 flex-col gap-3 rounded-surface bg-surface p-4 shadow-[inset_0_0_0_1px_var(--color-line-subtle)]", n.key === "mvp" && w && "shadow-[inset_0_0_0_2px_var(--color-accent)]")}>
              <div className="flex items-center gap-2.5">
                <span className={cn("grid size-9 shrink-0 place-items-center rounded-control", w ? "bg-accent-dim text-accent" : "bg-ink/[0.05] text-fg-3")}>
                  <Icon className="size-5" />
                </span>
                <div className="min-w-0">
                  <div className="text-[15.5px] font-bold leading-tight text-fg">{n.title}</div>
                  <div className="text-[12.5px] leading-snug text-fg-3">{HOW[n.key]}</div>
                </div>
              </div>
              {w && nick ? (
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar src={row?.player?.avatar_url} name={nick} size="md" />
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-bold text-fg">
                      {row?.player ? (
                        <Link href={`/players/${row.player.steam_id}`} className="hover:text-accent">
                          {nick}
                        </Link>
                      ) : (
                        nick
                      )}
                    </div>
                    <div className="flex min-w-0 items-center gap-1.5 text-[13px] text-fg-3">
                      {w.team && <TeamLogo src={w.team.logo_url} tag={w.team.tag} size="xs" />}
                      <span className="truncate">{w.team?.name}</span>
                    </div>
                    {w.value && <div className="mt-0.5 text-[13px] font-semibold text-fg-2">{w.value}</div>}
                  </div>
                  <span className={cn("ml-auto shrink-0 rounded-full px-2 py-0.5 text-[11.5px] font-bold", w.source === "judges" ? "bg-accent-dim text-accent" : "bg-ink/[0.06] text-fg-2")}>
                    {w.source === "judges" ? "Судьи" : finished ? "Итог" : "Сейчас"}
                  </span>
                </div>
              ) : (
                <div className="text-[14px] text-fg-3">{n.auto ? "Пока никто не отличился" : "Решение ещё не принято"}</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
