import "server-only";
import { GRAND_FINAL_ADVANTAGE } from "../bracket";
import { handleLobbyEvent, type LobbyEvent } from "../lobby";
import { getMatch, syncBracket } from "../matches";
import { logSiteError } from "../site-errors";
import { db } from "../supabase";
import { startMapLogging, stopMapLogging } from "../swing-ingest";
import type { Match } from "../types";
import { enqueueCommand } from "./state";

// ───────────────────────── события MatchZy

type StatsPlayer = { steamid: string; name: string; stats: Record<string, number> };
type StatsTeam = { id?: string; name?: string; score?: number; series_score?: number; players?: StatsPlayer[] };
export type MatchzyEvent = {
  event: string;
  matchid?: number;
  map_number?: number;
  round_number?: number;
  winner?: { side?: string; team?: string };
  team1?: StatsTeam;
  team2?: StatsTeam;
  team1_series_score?: number;
  team2_series_score?: number;
};

/** Поздние события (series_end после map_result, досылка буфера) принимаем ещё столько после конца матча */
const LATE_EVENT_MS = 10 * 60_000;

/**
 * Событие принимается, только если matchid — матч или игра лобби, которые сейчас идут
 * (или закончились за последние 10 минут). Чужой или старый сервер с тем же токеном не изменит счёт.
 */
export async function matchzyIdAccepted(matchzyId: unknown) {
  const id = Number(matchzyId);
  if (!Number.isSafeInteger(id) || id < 0) return false;
  const since = new Date(Date.now() - LATE_EVENT_MS).toISOString();
  const [{ count: matches, error: e1 }, { count: games, error: e2 }] = await Promise.all([
    db().from("matches").select("id", { count: "exact", head: true }).eq("matchzy_id", id)
      .or(`status.in.(ready,live),and(status.eq.finished,finished_at.gte."${since}")`),
    db().from("lobby_games").select("id", { count: "exact", head: true }).eq("matchzy_id", id)
      .or(`status.in.(waiting,live),and(status.eq.finished,finished_at.gte."${since}")`),
  ]);
  if (e1 || e2) throw new Error("Не удалось проверить матч события", { cause: e1 ?? e2 });
  return (matches ?? 0) + (games ?? 0) > 0;
}

/**
 * Необязательный шаг после записи счёта: статистика, Swing, сетка, сообщение в чат.
 * Его сбой не отменяет уже записанный счёт и не заставляет буфер агента досылать событие заново —
 * ошибка уходит в журнал ошибок сайта.
 */
async function bestEffort(name: string, ev: MatchzyEvent, job: () => Promise<unknown>) {
  try {
    await job();
  } catch (e) {
    console.error(`matchzy ${ev.event}: ${name} failed`, e);
    await logSiteError({
      source: "server",
      message: `MatchZy ${ev.event} (матч ${ev.matchid ?? "?"}): ${name}: ${(e as Error)?.message ?? e}`,
      path: "/api/matchzy/events",
      kind: "background_job",
    }).catch(() => {});
  }
}

async function upsertPlayerStats(match: Match, mapNumber: number, ev: MatchzyEvent) {
  const sides: [StatsTeam | undefined, string | null][] = [
    [ev.team1, match.team1_id],
    [ev.team2, match.team2_id],
  ];
  const all = sides.flatMap(([t]) => t?.players ?? []);
  if (all.length === 0) return;
  const { data: known } = await db().from("players").select("id, steam_id").in("steam_id", all.map((p) => String(p.steamid)));
  const byStem = new Map((known ?? []).map((p) => [p.steam_id, p.id]));

  const rows = sides.flatMap(([t, teamId]) =>
    (t?.players ?? []).map((p) => {
      const s = p.stats ?? {};
      const n = (k: string) => Number(s[k] ?? 0) || 0;
      return {
        match_id: match.id,
        map_number: mapNumber,
        steam_id: String(p.steamid),
        player_id: byStem.get(String(p.steamid)) ?? null,
        team_id: teamId,
        name: p.name,
        kills: n("kills"),
        deaths: n("deaths"),
        assists: n("assists"),
        damage: n("damage"),
        headshot_kills: n("headshot_kills"),
        rounds_played: n("rounds_played"),
        kast: n("kast"),
        first_kills: n("first_kills_t") + n("first_kills_ct"),
        first_deaths: n("first_deaths_t") + n("first_deaths_ct"),
        trade_kills: n("trade_kills"),
        clutch_wins: n("1v1") + n("1v2") + n("1v3") + n("1v4") + n("1v5"),
        multi_kills: { "2k": n("2k"), "3k": n("3k"), "4k": n("4k"), "5k": n("5k") },
        utility_damage: n("utility_damage"),
        enemies_flashed: n("enemies_flashed"),
        flash_assists: n("flash_assists"),
        bomb_plants: n("bomb_plants"),
        bomb_defuses: n("bomb_defuses"),
        mvp: n("mvp"),
        raw: s,
        updated_at: new Date().toISOString(),
      };
    }),
  );
  await db().from("player_map_stats").upsert(rows, { onConflict: "match_id,map_number,steam_id" }).throwOnError();
}

/** Текст для чата CS2 через консоль: без разделителей команд, кавычек и управляющих символов */
function chatSafe(text: string) {
  return text.replace(/["\\;\u0000-\u001f\u007f]/g, "").slice(0, 200);
}
const mapTitle = (m: string) =>
  m.split("@")[0].replace(/^(de|cs|aim|awp)_/, "").replace(/^./, (c) => c.toUpperCase());

/**
 * Итог карты в чат игры: счёт карты, счёт серии и следующая карта — или итог матча.
 * Отправляется агенту обычной RCON-командой (css_asay — сообщение от имени админа сервера).
 */
async function announceMapResult(matchId: string, mapNumber: number) {
  const m = await getMatch(matchId);
  if (!m?.server_instance) return;
  const t1 = m.team1?.name ?? "Команда 1";
  const t2 = m.team2?.name ?? "Команда 2";
  const map = m.maps.find((x) => x.map_number === mapNumber);
  const lines: string[] = [];
  if (map) lines.push(`Карта ${mapNumber} (${mapTitle(map.map_name)}): ${t1} ${map.team1_score}:${map.team2_score} ${t2}`);
  if (m.status === "finished") {
    const winner = m.winner_id === m.team1_id ? t1 : t2;
    lines.push(`Матч окончен — победил ${winner}, ${m.team1_score}:${m.team2_score}. Спасибо за игру!`);
  } else {
    const next = m.maps.find((x) => x.map_number === mapNumber + 1);
    lines.push(`Серия ${t1} ${m.team1_score}:${m.team2_score} ${t2}${next ? ` · следующая карта — ${mapTitle(next.map_name)}` : ""}`);
  }
  for (const line of lines) await enqueueCommand(m.server_instance, "rcon", { command: `css_asay ${chatSafe(line)}` });
}

/** Счёт серии по сыгранным картам (то же, что recomputeSeries, но сетка обновляется отдельным шагом) */
async function recomputeSeriesScore(matchId: string) {
  const { data, error } = await db().rpc("recompute_match_series", { p_match: matchId, p_advantage: GRAND_FINAL_ADVANTAGE });
  if (error) throw new Error("Не удалось сохранить результат серии", { cause: error });
  return data as { tournament_id: string; winner: string | null } | null;
}

/**
 * Обработка события: сначала основная запись (сырое событие, счёт карты, статус и счёт серии) —
 * её ошибка уходит наверх, и буфер агента повторит событие. Затем необязательные шаги по отдельности.
 */
export async function handleMatchzyEvent(ev: MatchzyEvent) {
  const { data } = ev.matchid != null
    ? await db().from("matches").select("*").eq("matchzy_id", ev.matchid).maybeSingle().throwOnError()
    : { data: null };
  const match = data as Match | null;

  await db().from("match_events").insert({
    match_id: match?.id ?? null,
    matchzy_id: ev.matchid ?? null,
    event: ev.event,
    map_number: ev.map_number ?? null,
    round_number: ev.round_number ?? null,
    payload: ev,
  }).throwOnError();
  if (!match) {
    // игра лобби: итог карты — в чат сервера
    const out = await handleLobbyEvent(ev as LobbyEvent);
    if (out) await bestEffort("сообщение в чат", ev, async () => {
      for (const line of out.lines) await enqueueCommand(out.instance, "rcon", { command: `css_asay ${chatSafe(line)}` });
    });
    return;
  }

  // MatchZy нумерует карты с 0, у нас — с 1
  const mapNumber = (ev.map_number ?? 0) + 1;
  const setMap = (patch: Record<string, unknown>, unfinished = false) => {
    let query = db().from("match_maps").update(patch).eq("match_id", match.id).eq("map_number", mapNumber);
    if (unfinished) query = query.neq("status", "finished");
    return query.throwOnError();
  };

  switch (ev.event) {
    case "series_start":
    case "going_live": {
      if (match.status === "ready") {
        await db().from("matches").update({ status: "live", started_at: new Date().toISOString() }).eq("id", match.id).eq("status", "ready").throwOnError();
      }
      if (ev.event === "going_live") {
        if (match.status === "finished" || match.status === "cancelled") break;
        await setMap({ status: "live" }, true);
        await bestEffort("Swing: начало карты", ev, () => startMapLogging(match.id, mapNumber));
      }
      break;
    }
    case "round_end": {
      if (match.status === "finished" || match.status === "cancelled") break;
      const { data: map } = await db().from("match_maps").select("status").eq("match_id", match.id).eq("map_number", mapNumber).maybeSingle().throwOnError();
      if (map?.status === "finished") break;
      await setMap({ team1_score: ev.team1?.score ?? 0, team2_score: ev.team2?.score ?? 0, status: "live" }, true);
      // статистика накопительная: следующий round_end или map_result перезапишет её целиком
      await bestEffort("статистика игроков", ev, () => upsertPlayerStats(match, mapNumber, ev));
      break;
    }
    case "map_result": {
      const winnerTeam = ev.winner?.team === "team1" ? match.team1_id : ev.winner?.team === "team2" ? match.team2_id : null;
      await setMap({
        team1_score: ev.team1?.score ?? 0,
        team2_score: ev.team2?.score ?? 0,
        status: "finished",
        winner_id: winnerTeam,
      });
      if (match.status === "ready") await db().from("matches").update({ status: "live" }).eq("id", match.id).eq("status", "ready").throwOnError();
      const series = await recomputeSeriesScore(match.id);
      await bestEffort("статистика игроков", ev, () => upsertPlayerStats(match, mapNumber, ev));
      await bestEffort("Swing: конец карты", ev, () => stopMapLogging(match.id));
      if (series?.winner) await bestEffort("сетка турнира", ev, () => syncBracket(series.tournament_id));
      await bestEffort("итог карты в чат", ev, () => announceMapResult(match.id, mapNumber));
      break;
    }
    case "series_end": {
      const fresh = await getMatch(match.id);
      if (fresh && fresh.status !== "finished") {
        const winner = ev.winner?.team === "team1" ? match.team1_id : ev.winner?.team === "team2" ? match.team2_id : null;
        if (winner) {
          await db()
            .from("matches")
            .update({
              status: "finished",
              winner_id: winner,
              team1_score: ev.team1_series_score ?? fresh.team1_score,
              team2_score: ev.team2_series_score ?? fresh.team2_score,
              finished_at: new Date().toISOString(),
            })
            .eq("id", match.id).in("status", ["ready", "live"]).throwOnError();
          await bestEffort("сетка турнира", ev, () => syncBracket(match.tournament_id));
        }
      }
      break;
    }
  }
}
