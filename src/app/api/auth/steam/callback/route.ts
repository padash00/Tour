import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { fetchSteamProfile, verifySteamCallback } from "@/lib/steam";
import { fetchFaceitBySteamId } from "@/lib/faceit";
import { displayNick } from "@/lib/nick";
import { createSession } from "@/lib/session";
import { safeNext } from "@/lib/redirect";
import { db } from "@/lib/supabase";
import { markLoginRefreshed } from "@/lib/profile-sync";
import { LANG_COOKIE, isLang } from "@/lib/i18n/core";
import { THEME_COOKIE, isTheme } from "@/lib/theme";

export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  // при ошибке входа возвращаем на /login с тем же next — игрок не теряет приглашение или регистрацию
  const back = (error: string) => new URL(`/login?error=${error}&next=${encodeURIComponent(safeNext(url.searchParams.get("next")))}`, url.origin);
  const steamId = await verifySteamCallback(new URL(url.toString()));
  if (!steamId) {
    return NextResponse.redirect(back("steam"));
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
    steam_nickname: profile.nickname,
    avatar_url: profile.avatarUrl,
    profile_url: profile.profileUrl,
    country: profile.country,
  };

  const { data: existing } = await db().from("players").select("id, faceit_nickname, steam_nickname").eq("steam_id", steamId).maybeSingle();
  // основной ник — с FACEIT, без него — из Steam; если сервис сейчас не ответил, берём сохранённое
  const nickname = displayNick(profile.ok ? profile.nickname : (existing?.steam_nickname ?? profile.nickname), faceit?.nickname ?? existing?.faceit_nickname) ?? profile.nickname;
  // если Steam не ответил — не затираем сохранённые ник и аватар
  const { data: player, error } = existing
    ? await db()
        .from("players")
        .update({ last_login_at: now, ...(profile.ok && steamFields), ...faceitFields, ...((profile.ok || faceit) && { nickname }) })
        .eq("id", existing.id)
        .select("id, steam_id")
        .single()
    : await db()
        .from("players")
        .insert({ steam_id: steamId, last_login_at: now, nickname, ...steamFields, ...faceitFields })
        .select("id, steam_id")
        .single();

  if (error || !player) {
    console.error("steam login upsert failed", error);
    return NextResponse.redirect(back("db"));
  }

  if (profile.ok) await markLoginRefreshed(player.id);
  await syncLang(player.id, request.cookies.get(LANG_COOKIE)?.value);
  await syncTheme(player.id, request.cookies.get(THEME_COOKIE)?.value);
  await createSession({ playerId: player.id, steamId: player.steam_id });
  const next = safeNext(url.searchParams.get("next"));
  if (await firstProfilePrompt(player.id)) {
    return NextResponse.redirect(new URL(`/me/profile?welcome=1&next=${encodeURIComponent(next)}`, url.origin));
  }
  return NextResponse.redirect(new URL(next, url.origin));
}

/**
 * Тема при входе: если игрок уже выбирал тему — она открывается и на этом устройстве;
 * если в профиле пусто — туда записывается выбор, сделанный здесь гостем. Ошибка базы вход не ломает.
 */
async function syncTheme(playerId: string, deviceTheme: string | undefined) {
  try {
    const { data } = await db().from("players").select("theme").eq("id", playerId).maybeSingle();
    if (isTheme(data?.theme)) {
      if (data.theme !== deviceTheme) (await cookies()).set(THEME_COOKIE, data.theme, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    } else if (isTheme(deviceTheme)) {
      await db().from("players").update({ theme: deviceTheme }).eq("id", playerId);
    }
  } catch {
    // тема не критична
  }
}

/**
 * Язык ҚАЗ/РУС при входе: выбор, сделанный ещё гостем на этом устройстве, — в профиль (если там пусто);
 * на устройстве без выбора — язык из профиля в cookie, чтобы он открылся и здесь. Ошибка базы вход не ломает.
 */
async function syncLang(playerId: string, deviceLang: string | undefined) {
  try {
    if (isLang(deviceLang)) {
      await db().from("players").update({ lang: deviceLang }).eq("id", playerId).is("lang", null);
      return;
    }
    const { data } = await db().from("players").select("lang").eq("id", playerId).maybeSingle();
    if (isLang(data?.lang)) {
      (await cookies()).set(LANG_COOKIE, data.lang, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
    }
  } catch {
    // язык не критичен
  }
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
