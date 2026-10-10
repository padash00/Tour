import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-format";
import { DATA_TABLE, NUM_CELL, tableBox } from "@/components/public/data-table";
import { Avatar, Container, EmptyState, FaceitLevel, PageTitle, cn } from "@/components/ds";
import { ClientFilter } from "@/components/public/client-filter";

export const metadata: Metadata = {
  title: "Игроки",
  description: "Игроки CS2 на F16 Arena: ники, уровни FACEIT, F16 Rating и статистика матчей турниров в Усть-Каменогорске.",
  alternates: { canonical: "/players" },
};
export const revalidate = 30;

const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "игрок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "игрока" : "игроков");

export default async function PlayersPage() {
  const [players, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <Container width="wide" className="pb-16 pt-8 sm:pt-10">
      <header>
        <PageTitle>Игроки</PageTitle>
        <p className="mt-1 text-meta text-fg-3">{players.length ? `${players.length} ${word(players.length)} на платформе F16 Arena.` : "Игроки появятся после первого входа через Steam."}</p>
      </header>

      {players.length > 0 && <ClientFilter scope="players" placeholder="Ник или SteamID" className="mt-8 mb-5 max-w-xl" />}

      {players.length === 0 ? (
        <EmptyState className="mt-8" icon={<Users />} title="Игроков пока нет" text="После первого входа через Steam игрок появится в списке." />
      ) : (
        <div className={tableBox(true, "mt-6")} data-filter-scope="players">
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
              {players.map((player) => {
                const stats = statsById.get(player.id);
                return (
                  <tr key={player.id} data-filter={`${player.nickname} ${player.steam_id}`.toLowerCase()}>
                    <td>
                      <Link href={`/players/${player.steam_id}`} className="group flex min-h-11 items-center gap-3 text-fg">
                        <Avatar src={player.avatar_url} name={player.nickname} size="md" />
                        <span className="text-[15px] font-semibold transition-colors group-hover:text-accent">{player.nickname}</span>
                        {player.is_banned && <span className="text-micro font-semibold uppercase tracking-[0.12em] text-danger">бан</span>}
                      </Link>
                    </td>
                    <td>
                      {player.team ? (
                        <Link href={`/teams/${player.team.tag}`} className="transition-colors hover:text-fg">
                          {player.team.name}
                        </Link>
                      ) : (
                        <span className="text-fg-3">Без команды</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <FaceitLevel level={player.faceit_level} />
                      </span>
                    </td>
                    <td className={NUM_CELL}>{player.faceit_elo ?? "—"}</td>
                    <td className={cn(NUM_CELL, "text-[16px] font-semibold", stats ? ratingColor(stats.rating) : "font-normal text-fg-3")}>
                      {stats ? stats.rating.toFixed(2) : "—"}
                    </td>
                    <td className={NUM_CELL}>{stats?.matches ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
