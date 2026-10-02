import type { Metadata } from "next";
import Link from "next/link";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-format";
import { DATA_TABLE, NUM_CELL, tableBox } from "@/components/public/data-table";
import { Avatar, FaceitLevel, cn } from "@/components/ui";
import { EmptyCard, PageHero, Wrap } from "@/components/primitives";
import { ClientFilter } from "@/components/public/client-filter";

export const metadata: Metadata = { title: "Игроки" };

// поиск — в браузере (ClientFilter): страница одинакова для всех и отдаётся из кэша CDN
export const revalidate = 30;

const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "игрок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "игрока" : "игроков");

export default async function PlayersPage() {
  const [all, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const players = all;
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <>
      <PageHero eyebrow="Игроки F16 Arena" title="Игроки" lead={all.length ? `${all.length} ${word(all.length)} на платформе.` : undefined} />
      <Wrap className="pt-10">
        {all.length > 0 && (
          <ClientFilter scope="players" placeholder="Ник или SteamID" className="mb-6" />
        )}
        {players.length === 0 ? (
          <EmptyCard
            dashed={all.length === 0}
            title={all.length === 0 ? "Игроков пока нет" : "Ничего не найдено"}
            text={all.length === 0 ? "Войдите через Steam — и вы первый в списке." : "Попробуйте другой ник или SteamID."}
          />
        ) : (
          <div className={tableBox(true)} data-filter-scope="players">
            <p data-filter-empty hidden className="px-6 py-10 text-[15px] text-fg-3">
              Ничего не найдено — попробуйте другой ник или SteamID.
            </p>
            <table className={cn(DATA_TABLE, "min-w-[760px]")}>
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Команда</th>
                  <th className="!text-center">FACEIT</th>
                  <th className="!text-right">ELO</th>
                  <th className="!text-right">F16 Rating</th>
                  <th className="!text-right">Матчи</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const s = statsById.get(p.id);
                  return (
                    <tr key={p.id} data-filter={`${p.nickname} ${p.steam_id}`.toLowerCase()}>
                      <td>
                        <Link href={`/players/${p.steam_id}`} className="group flex min-h-11 items-center gap-4 text-fg">
                          <Avatar src={p.avatar_url} name={p.nickname} size={40} />
                          <span className="text-[16px] font-semibold transition-colors group-hover:text-accent">{p.nickname}</span>
                          {p.is_banned && <span className="text-[11px] uppercase tracking-[0.16em] text-danger">бан</span>}
                        </Link>
                      </td>
                      <td>
                        {p.team ? (
                          <Link href={`/teams/${p.team.tag}`} className="inline-flex min-h-11 items-center transition-colors hover:text-fg lg:min-h-0">
                            {p.team.name}
                          </Link>
                        ) : (
                          <span className="text-fg-3">Без команды</span>
                        )}
                      </td>
                      <td className="text-center">
                        <FaceitLevel level={p.faceit_level} />
                      </td>
                      <td className={NUM_CELL}>{p.faceit_elo ?? "—"}</td>
                      <td className={cn(NUM_CELL, "text-[16px] font-semibold", s ? ratingColor(s.rating) : "font-normal text-fg-3")}>
                        {s ? s.rating.toFixed(2) : "—"}
                      </td>
                      <td className={NUM_CELL}>{s?.matches ?? 0}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Wrap>
    </>
  );
}
