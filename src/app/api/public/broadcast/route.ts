import { NextResponse, type NextRequest } from "next/server";
import { mockBroadcast, pickBroadcastTournament, shapeBroadcast, type BroadcastSource } from "@/lib/broadcast";
import { getStandings, getTournamentMatches } from "@/lib/matches";
import { getPlayerLeaderboard, mvpOf } from "@/lib/stats";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";

/**
 * Данные экрана перерыва трансляции (/broadcast в OBS): сетка, расписание, идущие матчи, лидеры турнира.
 *   ?tournament=<slug> — без него текущий турнир (как /api/public/featured: идущий → check-in → регистрация).
 * Только публичное (см. src/lib/broadcast.ts). CDN держит ответ 5 с; экран запрашивает его, только когда
 * меняется отпечаток /api/live?k=tournament:<id> (и раз в минуту — для статистики).
 */

const headers = {
  "Cache-Control": "public, max-age=0, s-maxage=5, stale-while-revalidate=10",
  "Access-Control-Allow-Origin": "*",
};

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  if (params.get("mock") && process.env.NODE_ENV !== "production") {
    return NextResponse.json(mockBroadcast(), { headers: { "Cache-Control": "no-store" } });
  }
  const raw = params.get("tournament")?.trim().toLowerCase();
  if (raw && !/^[a-z0-9-]{1,64}$/.test(raw)) {
    return NextResponse.json({ error: "неверный ?tournament=<slug>" }, { status: 400, headers });
  }
  const t = await findTournament(raw ?? null);
  return NextResponse.json(shapeBroadcast(t ? await load(t) : null), { headers });
}

async function findTournament(slug: string | null): Promise<Tournament | null> {
  if (slug) {
    const { data } = await db().from("tournaments").select("*").eq("slug", slug).neq("status", "draft").maybeSingle();
    return (data as Tournament | null) ?? null;
  }
  const { data } = await db()
    .from("tournaments")
    .select("*")
    .in("status", ["live", "checkin", "registration_closed", "registration", "finished"])
    .order("starts_at", { ascending: false, nullsFirst: false })
    .limit(50);
  return pickBroadcastTournament((data ?? []) as Tournament[]);
}

async function load(t: Tournament): Promise<BroadcastSource> {
  const matches = await getTournamentMatches(t.id);
  // карты: идущих матчей (счёт серии и текущей карты) и сыгранных BO1 (счёт раундов вместо «1:0»)
  const mapIds = matches.filter((m) => m.status === "live" || (m.status === "finished" && m.best_of === 1 && !m.is_walkover)).map((m) => m.id);
  const hasStage = matches.some((m) => m.stage === "group" || m.stage === "swiss");
  const [maps, groups, board] = await Promise.all([
    mapIds.length
      ? db()
          .from("match_maps")
          .select("match_id, map_number, map_name, status, team1_score, team2_score, winner_id")
          .in("match_id", mapIds)
          .then((r) => r.data ?? [])
      : Promise.resolve([]),
    hasStage ? getStandings(t) : Promise.resolve([]),
    getPlayerLeaderboard(t.id),
  ]);
  const teams = new Map(matches.flatMap((m) => [m.team1, m.team2]).filter((x) => !!x).map((x) => [x.id, x]));
  const toLeader = (p: (typeof board)[number]) => ({
    name: p.player?.nickname ?? p.name,
    avatar: p.player?.avatar_url && /^https:\/\//i.test(p.player.avatar_url) ? p.player.avatar_url : null,
    team: p.team?.name ?? null,
    rating: p.rating,
    kd: p.kd,
    adr: p.adr,
    maps: p.maps,
    swing: p.swing,
  });
  const mvp = mvpOf(board);
  return {
    tournament: { id: t.id, slug: t.slug, name: t.name, status: t.status, sponsors: t.sponsors },
    matches,
    teams: [...teams.values()].map((x) => ({ id: x.id, name: x.name, tag: x.tag, logo_url: x.logo_url })),
    maps,
    groups: groups.map((g) => ({ label: g.label, table: g.table })),
    leaders: board.map(toLeader),
    mvp: mvp ? { ...toLeader(mvp), by: mvp.by } : null,
  };
}
