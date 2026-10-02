import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/supabase";
import { applyVetoTimeouts } from "@/lib/matches";

/**
 * Лёгкий «отпечаток» состояния для живых страниц. Клиент опрашивает его и перерисовывает страницу,
 * только когда отпечаток изменился. Ответ кэшируется CDN на 2 с — сколько бы ни было зрителей,
 * база получает не больше запроса раз в 2 секунды на каждый матч.
 *   ?k=match:<uuid>  — матч: статус, счёт, сервер, вето, карты, раунды
 *   ?k=matches       — список матчей: live / ready / veto
 *   ?k=tournament:<uuid> — режим ТВ турнира: матчи, счёт идущих карт, этап
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const k = request.nextUrl.searchParams.get("k") ?? "";
  let parts: unknown[] = [];
  let live = false; // идёт вето — ответ не кэшируем, каждая секунда на счету

  if (k.startsWith("match:") && UUID.test(k.slice(6))) {
    const id = k.slice(6);
    const { data: head } = await db().from("matches").select("status, veto_deadline").eq("id", id).maybeSingle();
    if (head?.status === "veto") {
      live = true;
      // время хода вышло — авто-бан/пик сразу, не дожидаясь перезагрузки страницы
      if (head.veto_deadline && new Date(head.veto_deadline).getTime() <= Date.now()) await applyVetoTimeouts(id);
    }
    const [m, maps, veto, stats] = await Promise.all([
      db()
        .from("matches")
        .select("status, team1_id, team2_id, team1_score, team2_score, winner_id, server_state, server_address, server_instance, veto_deadline, scheduled_at, under_review")
        .eq("id", id)
        .maybeSingle(),
      db().from("match_maps").select("map_number, map_name, status, team1_score, team2_score").eq("match_id", id).order("map_number"),
      db().from("veto_actions").select("step").eq("match_id", id),
      db().from("player_map_stats").select("map_number", { count: "exact", head: true }).eq("match_id", id),
    ]);
    parts = [m.data, maps.data, veto.data?.length ?? 0, stats.count ?? 0];
  } else if (k.startsWith("tournament:") && UUID.test(k.slice(11))) {
    // режим ТВ: всё, что видно на экране турнира — статусы, счёт серий и карт идущих матчей, этап турнира
    const id = k.slice(11);
    const [t, ms] = await Promise.all([
      db().from("tournaments").select("status").eq("id", id).maybeSingle(),
      db()
        .from("matches")
        .select("id, status, stage, team1_id, team2_id, team1_score, team2_score, winner_id, server_state, scheduled_at")
        .eq("tournament_id", id)
        .order("number"),
    ]);
    const liveIds = (ms.data ?? []).filter((m) => m.status === "live").map((m) => m.id);
    const maps = liveIds.length
      ? await db().from("match_maps").select("match_id, map_number, status, team1_score, team2_score").in("match_id", liveIds)
      : { data: [] };
    parts = [t.data, ms.data, maps.data];
  } else if (k === "matches") {
    const { data } = await db()
      .from("matches")
      .select("id, status, team1_score, team2_score, server_state")
      .in("status", ["veto", "ready", "live"])
      .order("number");
    parts = [data];
  } else {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  const v = createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return NextResponse.json(
    { v },
    { headers: { "Cache-Control": live ? "no-store" : "public, max-age=0, s-maxage=2, stale-while-revalidate=4" } },
  );
}
