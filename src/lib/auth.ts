import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { db } from "./supabase";
import { env } from "./env";
import { readSession } from "./session";
import type { Player } from "./types";

export const getCurrentPlayer = cache(async (): Promise<Player | null> => {
  const session = await readSession();
  if (!session) return null;
  const { data } = await db().from("players").select("*").eq("id", session.playerId).maybeSingle();
  return (data as Player | null) ?? null;
});

export function isAdmin(player: Player | null): boolean {
  if (!player || player.is_banned) return false;
  return player.is_admin || env.adminSteamIds.includes(player.steam_id);
}

export async function requirePlayer(next = "/me"): Promise<Player> {
  const player = await getCurrentPlayer();
  if (!player) redirect(`/login?next=${encodeURIComponent(next)}`);
  return player;
}

export async function requireAdmin(next = "/admin"): Promise<Player> {
  const player = await requirePlayer(next.startsWith("/admin") ? next : "/admin");
  if (!isAdmin(player)) redirect("/");
  return player;
}
