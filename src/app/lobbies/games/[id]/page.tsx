import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { getGame } from "@/lib/lobby";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { formatDateTime } from "@/lib/format";
import { getMapImages } from "@/lib/settings";
import { MapThumb } from "@/components/lobby/settings";
import { DATA_TABLE } from "@/components/public/data-table";
import { Button, Container, PageTitle, Panel, Score, Section, cn } from "@/components/ds";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata(props: PageProps<"/lobbies/games/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const game = UUID.test(id) ? await getGame(id) : null;
  return { title: game ? `${game.team1.name} ${game.team1_score}:${game.team2_score} ${game.team2.name}` : "Матч лобби" };
}

type Stat = {
  map_number: number;
  steam_id: string;
  team: number;
  name: string | null;
  kills: number;
  deaths: number;
  assists: number;
  damage: number;
  headshot_kills: number;
  rounds_played: number;
  kast: number;
  mvp: number;
};

export default async function LobbyGamePage(props: PageProps<"/lobbies/games/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const game = await getGame(id);
  if (!game) notFound();

  const [{ data: lobby }, { data: rows }, images] = await Promise.all([
    db().from("lobbies").select("code").eq("id", game.lobby_id).maybeSingle(),
    db().from("lobby_player_stats").select("*").eq("game_id", game.id),
    getMapImages(),
  ]);
  const stats = (rows ?? []) as Stat[];

  const total = new Map<string, Stat>();
  for (const row of stats) {
    const current = total.get(row.steam_id);
    if (!current) total.set(row.steam_id, { ...row });
    else {
      for (const key of ["kills", "deaths", "assists", "damage", "headshot_kills", "rounds_played", "kast", "mvp"] as const) current[key] += row[key];
    }
  }

  const table = (team: 1 | 2) => [...total.values()].filter((row) => row.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const steamOf = new Map([...game.team1.players, ...game.team2.players].map((player) => [player.steam_id, player.nickname]));
  const winner = game.winner;

  return (
    <>
      <div className="border-b border-line-subtle bg-shell">
        <Container width="wide" className="py-8 sm:py-10">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div>
              <div className="text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">
                Неофициальный матч · {MODES[game.settings.mode].label} · BO{game.best_of}
              </div>
              <PageTitle className="mt-2">Матч лобби</PageTitle>
              <p className="mt-2 text-meta text-fg-3">
                {game.finished_at ? `Сыгран ${formatDateTime(game.finished_at)}. В статистику турниров не идёт.` : game.status === "cancelled" ? "Матч отменён." : "Матч ещё идёт."}
              </p>
            </div>
            {lobby?.code && (
              <Button href={`/lobby/${lobby.code}`} variant="secondary">
                В лобби #{lobby.code}
              </Button>
            )}
          </div>

          <div className="mt-8 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-4 sm:gap-8">
            <div className={cn("truncate text-right text-title font-semibold", winner === 1 ? "text-fg" : "text-fg-2")}>{game.team1.name}</div>
            <Score a={game.team1_score} b={game.team2_score} winner={winner === 1 ? 1 : winner === 2 ? 2 : null} size="lg" />
            <div className={cn("truncate text-title font-semibold", winner === 2 ? "text-fg" : "text-fg-2")}>{game.team2.name}</div>
          </div>
        </Container>
      </div>

      <Container width="wide" className="space-y-10 py-10 sm:py-12">
        <Section title="Карты">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {game.maps.map((map, i) => (
              <MapThumb key={i} map={map.map} image={images[map.map]} className="h-24 rounded-surface border border-line-subtle">
                <span className="absolute bottom-2 left-3 text-[14px] font-semibold">{mapLabel(map.map)}</span>
                <span className="num absolute right-3 top-2 text-[18px] font-semibold">{map.team1_score}:{map.team2_score}</span>
              </MapThumb>
            ))}
          </div>
        </Section>

        {([1, 2] as const).map((team) => {
          const list = table(team);
          const squad = team === 1 ? game.team1 : game.team2;
          return (
            <Section key={team} title={squad.name} description={squad.bots.length > 0 ? `+ ${squad.bots.length} бот(а)` : undefined}>
              <Panel padded={false} className="overflow-hidden">
                <div className="overflow-x-auto">
                  <table className={cn(DATA_TABLE, "min-w-[720px]")}>
                    <thead>
                      <tr>
                        <th>Игрок</th>
                        {["K", "D", "A", "±", "ADR", "HS%", "KAST", "MVP"].map((heading) => (
                          <th key={heading} className="!text-right">{heading}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {list.length === 0 && (
                        <tr>
                          <td colSpan={9} className="px-4 py-6 text-center text-fg-3">Статистики нет</td>
                        </tr>
                      )}
                      {list.map((row) => {
                        const rounds = Math.max(1, row.rounds_played);
                        const diff = row.kills - row.deaths;
                        return (
                          <tr key={row.steam_id}>
                            <td>
                              <Link href={`/players/${row.steam_id}`} className="font-medium text-fg hover:text-accent">
                                {steamOf.get(row.steam_id) ?? row.name}
                              </Link>
                            </td>
                            <td className="num text-right">{row.kills}</td>
                            <td className="num text-right">{row.deaths}</td>
                            <td className="num text-right">{row.assists}</td>
                            <td className={cn("num text-right", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "text-fg-3")}>{diff > 0 ? `+${diff}` : diff}</td>
                            <td className="num text-right">{Math.round(row.damage / rounds)}</td>
                            <td className="num text-right">{row.kills ? Math.round((100 * row.headshot_kills) / row.kills) : 0}%</td>
                            <td className="num text-right">{row.kast ? `${Math.round((100 * row.kast) / rounds)}%` : "—"}</td>
                            <td className="num text-right">{row.mvp}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            </Section>
          );
        })}
      </Container>
    </>
  );
}
