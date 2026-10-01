import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveMembership, getPlayerBySteamId } from "@/lib/data";
import { aggregatePlayers, getPlayerMapHistory, getStatRows } from "@/lib/stats";
import { db } from "@/lib/supabase";
import { PlayerProfile } from "@/components/player-profile";

export async function generateMetadata(props: PageProps<"/players/[steamId]">): Promise<Metadata> {
  const { steamId } = await props.params;
  const p = await getPlayerBySteamId(steamId);
  return { title: p?.nickname ?? "Игрок" };
}

export default async function PlayerPage(props: PageProps<"/players/[steamId]">) {
  const { steamId } = await props.params;
  const player = await getPlayerBySteamId(steamId);
  if (!player) notFound();
  const [membership, rows, history, rosters] = await Promise.all([
    getActiveMembership(player.id),
    getStatRows({ playerId: player.id }),
    getPlayerMapHistory(player.id),
    db()
      .from("tournament_roster_players")
      .select("tournament_id, registration:tournament_registrations!inner(status), tournament:tournaments!inner(status)")
      .eq("player_id", player.id)
      .eq("registration.status", "approved")
      .neq("tournament.status", "draft"),
  ]);
  const agg = rows.length ? aggregatePlayers(rows)[0] : null;

  return (
    <PlayerProfile
      player={player}
      team={membership?.team ?? null}
      agg={agg}
      history={history}
      tournaments={new Set((rosters.data ?? []).map((r) => r.tournament_id)).size}
    />
  );
}
