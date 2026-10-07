// Симуляция карты CS2 для демо-турнира: раунды MR12 (до 13 побед, овертаймы MR3 при 12:12), убийства с
// оружием, хедшоты, ассисты и флеш-ассисты, урон гранатами, установка и разминирование бомбы.
// На выходе — то же, что присылает сервер: строки HTTP-лога CS2 (для Swing и оружия номинаций) и
// накопительная статистика игроков в формате событий MatchZy (round_end / map_result).
// Чистые функции: без базы и сети, случайность — из переданного генератора (воспроизводимо по зерну).

export type Rng = () => number;

/** mulberry32 — маленький детерминированный генератор */
export function rngFrom(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const pick = <T,>(rng: Rng, list: readonly T[]): T => list[Math.floor(rng() * list.length)];
const int = (rng: Rng, min: number, max: number) => min + Math.floor(rng() * (max - min + 1));
function weighted<T>(rng: Rng, list: readonly T[], weight: (x: T) => number): T {
  const total = list.reduce((s, x) => s + Math.max(0.0001, weight(x)), 0);
  let r = rng() * total;
  for (const x of list) {
    r -= Math.max(0.0001, weight(x));
    if (r <= 0) return x;
  }
  return list[list.length - 1];
}

export type Role = "igl" | "entry" | "awp" | "rifle" | "support";
export const ROLES: Role[] = ["igl", "entry", "awp", "rifle", "support"];

export type SimPlayer = { steamId: string; name: string; role: Role; skill: number };
export type SimTeam = { name: string; strength: number; players: SimPlayer[] };
export type Side = "CT" | "T";
export type TeamKey = "team1" | "team2";

/** Ключи статистики — как в отчёте MatchZy (src/lib/server/matchzy-events.ts → upsertPlayerStats) */
const STAT_KEYS = [
  "kills", "deaths", "assists", "damage", "headshot_kills", "rounds_played", "kast",
  "first_kills_t", "first_kills_ct", "first_deaths_t", "first_deaths_ct", "trade_kills",
  "1v1", "1v2", "1v3", "1v4", "1v5", "2k", "3k", "4k", "5k",
  "utility_damage", "enemies_flashed", "flash_assists", "bomb_plants", "bomb_defuses", "mvp",
] as const;
type Stats = Record<(typeof STAT_KEYS)[number], number>;
const emptyStats = (): Stats => Object.fromEntries(STAT_KEYS.map((k) => [k, 0])) as Stats;

export type StatsTeamPayload = { name: string; score: number; players: { steamid: string; name: string; stats: Record<string, number> }[] };

export type SimRound = {
  number: number;
  winner: TeamKey;
  winnerSide: Side;
  /** код причины MatchZy (для полноты события; сайт его не использует) */
  reason: number;
  score1: number;
  score2: number;
  /** строки HTTP-лога CS2 этого раунда (Round_Start … Round_End) */
  log: string[];
  team1: StatsTeamPayload;
  team2: StatsTeamPayload;
};

export type SimMap = { rounds: SimRound[]; winner: TeamKey; score1: number; score2: number; overtime: boolean };

const STEAM_BASE = BigInt("76561197960265728");
const accountId = (steam64: string) => (BigInt(steam64) - STEAM_BASE).toString();

/** Оружие убийства в логе CS2 по роли, стороне и экономике раунда */
function weaponFor(rng: Rng, role: Role, side: Side, pistolRound: boolean, eco: boolean) {
  if (pistolRound || eco) {
    const r = rng();
    if (r < 0.25) return "deagle";
    return side === "CT" ? "usp_silencer" : "glock";
  }
  const r = rng();
  if (role === "awp") {
    if (r < 0.62) return "awp";
    if (r < 0.7) return "ssg08";
    if (r < 0.8) return "deagle";
  } else if (r < 0.03) return "ssg08";
  else if (r < 0.08) return "deagle";
  else if (r < 0.1) return side === "CT" ? "usp_silencer" : "glock";
  if (side === "T") return "ak47";
  return rng() < 0.55 ? "m4a1_silencer" : "m4a1";
}

function headshotChance(weapon: string, skill: number) {
  const base = weapon === "awp" || weapon === "ssg08" ? 0.08 : weapon === "deagle" ? 0.55 : weapon === "usp_silencer" || weapon === "glock" ? 0.6 : 0.45;
  return Math.min(0.9, base * (0.8 + 0.25 * skill));
}

const pad = (n: number) => String(n).padStart(2, "0");
function stamp(at: Date) {
  return `L ${pad(at.getUTCMonth() + 1)}/${pad(at.getUTCDate())}/${at.getUTCFullYear()} - ${pad(at.getUTCHours())}:${pad(at.getUTCMinutes())}:${pad(at.getUTCSeconds())}:`;
}

/**
 * Карта целиком. team1StartsCT — сторона team1 в первой половине. strength — общий уровень команды
 * (около 1.0); форма команды на этой карте немного плавает.
 */
export function simulateMap({ team1, team2, rng, team1StartsCT, startAt = new Date() }: {
  team1: SimTeam;
  team2: SimTeam;
  rng: Rng;
  team1StartsCT: boolean;
  startAt?: Date;
}): SimMap {
  const teams: Record<TeamKey, SimTeam> = { team1, team2 };
  const form = { team1: team1.strength * (0.94 + 0.12 * rng()), team2: team2.strength * (0.94 + 0.12 * rng()) };
  const stats = new Map<string, Stats>();
  const slot = new Map<string, number>();
  for (const [i, p] of [...team1.players, ...team2.players].entries()) {
    stats.set(p.steamId, emptyStats());
    slot.set(p.steamId, i + 2);
  }
  const rounds: SimRound[] = [];
  let score = { team1: 0, team2: 0 };
  let clock = startAt.getTime();
  let lastWinner: TeamKey | null = null;
  let streak = 0;

  /** Сторона team1 в раунде n: половины по 12, овертаймы по 3 (первая половина овертайма — как конец основного) */
  const team1Side = (n: number): Side => {
    const first: Side = team1StartsCT ? "CT" : "T";
    const other: Side = first === "CT" ? "T" : "CT";
    if (n <= 12) return first;
    if (n <= 24) return other;
    const half = Math.floor((n - 25) / 3);
    return half % 2 === 0 ? other : first;
  };

  const over = () => {
    const { team1: a, team2: b } = score;
    if (a + b <= 24) return a === 13 || b === 13;
    // овертайм MR3: блок из 6 раундов, побеждает набравший 4 в блоке; 3:3 — следующий овертайм
    const block = Math.floor((a + b - 25) / 6);
    const base = 12 + 3 * block;
    return a >= base + 4 || b >= base + 4;
  };

  for (let n = 1; !over(); n++) {
    const sides: Record<TeamKey, Side> = { team1: team1Side(n), team2: team1Side(n) === "CT" ? "T" : "CT" };
    const sideTeam = (s: Side): TeamKey => (sides.team1 === s ? "team1" : "team2");
    const pistol = n === 1 || n === 13;
    const afterPistol = n === 2 || n === 14;

    // кто берёт раунд: уровень команд, небольшой перевес CT, экономика после пистолетки, серия
    let p1 = 1 / (1 + Math.exp(-4.2 * (form.team1 - form.team2)));
    p1 += sides.team1 === "CT" ? 0.03 : -0.03;
    if (afterPistol && lastWinner) p1 += lastWinner === "team1" ? 0.22 : -0.22;
    if (lastWinner && streak >= 3) p1 += lastWinner === "team1" ? -0.04 : 0.04; // проигравшие копят на полный закуп
    p1 = Math.min(0.92, Math.max(0.08, p1));
    const winner: TeamKey = rng() < p1 ? "team1" : "team2";
    const loser: TeamKey = winner === "team1" ? "team2" : "team1";
    const winnerSide = sides[winner];
    const ecoTeam: TeamKey | null = afterPistol && lastWinner ? (lastWinner === "team1" ? "team2" : "team1") : null;

    // как закончится раунд
    type Outcome = "elim" | "bomb" | "defuse" | "time";
    let outcome: Outcome;
    const r = rng();
    if (winnerSide === "T") outcome = r < 0.58 ? "elim" : "bomb";
    else outcome = r < 0.58 ? "elim" : r < 0.82 ? "defuse" : "time";
    const loserDeaths = outcome === "elim" ? 5 : outcome === "bomb" ? int(rng, 0, 4) : outcome === "defuse" ? int(rng, 2, 5) : int(rng, 0, 3);
    const winnerDeaths = Math.min(4, weighted(rng, [0, 1, 2, 3, 4], (k) => [0.22, 0.32, 0.25, 0.14, 0.07][k]));

    const alive: Record<TeamKey, SimPlayer[]> = { team1: [...team1.players], team2: [...team2.players] };
    const roundKills = new Map<string, number>();
    const contributed = new Set<string>(); // K, A или T (выжившие добавятся в конце)
    const lines: string[] = [];
    const t = () => new Date((clock += int(rng, 2, 9) * 1000));
    const actor = (p: SimPlayer, side: Side) => `"${p.name}<${slot.get(p.steamId)}><[U:1:${accountId(p.steamId)}]><${side === "CT" ? "CT" : "TERRORIST"}>"`;
    const pos = () => `[${int(rng, -2000, 2000)} ${int(rng, -2000, 2000)} ${int(rng, -200, 200)}]`;
    lines.push(`${stamp(new Date((clock += 15_000)))} World triggered "Round_Start"`);

    // порядок смертей: в «elim» последней погибает проигравшая сторона
    const deaths: TeamKey[] = [...Array(loserDeaths).fill(loser), ...Array(winnerDeaths).fill(winner)];
    for (let i = deaths.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [deaths[i], deaths[j]] = [deaths[j], deaths[i]];
    }
    if (outcome === "elim" && deaths[deaths.length - 1] !== loser) {
      const k = deaths.lastIndexOf(loser);
      [deaths[k], deaths[deaths.length - 1]] = [deaths[deaths.length - 1], deaths[k]];
    }
    const plantAt = outcome === "bomb" || outcome === "defuse" ? int(rng, 0, Math.max(0, deaths.length - 1)) : -1;
    let planted = false;
    let clutch: { player: SimPlayer; team: TeamKey; vs: number } | null = null;
    let lastKill: { killer: SimPlayer; killerTeam: TeamKey; at: number } | null = null;
    let first = true;

    const plant = () => {
      const tTeam = sideTeam("T");
      if (!alive[tTeam].length || planted) return;
      const planter = weighted(rng, alive[tTeam], (p) => (p.role === "support" || p.role === "igl" ? 2 : 1));
      planted = true;
      stats.get(planter.steamId)!.bomb_plants++;
      lines.push(`${stamp(t())} ${actor(planter, "T")} triggered "Planted_The_Bomb" at bombsite ${rng() < 0.5 ? "A" : "B"}`);
    };

    for (const [i, victimTeam] of deaths.entries()) {
      if (i === plantAt) plant();
      const killerTeam: TeamKey = victimTeam === "team1" ? "team2" : "team1";
      if (!alive[victimTeam].length || !alive[killerTeam].length) break;
      const victim = weighted(rng, alive[victimTeam], (p) => 1.6 - p.skill * 0.6 + (first && p.role === "entry" ? 1.5 : 0));
      const killer = weighted(rng, alive[killerTeam], (p) => p.skill ** 2 * (first && (p.role === "entry" || p.role === "awp") ? 2.2 : 1));
      const kSide = sides[killerTeam];
      const vSide = sides[victimTeam];
      const weapon = weaponFor(rng, killer.role, kSide, pistol, ecoTeam === killerTeam);
      const hs = rng() < headshotChance(weapon, killer.skill);
      lines.push(`${stamp(t())} ${actor(killer, kSide)} ${pos()} killed ${actor(victim, vSide)} ${pos()} with "${weapon}"${hs ? " (headshot)" : ""}`);
      const ks = stats.get(killer.steamId)!;
      const vs = stats.get(victim.steamId)!;
      ks.kills++;
      if (hs) ks.headshot_kills++;
      vs.deaths++;
      roundKills.set(killer.steamId, (roundKills.get(killer.steamId) ?? 0) + 1);
      contributed.add(killer.steamId);
      let dealt = 100;
      // ассист (иногда флеш)
      const mates = alive[killerTeam].filter((p) => p !== killer);
      if (mates.length && rng() < 0.27) {
        const assister = weighted(rng, mates, (p) => (p.role === "support" ? 2.4 : p.role === "igl" ? 1.5 : 1));
        const flash = rng() < (assister.role === "support" ? 0.35 : 0.12);
        lines.push(`${stamp(t())} ${actor(assister, kSide)} ${flash ? "flash-assisted" : "assisted"} killing ${actor(victim, vSide)}`);
        const as = stats.get(assister.steamId)!;
        if (flash) {
          as.flash_assists++;
          as.enemies_flashed++;
        } else {
          as.assists++;
          const part = int(rng, 30, 60);
          as.damage += part;
          dealt -= part;
        }
        contributed.add(assister.steamId);
      }
      ks.damage += dealt;
      // первое убийство раунда
      if (first) {
        ks[kSide === "CT" ? "first_kills_ct" : "first_kills_t"]++;
        vs[vSide === "CT" ? "first_deaths_ct" : "first_deaths_t"]++;
        first = false;
      }
      // размен: жертва только что убила игрока команды убийцы
      if (lastKill && lastKill.killer === victim && lastKill.killerTeam === victimTeam && i - lastKill.at <= 2) {
        ks.trade_kills++;
      }
      lastKill = { killer, killerTeam, at: i };
      alive[victimTeam] = alive[victimTeam].filter((p) => p !== victim);
      // последний живой против нескольких — попытка клатча
      for (const side of ["team1", "team2"] as const) {
        const other = side === "team1" ? "team2" : "team1";
        if (!clutch && alive[side].length === 1 && alive[other].length >= 1) clutch = { player: alive[side][0], team: side, vs: alive[other].length };
      }
    }
    if (outcome !== "elim" && !planted && plantAt >= 0) plant();
    if (outcome === "defuse") {
      const ctTeam = sideTeam("CT");
      const defuser = alive[ctTeam].length ? pick(rng, alive[ctTeam]) : null;
      if (defuser) {
        stats.get(defuser.steamId)!.bomb_defuses++;
        lines.push(`${stamp(t())} ${actor(defuser, "CT")} triggered "Defused_The_Bomb"`);
      }
    }
    const notice =
      outcome === "bomb" ? "SFUI_Notice_Target_Bombed" : outcome === "defuse" ? "SFUI_Notice_Bomb_Defused" : outcome === "time" ? "SFUI_Notice_Target_Saved" : winnerSide === "CT" ? "SFUI_Notice_CTs_Win" : "SFUI_Notice_Terrorists_Win";
    score = { ...score, [winner]: score[winner] + 1 };
    const ctScore = sides.team1 === "CT" ? score.team1 : score.team2;
    const tScore = sides.team1 === "CT" ? score.team2 : score.team1;
    lines.push(`${stamp(t())} Team "${winnerSide === "CT" ? "CT" : "TERRORIST"}" triggered "${notice}" (CT "${ctScore}") (T "${tScore}")`);
    lines.push(`${stamp(new Date(clock))} World triggered "Round_End"`);

    // итоги раунда игрокам
    for (const key of ["team1", "team2"] as const) {
      for (const p of teams[key].players) {
        const s = stats.get(p.steamId)!;
        s.rounds_played++;
        const survived = alive[key].includes(p);
        if (survived || contributed.has(p.steamId)) s.kast++;
        const k = roundKills.get(p.steamId) ?? 0;
        if (k >= 2) s[`${Math.min(5, k)}k` as "2k"]++;
        // урон без убийства и гранаты
        s.damage += int(rng, 0, 18);
        const nadeChance = p.role === "support" ? 0.62 : p.role === "igl" ? 0.4 : 0.25;
        if (rng() < nadeChance) s.utility_damage += int(rng, 4, p.role === "support" ? 42 : 28);
        if (rng() < (p.role === "support" ? 0.5 : 0.2)) s.enemies_flashed += int(rng, 1, 2);
      }
    }
    if (clutch && clutch.team === winner && clutch.vs >= 1) stats.get(clutch.player.steamId)![`1v${Math.min(5, clutch.vs)}` as "1v1"]++;
    const mvp = [...teams[winner].players].sort((a, b) => (roundKills.get(b.steamId) ?? 0) - (roundKills.get(a.steamId) ?? 0))[0];
    stats.get(mvp.steamId)!.mvp++;

    const payload = (key: TeamKey): StatsTeamPayload => ({
      name: teams[key].name,
      score: score[key],
      players: teams[key].players.map((p) => ({ steamid: p.steamId, name: p.name, stats: { ...stats.get(p.steamId)! } })),
    });
    const reason = outcome === "bomb" ? 1 : outcome === "defuse" ? 7 : outcome === "time" ? 12 : winnerSide === "CT" ? 8 : 9;
    rounds.push({ number: n, winner, winnerSide, reason, score1: score.team1, score2: score.team2, log: lines, team1: payload("team1"), team2: payload("team2") });
    streak = lastWinner === winner ? streak + 1 : 1;
    lastWinner = winner;
    clock += 5000;
    if (rounds.length > 60) break; // страховка от бесконечного овертайма
  }
  return {
    rounds,
    winner: score.team1 > score.team2 ? "team1" : "team2",
    score1: score.team1,
    score2: score.team2,
    overtime: score.team1 + score.team2 > 24,
  };
}
