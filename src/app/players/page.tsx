import type { Metadata } from "next";
import Link from "next/link";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-table";
import { Avatar, Container, EmptyState, FaceitLevel, PageHeader, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Игроки" };

export default async function PlayersPage(props: PageProps<"/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const [all, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <Container>
      <PageHeader title="Игроки" />
      {all.length > 0 && (
        <form className="mb-4 sm:w-80">
          <input name="q" defaultValue={q} placeholder="Ник или SteamID" className="field" />
        </form>
      )}
      {players.length === 0 ? (
        <EmptyState title={all.length === 0 ? "Игроков пока нет" : "Ничего не найдено"} />
      ) : (
        <div className="overflow-x-auto">
          <table className="tbl min-w-[640px]">
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
                      <Link href={`/players/${p.steam_id}`} className="flex items-center gap-3 text-fg hover:text-accent">
                        <Avatar src={p.avatar_url} name={p.nickname} size={32} />
                        <span className="font-medium">{p.nickname}</span>
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
                    <td className={cn("text-right num font-semibold", s ? ratingColor(s.rating) : "text-fg-3 font-normal")}>
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
    </Container>
  );
}
