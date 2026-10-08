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

type LobbyMap = { map: string; status: string; winner: 1 | 2 | null; team1_score: number; team2_score: number };

/** Игра лобби на инстансе (в том числе с ботами) — оверлей показывает её так же, как матч турнира */
async function lobbySource(server: string): Promise<OverlaySource | null> {
  const { data: g } = await db()
    .from("lobby_games")
    .select("id, status, best_of, team1, team2, team1_score, team2_score, maps, created_at")
    .eq("server_instance", server)
    .in("status", ["waiting", "live"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!g) return null;
  const t1 = g.team1 as { name?: string } | null;
  const t2 = g.team2 as { name?: string } | null;
  const tag = (n: string) => n.replace(/[^\p{L}\p{N}]/gu, "").slice(0, 3).toUpperCase() || "TBD";
  const name1 = t1?.name || "Команда A";
  const name2 = t2?.name || "Команда B";
  const maps = ((g.maps ?? []) as LobbyMap[]).map((x, i) => ({
    map_number: i + 1,
    map_name: x.map,
    status: x.status,
    team1_score: x.team1_score ?? 0,
    team2_score: x.team2_score ?? 0,
    winner_id: x.winner === 1 ? "t1" : x.winner === 2 ? "t2" : null,
    picked_by: null,
  }));
  return {
    match: {
      id: g.id,
      status: g.status === "live" ? "live" : "ready",
      bracket: "lobby",
      round: 1,
      best_of: g.best_of,
      team1_id: "t1",
      team2_id: "t2",
      team1_score: g.team1_score,
      team2_score: g.team2_score,
      scheduled_at: null,
    },
    tournament: { name: "F16 Arena · Лобби" },
    teams: [
      { id: "t1", name: name1, tag: tag(name1), logo_url: null },
      { id: "t2", name: name2, tag: tag(name2), logo_url: null },
    ],
    maps,
    rounds: [],
    stage: "Лобби",
  };
}

async function load(query: OverlayQuery): Promise<OverlaySource | null> {
  const m = await findMatch(query);
  if (!m) return "server" in query ? lobbySource(query.server) : null;
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
