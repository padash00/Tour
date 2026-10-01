import type { Metadata } from "next";
import Link from "next/link";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-table";
import { Avatar, FaceitLevel, cn } from "@/components/ui";
import { CARD, PageHero, SearchField, Wrap } from "@/components/primitives";

export const metadata: Metadata = { title: "Игроки" };

export default async function PlayersPage(props: PageProps<"/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [all, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <>
      <PageHero eyebrow="Игроки F16 Arena" title="Игроки" lead={all.length ? `${all.length} на платформе.` : undefined} />
      <Wrap className="pt-12">
        {all.length > 0 && (
          <div className="mb-8">
            <SearchField defaultValue={q} placeholder="Ник или SteamID" />
          </div>
        )}
        {players.length === 0 ? (
          <div className={cn(CARD, "px-8 py-12")}>
            <div className="text-[20px] font-semibold text-fg">{all.length === 0 ? "Игроков пока нет" : "Ничего не найдено"}</div>
            <p className="mt-2 text-fg-3">{all.length === 0 ? "Войдите через Steam — и вы первый в списке." : "Попробуйте другой запрос."}</p>
          </div>
        ) : (
          <div className={cn(CARD, "overflow-x-auto")}>
            <table className="tbl min-w-[720px] [&_th]:px-6 [&_td]:px-6 [&_th]:uppercase [&_th]:tracking-[0.18em] [&_th]:text-[11px] [&_td]:h-[64px]">
              <thead>
                <tr>
                  <th>Игрок</th>
                  <th>Команда</th>
                  <th className="text-center">FACEIT</th>
                  <th className="text-right">ELO</th>
                  <th className="text-right">F16 Rating</th>
                  <th className="text-right">Матчи</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const s = statsById.get(p.id);
                  return (
                    <tr key={p.id}>
                      <td>
                        <Link href={`/players/${p.steam_id}`} className="flex items-center gap-4 text-fg hover:text-accent">
                          <Avatar src={p.avatar_url} name={p.nickname} size={40} />
                          <span className="text-[16px] font-semibold">{p.nickname}</span>
                        </Link>
                      </td>
                      <td>
                        {p.team ? (
                          <Link href={`/teams/${p.team.tag}`} className="hover:text-fg">
                            {p.team.name}
                          </Link>
                        ) : (
                          <span className="text-fg-3">—</span>
                        )}
                      </td>
                      <td className="text-center">
                        <FaceitLevel level={p.faceit_level} />
                      </td>
                      <td className="text-right num">{p.faceit_elo ?? "—"}</td>
                      <td className={cn("text-right num text-[16px] font-semibold", s ? ratingColor(s.rating) : "text-fg-3 font-normal")}>
                        {s ? s.rating.toFixed(2) : "—"}
                      </td>
                      <td className="text-right num text-fg-2">{s?.matches ?? 0}</td>
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
