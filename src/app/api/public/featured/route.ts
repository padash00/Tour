import { NextResponse } from "next/server";
import { roundTitle } from "@/lib/bracket";
import { FORMATS, isFormat } from "@/lib/formats";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";

/*
 * Открытые данные для главного сайта клуба (f16-arena.kz): ближайший или идущий турнир и счёт live-матчей.
 * Только публичное (то же, что видно на странице турнира): ни игроков, ни анкет, ни адресов серверов.
 * CDN держит ответ 30 с — сколько бы ни было посетителей у клуба, база получает запрос раз в полминуты.
 */

const SITE = "https://tournament.f16-arena.kz";
const SHOWN = ["live", "checkin", "registration", "registration_closed"] as const;
const PRIORITY: Record<(typeof SHOWN)[number], number> = { live: 0, checkin: 1, registration: 2, registration_closed: 3 };

const headers = {
  "Cache-Control": "public, max-age=0, s-maxage=30, stale-while-revalidate=60",
  "Access-Control-Allow-Origin": "*",
};

export async function GET() {
  const { data } = await db().from("tournaments").select("*").in("status", [...SHOWN]).order("starts_at", { ascending: true, nullsFirst: false });
  const t = ((data ?? []) as Tournament[]).sort((a, b) => PRIORITY[a.status as keyof typeof PRIORITY] - PRIORITY[b.status as keyof typeof PRIORITY])[0];
  if (!t) return NextResponse.json({ tournament: null, updated_at: new Date().toISOString() }, { headers });

  const [{ count: teams }, live] = await Promise.all([
    db().from("tournament_registrations").select("id", { count: "exact", head: true }).eq("tournament_id", t.id).eq("status", "approved"),
    t.status === "live" ? liveMatches(t.id) : Promise.resolve(null),
  ]);

  const url = `${SITE}/tournaments/${t.slug}`;
  return NextResponse.json(
    {
      tournament: {
        slug: t.slug,
        name: t.name,
        status: t.status,
        mode: MODES[t.format].label.replace(" на ", "×"),
        format: isFormat(t.bracket_type) ? FORMATS[t.bracket_type].title : t.bracket_type,
        starts_at: t.starts_at,
        registration_closes_at: t.registration_closes_at,
        location: t.location,
        prize_pool: t.prize_pool,
        cover_url: t.cover_url,
        teams: teams ?? 0,
        max_teams: t.max_teams,
        url,
        register_url: `${url}/register`,
        watch_url: `${SITE}/matches`,
        live,
      },
      updated_at: new Date().toISOString(),
    },
    { headers },
  );
}

/** Идущие матчи турнира: команды, счёт серии (BO1 — счёт идущей карты), карта, этап */
async function liveMatches(tournamentId: string) {
  const { data: all } = await db().from("matches").select("id, status, bracket, round, best_of, team1_id, team2_id, team1_score, team2_score").eq("tournament_id", tournamentId);
  const rows = all ?? [];
  const playing = rows.filter((m) => m.status === "live").slice(0, 6);
  if (!playing.length) return { matches: [] };
  const upper = Math.max(0, ...rows.filter((m) => m.bracket === "upper").map((m) => m.round));
  const lower = Math.max(0, ...rows.filter((m) => m.bracket === "lower").map((m) => m.round));
  const teamIds = playing.flatMap((m) => [m.team1_id, m.team2_id]).filter((x): x is string => !!x);
  const [{ data: teams }, { data: maps }] = await Promise.all([
    db().from("teams").select("id, name").in("id", teamIds),
    db().from("match_maps").select("match_id, map_name, status, team1_score, team2_score").in("match_id", playing.map((m) => m.id)).eq("status", "live"),
  ]);
  const name = new Map((teams ?? []).map((x) => [x.id, x.name]));
  const liveMap = new Map((maps ?? []).map((x) => [x.match_id, x]));
  return {
    matches: playing.map((m) => {
      const map = liveMap.get(m.id);
      // BO1 — интереснее счёт раундов идущей карты; серия — счёт по картам
      const rounds = m.best_of === 1 && map;
      return {
        id: m.id,
        team1: (m.team1_id && name.get(m.team1_id)) || "TBD",
        team2: (m.team2_id && name.get(m.team2_id)) || "TBD",
        score1: rounds ? map.team1_score : m.team1_score,
        score2: rounds ? map.team2_score : m.team2_score,
        map: map?.map_name ? mapLabel(map.map_name) : null,
        stage: roundTitle(m.bracket, m.round, upper, lower),
        url: `${SITE}/matches/${m.id}`,
      };
    }),
  };
}
