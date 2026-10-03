import Link from "next/link";
import { db } from "@/lib/supabase";
import { mapLabel } from "@/lib/maps";
import { formatDate } from "@/lib/format";
import { Container, RowList, Section, cn } from "@/components/ds";

type Row = {
  game_id: string;
  team: number;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  rounds_played: number;
  game: { id: string; status: string; team1: { name: string }; team2: { name: string }; team1_score: number; team2_score: number; winner: number | null; maps: { map: string }[]; finished_at: string | null } | null;
};

/** Неофициальные матчи игрока в лобби: отдельно от турнирной статистики */
export async function PlayerLobbyGames({ playerId }: { playerId: string }) {
  const { data } = await db()
    .from("lobby_player_stats")
    .select("game_id, team, kills, deaths, assists, damage, rounds_played, game:lobby_games(id, status, team1, team2, team1_score, team2_score, winner, maps, finished_at)")
    .eq("player_id", playerId)
    .order("updated_at", { ascending: false })
    .limit(80);
  // сумма по картам каждой игры
  const games = new Map<string, Row>();
  for (const r of (data ?? []) as unknown as Row[]) {
    if (r.game?.status !== "finished") continue;
    const g = games.get(r.game_id);
    if (!g) games.set(r.game_id, { ...r });
    else {
      g.kills += r.kills;
      g.deaths += r.deaths;
      g.assists += r.assists;
      g.damage += r.damage;
      g.rounds_played += r.rounds_played;
    }
  }
  const list = [...games.values()].slice(0, 10);
  if (!list.length) return null;
  const wins = list.filter((r) => r.game?.winner === r.team).length;
  return (
    <Container width="wide" className="pb-14">
      <Section
        title={`Матчи в лобби · ${wins}/${list.length} побед`}
        description="Неофициальные игры — в статистику турниров не входят."
      >
        <RowList>
          {list.map((r) => {
            const g = r.game!;
            const won = g.winner === r.team;
            const my = r.team === 1 ? g.team1 : g.team2;
            const their = r.team === 1 ? g.team2 : g.team1;
            return (
              <Link key={r.game_id} href={`/lobbies/games/${g.id}`} className="flex min-h-14 items-center gap-4 px-4 py-3 text-[14px] transition-colors hover:bg-surface-2">
                <span className={cn("w-1 self-stretch rounded-full", won ? "bg-ok" : g.winner ? "bg-danger" : "bg-fg-4")} />
                <span className="min-w-0 flex-1 truncate">
                  {my.name} <span className="text-fg-3">vs</span> {their.name}
                </span>
                <span className="hidden text-meta text-fg-3 sm:inline">{g.maps.map((m) => mapLabel(m.map)).join(", ")}</span>
                <span className="num w-14 text-right font-semibold">
                  {r.team === 1 ? g.team1_score : g.team2_score}:{r.team === 1 ? g.team2_score : g.team1_score}
                </span>
                <span className="num w-20 text-right text-fg-2">{r.kills}-{r.deaths}-{r.assists}</span>
                <span className="num hidden w-16 text-right text-fg-3 md:inline">{Math.round(r.damage / Math.max(1, r.rounds_played))} ADR</span>
                <span className="hidden w-24 text-right text-meta text-fg-3 lg:inline">{formatDate(g.finished_at)}</span>
              </Link>
            );
          })}
        </RowList>
      </Section>
    </Container>
  );
}
