import { NextResponse, type NextRequest } from "next/server";
import { fetchSteamProfile, verifySteamCallback } from "@/lib/steam";
import { fetchFaceitBySteamId } from "@/lib/faceit";
import { createSession } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { db } from "@/lib/supabase";
import { markLoginRefreshed } from "@/lib/profile-sync";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const steamId = await verifySteamCallback(new URL(url.toString()));
  if (!steamId) {
    return NextResponse.redirect(new URL("/login?error=steam", url.origin));
  }

  const [profile, faceit] = await Promise.all([fetchSteamProfile(steamId), fetchFaceitBySteamId(steamId)]);
  const now = new Date().toISOString();

  const faceitFields = faceit && {
    faceit_id: faceit.id,
    faceit_nickname: faceit.nickname,
    faceit_level: faceit.level,
    faceit_elo: faceit.elo,
    faceit_updated_at: now,
  };
  const steamFields = {
    nickname: profile.nickname,
    avatar_url: profile.avatarUrl,
    profile_url: profile.profileUrl,
    country: profile.country,
  };

  const { data: existing } = await db().from("players").select("id").eq("steam_id", steamId).maybeSingle();
  // если Steam не ответил — не затираем сохранённые ник и аватар
  const { data: player, error } = existing
    ? await db()
        .from("players")
        .update({ last_login_at: now, ...(profile.ok && steamFields), ...faceitFields })
        .eq("id", existing.id)
        .select("id, steam_id")
        .single()
    : await db()
        .from("players")
        .insert({ steam_id: steamId, last_login_at: now, ...steamFields, ...faceitFields })
        .select("id, steam_id")
        .single();

  if (error || !player) {
    console.error("steam login upsert failed", error);
    return NextResponse.redirect(new URL("/login?error=db", url.origin));
  }

  if (profile.ok) await markLoginRefreshed(player.id);
  await createSession({ playerId: player.id, steamId: player.steam_id });
  const next = safeNext(url.searchParams.get("next"));
  if (await firstProfilePrompt(player.id)) {
    return NextResponse.redirect(new URL(`/me/profile?welcome=1&next=${encodeURIComponent(next)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

/**
 * Мягкое знакомство с анкетой: после входа один раз отправляем на анкету (prompted_at),
 * дальше — только напоминание в шапке. Ошибка базы вход не ломает.
 */
async function firstProfilePrompt(playerId: string): Promise<boolean> {
  try {
    const { data, error } = await db()
      .from("player_profiles")
      .upsert({ player_id: playerId, prompted_at: new Date().toISOString() }, { onConflict: "player_id", ignoreDuplicates: true })
      .select("player_id");
    // строка создана сейчас — значит, анкету ещё не показывали
    return !error && (data?.length ?? 0) > 0;
  } catch {
    return false;
  }
}
