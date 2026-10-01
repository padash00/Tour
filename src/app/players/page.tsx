import type { Metadata } from "next";
import Link from "next/link";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-table";
import { DATA_TABLE, NUM_CELL, tableBox } from "@/components/public/data-table";
import { Avatar, FaceitLevel, cn } from "@/components/ui";
import { EmptyCard, PageHero, SearchField, Wrap } from "@/components/primitives";

export const metadata: Metadata = { title: "Игроки" };

const word = (n: number) => (n % 10 === 1 && n % 100 !== 11 ? "игрок" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "игрока" : "игроков");

export default async function PlayersPage(props: PageProps<"/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [all, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <>
      <PageHero eyebrow="Игроки F16 Arena" title="Игроки" lead={all.length ? `${all.length} ${word(all.length)} на платформе.` : undefined} />
      <Wrap className="pt-10">
        {all.length > 0 && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
            <SearchField defaultValue={q} placeholder="Ник или SteamID" />
            {q && (
              <span className="t-meta">
                Найдено: <span className="num text-fg-2">{players.length}</span>
              </span>
            )}
          </div>
        )}
        {players.length === 0 ? (
          <EmptyCard
            dashed={all.length === 0}
            title={all.length === 0 ? "Игроков пока нет" : "Ничего не найдено"}
            text={all.length === 0 ? "Войдите через Steam — и вы первый в списке." : "Попробуйте другой ник или SteamID."}
          />
        ) : (
          <div className={tableBox(true)}>
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
                    <tr key={p.id}>
                      <td>
                        <Link href={`/players/${p.steam_id}`} className="group flex items-center gap-4 text-fg">
                          <Avatar src={p.avatar_url} name={p.nickname} size={40} />
                          <span className="text-[16px] font-semibold transition-colors group-hover:text-accent">{p.nickname}</span>
                          {p.is_banned && <span className="text-[11px] uppercase tracking-[0.16em] text-danger">бан</span>}
                        </Link>
                      </td>
                      <td>
                        {p.team ? (
                          <Link href={`/teams/${p.team.tag}`} className="transition-colors hover:text-fg">
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
