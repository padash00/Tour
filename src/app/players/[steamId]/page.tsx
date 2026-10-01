import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getActiveMembership, getPlayerBySteamId } from "@/lib/data";
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
  const membership = await getActiveMembership(player.id);

  return <PlayerProfile player={player} team={membership?.team ?? null} />;
}
