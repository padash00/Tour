import { NextResponse, type NextRequest } from "next/server";
import { fetchSteamProfile, verifySteamCallback } from "@/lib/steam";
import { fetchFaceitBySteamId } from "@/lib/faceit";
import { createSession } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { db } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const steamId = await verifySteamCallback(new URL(url.toString()));
  if (!steamId) {
    return NextResponse.redirect(new URL("/login?error=steam", url.origin));
  }

  const [profile, faceit] = await Promise.all([fetchSteamProfile(steamId), fetchFaceitBySteamId(steamId)]);
  const now = new Date().toISOString();

  const { data: player, error } = await db()
    .from("players")
    .upsert(
      {
        steam_id: steamId,
        nickname: profile.nickname,
        avatar_url: profile.avatarUrl,
        profile_url: profile.profileUrl,
        country: profile.country,
        last_login_at: now,
        ...(faceit && {
          faceit_id: faceit.id,
          faceit_nickname: faceit.nickname,
          faceit_level: faceit.level,
          faceit_elo: faceit.elo,
          faceit_updated_at: now,
        }),
      },
      { onConflict: "steam_id" },
    )
    .select("id, steam_id")
    .single();

  if (error || !player) {
    console.error("steam login upsert failed", error);
    return NextResponse.redirect(new URL("/login?error=db", url.origin));
  }

  await createSession({ playerId: player.id, steamId: player.steam_id });
  const next = safeNext(url.searchParams.get("next"));
  return NextResponse.redirect(new URL(next, url.origin));
}
