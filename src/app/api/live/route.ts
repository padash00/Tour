import { createHash } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { applyVetoTimeouts } from "@/lib/matches";

/**
 * Лёгкий «отпечаток» состояния для живых страниц. Клиент опрашивает его и перерисовывает страницу,
 * только когда отпечаток изменился. Ответ кэшируется CDN на 2 с — сколько бы ни было зрителей,
 * база получает не больше запроса раз в 2 секунды на каждый матч.
 *   ?k=match:<uuid>  — матч: статус, счёт, сервер, вето, карты, раунды
 *   ?k=matches       — список матчей: live / ready / veto
 *   ?k=servers       — агент, инстансы и очередь команд F16 Control
 *   ?k=tournament:<uuid> — режим ТВ турнира: матчи, счёт идущих карт, этап
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const k = request.nextUrl.searchParams.get("k") ?? "";
  let parts: unknown[] = [];
  let noStore = false; // вето и внутреннее состояние серверов не кэшируем

  if (k.startsWith("match:") && UUID.test(k.slice(6))) {
    const id = k.slice(6);
    const { data: head } = await db().from("matches").select("status, veto_deadline").eq("id", id).maybeSingle();
    if (head?.status === "veto") {
      noStore = true;
      // время хода вышло — авто-бан/пик сразу, не дожидаясь перезагрузки страницы
      if (head.veto_deadline && new Date(head.veto_deadline).getTime() <= Date.now()) await applyVetoTimeouts(id);
    }
    const [m, maps, veto, stats, rounds] = await Promise.all([
      db()
        .from("matches")
        .select("status, team1_id, team2_id, team1_score, team2_score, winner_id, server_state, server_address, server_instance, veto_deadline, scheduled_at, under_review")
        .eq("id", id)
        .maybeSingle(),
      db().from("match_maps").select("map_number, map_name, status, team1_score, team2_score").eq("match_id", id).order("map_number"),
      db().from("veto_actions").select("step").eq("match_id", id),
      db().from("player_map_stats").select("map_number", { count: "exact", head: true }).eq("match_id", id),
      // лента раундов: раунды пишутся из лога сервера чуть позже счёта — следим и за ними
      db()
        .from("match_rounds")
        .select("map_number, round_number", { count: "exact" })
        .eq("match_id", id)
        .order("map_number", { ascending: false })
        .order("round_number", { ascending: false })
        .limit(1),
    ]);
    parts = [m.data, maps.data, veto.data?.length ?? 0, stats.count ?? 0, rounds.count ?? 0, rounds.data?.[0] ?? null];
  } else if (k.startsWith("tournament:") && UUID.test(k.slice(11))) {
    // режим ТВ: всё, что видно на экране турнира — статусы, счёт серий и карт идущих матчей, этап турнира
    const id = k.slice(11);
    const [t, regs, ms] = await Promise.all([
      db().from("tournaments").select("status, bracket_published_at, autopilot").eq("id", id).maybeSingle(),
      db().from("tournament_registrations").select("id, status, checked_in_at, seed").eq("tournament_id", id).order("id"),
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
    parts = [t.data, regs.data, ms.data, maps.data];
  } else if (k === "matches") {
    const { data } = await db()
      .from("matches")
      .select("id, status, team1_score, team2_score, server_state")
      .in("status", ["veto", "ready", "live"])
      .order("number");
    parts = [data];
  } else if (k === "servers") {
    const player = await getCurrentPlayer();
    if (!isAdmin(player)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "Cache-Control": "no-store" } });
    }
    noStore = true;
    const [host, instances, commands] = await Promise.all([
      db().from("server_host").select("last_seen_at, info").eq("id", "main").maybeSingle(),
      db().from("server_instances").select("name, running, gamestate, map, players, matchzy_match_id, match_id, for_lobby, last_seen_at").order("name"),
      db().from("agent_commands").select("id, status, result, created_at, sent_at, done_at").order("created_at", { ascending: false }).limit(15),
    ]);
    // Time crossing the heartbeat deadline is itself a state change, even when
    // the offline agent can no longer update any database row.
    const cutoff = Date.now() - 30_000;
    parts = [host.data, instances.data, commands.data,
      !!host.data?.last_seen_at && Date.parse(host.data.last_seen_at) > cutoff,
      instances.data?.map((i) => !!i.last_seen_at && Date.parse(i.last_seen_at) > cutoff)];
  } else {
    return NextResponse.json({ error: "bad key" }, { status: 400 });
  }

  const v = createHash("sha1").update(JSON.stringify(parts)).digest("hex").slice(0, 16);
  return NextResponse.json(
    { v },
    { headers: { "Cache-Control": noStore ? "no-store" : "public, max-age=0, s-maxage=2, stale-while-revalidate=4" } },
  );
}
