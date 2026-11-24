import "server-only";
import { db } from "./supabase";
import { parseLogBatch, roundFacts, type RoundEvent } from "./lobby-rounds-core";

/*
 * Приём HTTP-лога CS2 для игр лобби и пересчёт фактов по раундам (первые убийства, KAST, трейды, оружие, стороны).
 * Ничего из этого не влияет на счёт и ход игры: любая ошибка здесь — только отсутствие дополнительной статистики.
 */

type GameRow = { id: string; status: string; maps: { status?: string | null; team1_score: number; team2_score: number }[] | null };

/**
 * Пачка лога игры лобби: сохраняем разобранные события. Пачки без нужных событий (урон, покупки) не хранятся.
 * Возвращает null, если такой игры лобби нет — тогда это не наш матч.
 */
export async function ingestLobbyLog(matchzyId: number, body: string, key: string): Promise<{ events: number } | { ignored: string } | null> {
  const { data } = await db().from("lobby_games").select("id, status, maps").eq("matchzy_id", matchzyId).maybeSingle().throwOnError();
  const game = data as unknown as GameRow | null;
  if (!game) return null;
  if (game.status === "cancelled") return { ignored: "cancelled game" };
  const events = parseLogBatch(body);
  if (!events.length) return { events: 0 };
  // повторная досылка той же пачки вторую строку не создаёт
  await db().from("lobby_log_batches").upsert({ game_id: game.id, key, events }, { onConflict: "key", ignoreDuplicates: true }).throwOnError();
  // хвост лога может прийти уже после итога карты: с концом раунда пересчитываем сыгранные карты заново
  if ((game.maps ?? []).some((m) => m.status === "finished") && events.some((e) => e.type === "round_end" || e.type === "game_over")) {
    await recomputeLobbyFacts(game.id).catch((e) => console.error("lobby round facts", e));
  }
  return { events: events.length };
}

/** Пересчитать факты по раундам для всех сыгранных карт игры. Безопасно вызывать сколько угодно раз */
export async function recomputeLobbyFacts(gameId: string): Promise<number> {
  const [{ data: game }, { data: stats }] = await Promise.all([
    db().from("lobby_games").select("id, status, maps").eq("id", gameId).maybeSingle().throwOnError(),
    db().from("lobby_player_stats").select("map_number, steam_id, team").eq("game_id", gameId).throwOnError(),
  ]);
  const g = game as unknown as GameRow | null;
  if (!g || !stats?.length) return 0;

  const events: RoundEvent[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: batches } = await db().from("lobby_log_batches").select("events").eq("game_id", gameId).order("id").range(from, from + 999).throwOnError();
    for (const b of batches ?? []) events.push(...(b.events as unknown as RoundEvent[]));
    if (!batches || batches.length < 1000) break;
  }
  if (!events.length) return 0;

  // номера карт в статистике идут с нуля или с единицы — приводим к порядку карт серии
  const base = Math.min(...stats.map((s) => s.map_number));
  const maps = (g.maps ?? []).map((m, i) => ({
    number: i + base,
    total: m.status === "finished" ? m.team1_score + m.team2_score : 0,
    players: stats.filter((s) => s.map_number === i + base).map((s) => ({ steam_id: s.steam_id, team: s.team })),
  }));
  const facts = roundFacts(events, maps);
  const rows = facts.flatMap((byPlayer, i) =>
    byPlayer
      ? [...byPlayer.entries()].map(([steam_id, f]) => ({
          game_id: gameId,
          map_number: maps[i].number,
          steam_id,
          rounds: f.rounds,
          kast: f.kast,
          first_kills: f.first_kills,
          first_deaths: f.first_deaths,
          trade_kills: f.trade_kills,
          flash_assists: f.flash_assists,
          weapons: f.weapons,
          sides: f.sides,
          updated_at: new Date().toISOString(),
        }))
      : [],
  );
  if (rows.length) await db().from("lobby_round_facts").upsert(rows, { onConflict: "game_id,map_number,steam_id" }).throwOnError();
  return rows.length;
}
