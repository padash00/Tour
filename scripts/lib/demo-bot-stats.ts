// Прогон ботами: статистика игроков из настоящей игры. У ботов нет SteamID — лог CS2 приходит на сайт с
// steamId = null, и MatchZy не шлёт по ним статистику. Здесь каждый бот карты закрепляется за игроком состава
// (5 ботов команды → 5 игроков), события раундов (убийства, ассисты, бомба) переписываются на игроков, по ним
// считаются player_map_stats и Swing — дальше таблицы, рейтинг, MVP и номинации сайт строит как обычно.
// Урон в логе не приходит — он оценивается по убийствам и ассистам (raw.estimated_damage = true).
import { getMatch, getMatchRosters } from "../../src/lib/matches";
import { db } from "../../src/lib/supabase";
import type { Actor, LogEvent } from "../../src/lib/swing";
import { recomputeMatchSwing } from "../../src/lib/swing-ingest";

type Side = "CT" | "T";
type Player = { steamId: string; name: string; playerId: string; teamId: string };

const flip = (s: Side): Side => (s === "CT" ? "T" : "CT");

/** Сторона team1 в раунде основного времени: без ножа team1 начинает за CT на нечётных картах (map_sides в конфиге) */
function team1Side(mapNumber: number, round: number): Side | null {
  if (round > 24) return null; // в овертайме по номеру раунда сторону не определяем
  const start: Side = (mapNumber - 1) % 2 === 0 ? "CT" : "T";
  return round <= 12 ? start : flip(start);
}

/** Переписывает раунды карты на игроков составов и пересчитывает статистику. Возвращает число игроков со статистикой */
export async function attributeBotStats(matchId: string, mapNumber: number): Promise<number> {
  const m = await getMatch(matchId);
  if (!m?.team1_id || !m.team2_id) return 0;
  const rosters = await getMatchRosters(m);
  const toPlayers = (rows: typeof rosters.team1, teamId: string, captain: string | null | undefined): Player[] =>
    rows
      .filter((r) => r.role === "main")
      .map((r) => r.player)
      .sort((a, b) => (a.id === captain ? -1 : b.id === captain ? 1 : a.steam_id.localeCompare(b.steam_id)))
      .map((p) => ({ steamId: p.steam_id, name: p.nickname, playerId: p.id, teamId }));
  const teams = { team1: toPlayers(rosters.team1, m.team1_id, m.team1?.captain_id), team2: toPlayers(rosters.team2, m.team2_id, m.team2?.captain_id) };
  if (!teams.team1.length || !teams.team2.length) return 0;

  const { data: rounds } = await db()
    .from("match_rounds")
    .select("round_number, events, winner_side")
    .eq("match_id", matchId)
    .eq("map_number", mapNumber)
    .order("round_number")
    .throwOnError();
  if (!rounds?.length) return 0;

  // бот → команда: по стороне в раунде основного времени
  const botTeam = new Map<string, "team1" | "team2">();
  const known = new Set([...teams.team1, ...teams.team2].map((p) => p.steamId));
  for (const r of rounds) {
    const s1 = team1Side(mapNumber, r.round_number);
    if (!s1) continue;
    for (const a of actors(r.events as LogEvent[])) {
      if (a.steamId && known.has(a.steamId)) continue;
      if (!a.side || botTeam.has(a.name)) continue;
      botTeam.set(a.name, a.side === s1 ? "team1" : "team2");
    }
  }
  // бот → игрок: по порядку имён, капитан — первый; лишние боты (переподключение) — по кругу
  const assign = new Map<string, Player>();
  for (const key of ["team1", "team2"] as const) {
    const names = [...botTeam].filter(([, t]) => t === key).map(([n]) => n).sort();
    names.forEach((n, i) => assign.set(n, teams[key][i % teams[key].length]));
  }
  const bySteam = new Map([...teams.team1, ...teams.team2].map((p) => [p.steamId, p]));
  const map = (a: Actor): Actor => {
    const p = a.steamId ? bySteam.get(a.steamId) : assign.get(a.name);
    return p ? { ...a, steamId: p.steamId, name: p.name } : a;
  };

  // события раундов → на игроков (уже переписанные раунды не меняются)
  const present = new Set([...assign.values()].map((p) => p.steamId));
  type Stat = { k: number; d: number; a: number; hs: number; fk: number; fd: number; fa: number; plant: number; defuse: number; kast: number; mvp: number; multi: Record<string, number>; rounds: number };
  const stat = new Map<string, Stat>();
  const st = (id: string) => {
    let s = stat.get(id);
    if (!s) stat.set(id, (s = { k: 0, d: 0, a: 0, hs: 0, fk: 0, fd: 0, fa: 0, plant: 0, defuse: 0, kast: 0, mvp: 0, multi: { "2k": 0, "3k": 0, "4k": 0, "5k": 0 }, rounds: 0 }));
    return s;
  };
  for (const r of rounds) {
    const events = (r.events as LogEvent[]).map((e) => remap(e, map));
    if (JSON.stringify(events) !== JSON.stringify(r.events)) {
      await db().from("match_rounds").update({ events: events as never }).eq("match_id", matchId).eq("map_number", mapNumber).eq("round_number", r.round_number).throwOnError();
    }
    const kills = new Map<string, number>();
    const contributed = new Set<string>();
    const died = new Set<string>();
    const killSide = new Map<string, string | null>();
    let first = true;
    for (const e of events) {
      if (e.type === "kill" && e.killer.steamId && e.victim.steamId && e.killer.side !== e.victim.side) {
        const k = st(e.killer.steamId);
        k.k++;
        if (e.headshot) k.hs++;
        kills.set(e.killer.steamId, (kills.get(e.killer.steamId) ?? 0) + 1);
        killSide.set(e.killer.steamId, e.killer.side);
        contributed.add(e.killer.steamId);
        if (first) {
          k.fk++;
          st(e.victim.steamId).fd++;
          first = false;
        }
      }
      if ((e.type === "kill" || e.type === "suicide") && e.victim.steamId) {
        st(e.victim.steamId).d++;
        died.add(e.victim.steamId);
      }
      if (e.type === "assist" && e.assister.steamId) {
        const s = st(e.assister.steamId);
        s.a++;
        if (e.flash) s.fa++;
        contributed.add(e.assister.steamId);
      }
      if (e.type === "plant" && e.actor.steamId) st(e.actor.steamId).plant++;
      if (e.type === "defuse" && e.actor.steamId) st(e.actor.steamId).defuse++;
    }
    // все игроки, замеченные на карте, сыграли раунд; KAST — убийство, ассист или выжил
    for (const id of present) {
      const s = st(id);
      s.rounds++;
      if (contributed.has(id) || !died.has(id)) s.kast++;
    }
    for (const [id, n] of kills) if (n >= 2) st(id).multi[`${Math.min(n, 5)}k`]++;
    // MVP раунда — больше всех убийств у победившей стороны
    const winners = [...kills].filter(([id]) => killSide.get(id) === r.winner_side).sort((x, y) => y[1] - x[1]);
    if (winners[0]) st(winners[0][0]).mvp++;
  }

  const rows = [...stat].map(([steamId, s]) => {
    const p = bySteam.get(steamId)!;
    return {
      match_id: matchId,
      map_number: mapNumber,
      steam_id: steamId,
      player_id: p.playerId,
      team_id: p.teamId,
      name: p.name,
      kills: s.k,
      deaths: s.d,
      assists: s.a,
      damage: s.k * 100 + s.a * 40,
      headshot_kills: s.hs,
      rounds_played: s.rounds,
      kast: s.kast,
      first_kills: s.fk,
      first_deaths: s.fd,
      trade_kills: 0,
      clutch_wins: 0,
      multi_kills: s.multi,
      utility_damage: 0,
      enemies_flashed: 0,
      flash_assists: s.fa,
      bomb_plants: s.plant,
      bomb_defuses: s.defuse,
      mvp: s.mvp,
      raw: { source: "demo-bots", estimated_damage: true },
      updated_at: new Date().toISOString(),
    };
  });
  if (rows.length) await db().from("player_map_stats").upsert(rows, { onConflict: "match_id,map_number,steam_id" }).throwOnError();
  await recomputeMatchSwing(matchId);
  return rows.length;
}

function actors(events: LogEvent[]): Actor[] {
  return events.flatMap((e) =>
    e.type === "kill" ? [e.killer, e.victim] : e.type === "assist" ? [e.assister, e.victim] : e.type === "suicide" ? [e.victim] : e.type === "plant" || e.type === "defuse" ? [e.actor] : [],
  );
}

function remap(e: LogEvent, map: (a: Actor) => Actor): LogEvent {
  switch (e.type) {
    case "kill":
      return { ...e, killer: map(e.killer), victim: map(e.victim) };
    case "assist":
      return { ...e, assister: map(e.assister), victim: map(e.victim) };
    case "suicide":
      return { ...e, victim: map(e.victim) };
    case "plant":
    case "defuse":
      return { ...e, actor: map(e.actor) };
    default:
      return e;
  }
}
