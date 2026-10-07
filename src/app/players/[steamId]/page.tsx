import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveMembership, getPlayerBySteamId } from "@/lib/data";
import { aggregatePlayers, getHeadToHead, getPlayerMapHistory, getPlayerWeapons, getStatRows } from "@/lib/stats";
import { db } from "@/lib/supabase";
import { getPlayerAwards } from "@/lib/awards";
import { getPlayerProgress } from "@/lib/progress";
import { PlayerProfile } from "@/components/player-profile";
import { ComparePicker, type PickPlayer } from "@/components/compare-picker";
import { PlayerLobbyGames } from "@/components/lobby/player-lobby-games";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/players/[steamId]">): Promise<Metadata> {
  const { steamId } = await props.params;
  const p = await getPlayerBySteamId(steamId);
  return { title: p?.nickname ?? "Игрок" };
}

export default async function PlayerPage(props: PageProps<"/players/[steamId]">) {
  const { steamId } = await props.params;
  const player = await getPlayerBySteamId(steamId);
  if (!player) notFound();
  const [membership, rows, history, rosters, awards, progress] = await Promise.all([
    getActiveMembership(player.id),
    getStatRows({ playerId: player.id }),
    getPlayerMapHistory(player.id),
    db()
      .from("tournament_roster_players")
      .select("tournament_id, registration:tournament_registrations!tournament_roster_players_registration_id_fkey!inner(status), tournament:tournaments!inner(status)")
      .eq("player_id", player.id)
      .eq("registration.status", "approved")
      .neq("tournament.status", "draft"),
    getPlayerAwards(player.id),
    getPlayerProgress(player.id),
  ]);
  const agg = rows.length ? aggregatePlayers(rows)[0] : null;
  const matchIds = [...new Set(rows.map((r) => r.match_id))];
  const [weapons, h2h, pickRes] = await Promise.all([
    getPlayerWeapons(player.steam_id, matchIds),
    getHeadToHead({ teamIds: rows.map((r) => r.team_id).filter(Boolean) as string[], matchIds }),
    // для «Сравнить»: список игроков для поиска по нику
    db().from("players").select("steam_id, nickname, avatar_url").eq("is_banned", false).order("nickname").limit(600),
  ]);

  return (
    <>
      <PlayerProfile
        player={player}
        team={membership?.team ?? null}
        agg={agg}
        history={history}
        tournaments={new Set((rosters.data ?? []).map((r) => r.tournament_id)).size}
        awards={awards}
        progress={progress}
        weapons={weapons}
        h2h={h2h}
        actions={<ComparePicker self={player.steam_id} players={(pickRes.data ?? []) as PickPlayer[]} label="Сравнить с игроком" />}
      />
      <PlayerLobbyGames playerId={player.id} />
    </>
  );
}
