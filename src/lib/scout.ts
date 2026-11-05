import "server-only";
import { gunzipSync } from "node:zlib";
import { ANALYSIS_BUCKET } from "./analysis";
import { isAdmin } from "./auth";
import { db } from "./supabase";
import type { Player } from "./types";

/*
 * Разведка соперника: по разборам карт, где играли ≥3 игрока состава команды (лобби и матчи клуба),
 * собираем, как команда играет: где стоит на 0:20 в атаке и защите, куда закладывает, где первые дуэли,
 * какие гранаты кидает, кто идёт первым и кто с AWP. Выжимку каждой карты пишет разборщик (scout/<id>.json.gz).
 * Видят: админы, игроки самой команды и игроки команды, у которой с ней ближайший матч.
 */

type ScoutFile = {
  map: string;
  players: { name: string; steamid: string | null }[];
  rounds: number;
  rows: [number, number, "T" | "CT", 0 | 1, string | null, string | null, 0 | 1, number, 0 | 1, 0 | 1][];
  nades: [number, number, "T" | "CT" | null, string, string | null, number][];
  openings: [number, number, number, string | null, string | null, number][];
  plants: [number, "T", string | null, number, number | null][];
};

export type ScoutCount = { name: string; n: number; share: number };
export type ScoutPlayer = { steamid: string; name: string; rounds: number; kpr: number; entry: number; entryWin: number; awp: number; spotsT: ScoutCount[]; spotsCT: ScoutCount[] };
export type ScoutSide = {
  rounds: number;
  winRate: number;
  spots: ScoutCount[];
  openingPlaces: ScoutCount[];
  openingWin: number;
  nades: { type: string; to: string; n: number; perGame: number; rt: number }[];
};
export type ScoutReport = {
  games: { id: string; title: string; map: string; date: string; won: number; lost: number }[];
  maps: { map: string; games: number; wins: number }[];
  map: string | null;
  T: ScoutSide;
  CT: ScoutSide;
  plants: ScoutCount[];
  plantTime: number | null;
  players: ScoutPlayer[];
  insights: string[];
};

const pctOf = (n: number, d: number) => (d ? Math.round((n / d) * 100) : 0);
function top(m: Map<string, number>, total: number, k = 5): ScoutCount[] {
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, k).map(([name, n]) => ({ name, n, share: pctOf(n, total) }));
}
const inc = (m: Map<string, number>, k: string | null | undefined, by = 1) => { if (k) m.set(k, (m.get(k) ?? 0) + by); };
const label = (n: string) => (/^Bombsite([A-Z])$/.exec(n)?.[1] ? `${/^Bombsite([A-Z])$/.exec(n)![1]} Site` : n.replace(/([a-z])([A-Z])/g, "$1 $2"));
const NADE_RU: Record<string, string> = { smoke: "смок", flash: "флешка", molotov: "молотов", he: "HE" };

/** Может ли зритель смотреть разведку на эту команду */
export async function canScout(teamId: string, viewer: Player | null): Promise<boolean> {
  if (!viewer) return false;
  if (isAdmin(viewer)) return true;
  const { data: mine } = await db().from("team_members").select("team_id").eq("player_id", viewer.id).is("left_at", null);
  const myTeams = (mine ?? []).map((r) => r.team_id);
  if (myTeams.includes(teamId)) return true;
  if (!myTeams.length) return false;
  // у моей команды есть несыгранный матч с этой командой
  const { data: m } = await db()
    .from("matches")
    .select("id, team1_id, team2_id")
    .not("status", "in", "(finished,cancelled)")
    .or(`team1_id.eq.${teamId},team2_id.eq.${teamId}`)
    .limit(50);
  return (m ?? []).some((x) => (x.team1_id === teamId && x.team2_id && myTeams.includes(x.team2_id)) || (x.team2_id === teamId && x.team1_id && myTeams.includes(x.team1_id)));
}

export async function teamScout(teamId: string, mapFilter: string | null): Promise<ScoutReport | null> {
  const { data: members } = await db().from("team_members").select("player:players(steam_id, nickname)").eq("team_id", teamId).is("left_at", null);
  const roster = new Map<string, string>();
  for (const r of (members ?? []) as unknown as { player: { steam_id: string | null; nickname: string } | null }[]) if (r.player?.steam_id) roster.set(r.player.steam_id, r.player.nickname);
  if (!roster.size) return null;

  // разборы, где играли ≥3 игрока состава
  const hits = new Map<string, { n: number; row: { id: string; title: string; map: string; created_at: string } }>();
  await Promise.all(
    [...roster.keys()].map(async (steamid) => {
      const { data } = await db().from("demo_analyses").select("id, title, map, created_at").eq("kind", "match").contains("players", [{ steamid }]).order("created_at", { ascending: false }).limit(60);
      for (const row of data ?? []) {
        const h = hits.get(row.id) ?? { n: 0, row };
        h.n++;
        hits.set(row.id, h);
      }
    }),
  );
  const games = [...hits.values()].filter((h) => h.n >= 3).map((h) => h.row).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 30);
  const files = (
    await Promise.all(
      games.map(async (g) => {
        const { data } = await db().storage.from(ANALYSIS_BUCKET).download(`scout/${g.id}.json.gz`);
        if (!data) return null;
        try {
          return { g, s: JSON.parse(gunzipSync(Buffer.from(await data.arrayBuffer())).toString()) as ScoutFile };
        } catch {
          return null;
        }
      }),
    )
  ).filter((x): x is { g: (typeof games)[number]; s: ScoutFile } => !!x);

  const mapsAll = new Map<string, { games: number; wins: number }>();
  const report: ScoutReport = {
    games: [], maps: [], map: mapFilter, plants: [], plantTime: null, players: [], insights: [],
    T: { rounds: 0, winRate: 0, spots: [], openingPlaces: [], openingWin: 0, nades: [] },
    CT: { rounds: 0, winRate: 0, spots: [], openingPlaces: [], openingWin: 0, nades: [] },
  };
  const side = { T: { rounds: 0, won: 0, spots: new Map<string, number>(), spotTotal: 0, open: new Map<string, number>(), openN: 0, openWon: 0, nades: new Map<string, { n: number; rt: number }>() }, CT: { rounds: 0, won: 0, spots: new Map<string, number>(), spotTotal: 0, open: new Map<string, number>(), openN: 0, openWon: 0, nades: new Map<string, { n: number; rt: number }>() } };
  const plants = new Map<string, number>();
  let plantSec = 0, plantN = 0, gamesOnMap = 0;
  const pl = new Map<string, { name: string; rounds: number; kills: number; entry: number; entryWin: number; awp: number; T: Map<string, number>; CT: Map<string, number>; tN: number; ctN: number }>();

  for (const { g, s } of files) {
    const ours = new Set(s.players.map((p, i) => (p.steamid && roster.has(p.steamid) ? i : -1)).filter((i) => i >= 0));
    if (ours.size < 3) continue;
    // раунды команды: выигран ли — по любой строке нашего игрока
    const roundSide = new Map<number, { side: "T" | "CT"; won: boolean }>();
    for (const r of s.rows) if (ours.has(r[0])) roundSide.set(r[1], { side: r[2], won: r[3] === 1 });
    const won = [...roundSide.values()].filter((x) => x.won).length;
    const lost = roundSide.size - won;
    const mm = mapsAll.get(s.map) ?? { games: 0, wins: 0 };
    mm.games++;
    if (won > lost) mm.wins++;
    mapsAll.set(s.map, mm);
    report.games.push({ id: g.id, title: g.title, map: s.map, date: g.created_at, won, lost });
    if (mapFilter && s.map !== mapFilter) continue;
    gamesOnMap++;

    for (const [, x] of roundSide) { side[x.side].rounds++; if (x.won) side[x.side].won++; }
    for (const r of s.rows) {
      if (!ours.has(r[0])) continue;
      const sid = s.players[r[0]].steamid!;
      const p = pl.get(sid) ?? { name: roster.get(sid) ?? s.players[r[0]].name, rounds: 0, kills: 0, entry: 0, entryWin: 0, awp: 0, T: new Map(), CT: new Map(), tN: 0, ctN: 0 };
      p.rounds++;
      p.kills += r[7];
      if (r[8] || r[9]) p.entry++;
      if (r[8]) p.entryWin++;
      if (r[6]) p.awp++;
      if (r[4]) { inc(p[r[2]], r[4]); if (r[2] === "T") p.tN++; else p.ctN++; inc(side[r[2]].spots, r[4]); side[r[2]].spotTotal++; }
      pl.set(sid, p);
    }
    for (const o of s.openings) {
      const ourKiller = ours.has(o[1]), ourVictim = ours.has(o[2]);
      if (!ourKiller && !ourVictim) continue;
      const sd = roundSide.get(o[0])?.side;
      if (!sd) continue;
      side[sd].openN++;
      if (ourKiller) side[sd].openWon++;
      inc(side[sd].open, ourKiller ? o[3] : o[4]);
    }
    for (const n of s.nades) {
      if (!ours.has(n[0]) || !n[2] || !n[4]) continue;
      const k = `${n[3]}|${n[4]}`;
      const v = side[n[2]].nades.get(k) ?? { n: 0, rt: 0 };
      v.n++;
      v.rt += n[5];
      side[n[2]].nades.set(k, v);
    }
    for (const p of s.plants) {
      if (roundSide.get(p[0])?.side !== "T" || !p[2]) continue;
      inc(plants, p[2]);
      plantSec += p[3];
      plantN++;
    }
  }

  report.maps = [...mapsAll.entries()].map(([map, v]) => ({ map, ...v })).sort((a, b) => b.games - a.games);
  for (const sd of ["T", "CT"] as const) {
    const x = side[sd];
    report[sd] = {
      rounds: x.rounds,
      winRate: pctOf(x.won, x.rounds),
      spots: top(x.spots, x.spotTotal, 8).map((c) => ({ ...c, name: label(c.name) })),
      openingPlaces: top(x.open, x.openN, 5).map((c) => ({ ...c, name: label(c.name) })),
      openingWin: pctOf(x.openWon, x.openN),
      nades: [...x.nades.entries()]
        .map(([k, v]) => ({ type: NADE_RU[k.split("|")[0]] ?? k.split("|")[0], to: label(k.split("|")[1]), n: v.n, perGame: Math.round((v.n / Math.max(1, gamesOnMap)) * 10) / 10, rt: Math.round(v.rt / v.n) }))
        .sort((a, b) => b.n - a.n)
        .slice(0, 10),
    };
  }
  report.plants = top(plants, plantN, 4).map((c) => ({ ...c, name: label(c.name) }));
  report.plantTime = plantN ? Math.round(plantSec / plantN) : null;
  report.players = [...pl.entries()]
    .map(([steamid, p]) => ({
      steamid, name: p.name, rounds: p.rounds, kpr: Math.round((p.kills / Math.max(1, p.rounds)) * 100) / 100,
      entry: pctOf(p.entry, p.rounds), entryWin: pctOf(p.entryWin, p.entry), awp: pctOf(p.awp, p.rounds),
      spotsT: top(p.T, p.tN, 3).map((c) => ({ ...c, name: label(c.name) })), spotsCT: top(p.CT, p.ctN, 3).map((c) => ({ ...c, name: label(c.name) })),
    }))
    .sort((a, b) => b.rounds - a.rounds);

  // выводы простыми словами
  const ins = report.insights;
  if (report.plants[0] && report.plants[0].share >= 60 && plantN >= 5) ins.push(`В атаке чаще всего закладывают на ${report.plants[0].name} — ${report.plants[0].share}% закладок (в среднем на ${report.plantTime} с раунда).`);
  const entry = [...report.players].filter((p) => p.rounds >= 10).sort((a, b) => b.entry - a.entry)[0];
  if (entry && entry.entry >= 20) ins.push(`Первым в бой чаще всех идёт ${entry.name} — в ${entry.entry}% раундов, выигрывает ${entry.entryWin}% первых дуэлей.`);
  const awper = [...report.players].sort((a, b) => b.awp - a.awp)[0];
  if (awper && awper.awp >= 25) ins.push(`AWP у ${awper.name} — в ${awper.awp}% раундов.${awper.spotsCT[0] ? ` В защите обычно стоит на ${awper.spotsCT[0].name}.` : ""}`);
  if (report.T.openingPlaces[0] && report.T.openingPlaces[0].share >= 35) ins.push(`В атаке первая дуэль чаще всего на ${report.T.openingPlaces[0].name} (${report.T.openingPlaces[0].share}%) — там их и ждать.`);
  if (report.CT.openingPlaces[0] && report.CT.openingPlaces[0].share >= 35) ins.push(`В защите первая дуэль чаще всего на ${report.CT.openingPlaces[0].name} (${report.CT.openingPlaces[0].share}%).`);
  if (report.T.rounds >= 10 && report.CT.rounds >= 10 && Math.abs(report.T.winRate - report.CT.winRate) >= 15) ins.push(report.T.winRate > report.CT.winRate ? `Сильнее в атаке: ${report.T.winRate}% раундов против ${report.CT.winRate}% в защите.` : `Сильнее в защите: ${report.CT.winRate}% раундов против ${report.T.winRate}% в атаке.`);
  const nade = report.T.nades[0];
  if (nade && nade.perGame >= 1.5) ins.push(`Любимая граната в атаке — ${nade.type} на ${nade.to}: ${nade.perGame} за карту, примерно на ${nade.rt} с раунда.`);
  return report;
}
