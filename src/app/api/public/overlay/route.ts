import { NextResponse, type NextRequest } from "next/server";
import { mockOverlay, parseOverlayQuery, pickOverlayMatch, shapeOverlay, type OverlayQuery, type OverlaySource } from "@/lib/overlay";
import { db } from "@/lib/supabase";
import type { MatchStatus } from "@/lib/types";

/**
 * Данные оверлея трансляции (/overlay в OBS): матч на инстансе, конкретный матч или текущий матч турнира.
 *   ?server=CS2-01 | ?match=<uuid> | ?tournament=<slug>
 * Только публичное (см. src/lib/overlay.ts). CDN держит ответ 2 с, как /api/live: сколько бы ни было
 * оверлеев и зрителей, база получает не больше запроса раз в 2 секунды на каждый адрес.
 */

const headers = {
  "Cache-Control": "public, max-age=0, s-maxage=2, stale-while-revalidate=4",
  "Access-Control-Allow-Origin": "*",
};

const MATCH_COLUMNS = "id, status, number, bracket, round, group_label, best_of, team1_id, team2_id, team1_score, team2_score, scheduled_at, tournament_id";
const ACTIVE: MatchStatus[] = ["live", "ready", "veto", "upcoming", "pending"];

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const mock = params.get("mock");
  if (mock && process.env.NODE_ENV !== "production") {
    return NextResponse.json(mockOverlay(mock), { headers: { "Cache-Control": "no-store" } });
  }

  const query = parseOverlayQuery(params);
  if (!query) {
    return NextResponse.json({ error: "нужен ?server=CS2-01, ?match=<uuid> или ?tournament=<slug>" }, { status: 400, headers });
  }
  return NextResponse.json(shapeOverlay(await load(query)), { headers });
}

type Row = { id: string; status: string; number: number; bracket: string; round: number; group_label: string | null; best_of: number; team1_id: string | null; team2_id: string | null; team1_score: number; team2_score: number; scheduled_at: string | null; tournament_id: string };

async function findMatch(query: OverlayQuery): Promise<Row | null> {
  if ("match" in query) {
    const { data } = await db().from("matches").select(MATCH_COLUMNS).eq("id", query.match).maybeSingle();
    return (data as Row | null) ?? null;
  }
  if ("server" in query) {
    // матч, назначенный на инстанс (сайт ставит server_instance при выдаче сервера и снимает в конце)
    const { data } = await db().from("matches").select(MATCH_COLUMNS).eq("server_instance", query.server).in("status", ACTIVE);
    const picked = pickOverlayMatch((data ?? []) as Row[]);
    if (picked) return picked;
    // запасной путь — что сообщил агент: MatchZy на инстансе играет матч сайта
    const { data: inst } = await db().from("server_instances").select("match_id").eq("name", query.server).maybeSingle();
    if (!inst?.match_id) return null;
    const { data: m } = await db().from("matches").select(MATCH_COLUMNS).eq("id", inst.match_id).in("status", ACTIVE).maybeSingle();
    return (m as Row | null) ?? null;
  }
  const { data: t } = await db().from("tournaments").select("id").eq("slug", query.tournament).maybeSingle();
  if (!t) return null;
  const { data } = await db().from("matches").select(MATCH_COLUMNS).eq("tournament_id", t.id).in("status", ACTIVE);
  return pickOverlayMatch((data ?? []) as Row[]);
}

async function load(query: OverlayQuery): Promise<OverlaySource | null> {
  const m = await findMatch(query);
  if (!m) return null;
  const teamIds = [m.team1_id, m.team2_id].filter((x): x is string => !!x);
  const [tournament, teams, maps, rounds] = await Promise.all([
    db().from("tournaments").select("name").eq("id", m.tournament_id).maybeSingle(),
    teamIds.length ? db().from("teams").select("id, name, tag, logo_url").in("id", teamIds) : Promise.resolve({ data: [] }),
    db().from("match_maps").select("map_number, map_name, status, team1_score, team2_score, winner_id, picked_by").eq("match_id", m.id).order("map_number"),
    // для подписи этапа нужны только раунды верхней/нижней сетки
    m.bracket === "upper" || m.bracket === "lower"
      ? db().from("matches").select("bracket, round").eq("tournament_id", m.tournament_id).in("bracket", ["upper", "lower"])
      : Promise.resolve({ data: [] }),
  ]);
  return {
    match: m,
    tournament: tournament.data ?? null,
    teams: teams.data ?? [],
    maps: maps.data ?? [],
    rounds: (rounds.data ?? []) as { bracket: string; round: number }[],
  };
}
