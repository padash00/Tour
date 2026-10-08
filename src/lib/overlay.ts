/**
 * Оверлей трансляции (OBS → Browser Source, /overlay): какой матч показывать и что о нём отдать наружу.
 * Чистые функции без базы — их проверяет scripts/test-overlay.mts; запросы живут в /api/public/overlay.
 * Наружу уходит только публичное: названия, теги и логотипы команд, счёт, карты, этап, название турнира.
 * Ни адреса и пароля сервера, ни игроков, ни анкет.
 */
import { roundTitle, type Side } from "./bracket";
import { mapLabel } from "./maps";

export type OverlayTeam = { name: string; tag: string; logo: string | null };

export type OverlayMap = {
  number: number;
  name: string;
  status: "pending" | "live" | "finished";
  score1: number;
  score2: number;
  /** кто взял карту: 1 / 2 / ещё никто */
  winner: 1 | 2 | null;
  /** чей пик: 1 / 2 / null — decider (в BO1 единственная карта тоже без пика) */
  pick: 1 | 2 | null;
};

export type OverlayMatch = {
  id: string;
  status: "live" | "ready" | "veto" | "upcoming" | "pending";
  tournament: string;
  stage: string;
  bestOf: number;
  team1: OverlayTeam;
  team2: OverlayTeam;
  /** счёт серии — выигранные карты (в гранд-финале с форой — вместе с форой) */
  series1: number;
  series2: number;
  scheduledAt: string | null;
  maps: OverlayMap[];
  /** идущая карта; между картами — null, тогда next — следующая по порядку */
  current: OverlayMap | null;
  next: OverlayMap | null;
};

export type OverlayPayload = {
  /** live — идёт игра; upcoming — матч назначен, но ещё не начался; none — показывать нечего */
  state: "live" | "upcoming" | "none";
  match: OverlayMatch | null;
  updated_at: string;
};

// ───────────────────────── выбор матча

export type MatchCandidate = {
  id: string;
  status: string;
  number: number;
  team1_id: string | null;
  team2_id: string | null;
  scheduled_at: string | null;
};

const UPCOMING = ["ready", "veto", "upcoming", "pending"] as const;
const UPCOMING_RANK: Record<string, number> = { ready: 0, veto: 1, upcoming: 2, pending: 3 };

/**
 * Какой матч показать: первый идущий, иначе ближайший назначенный — готов к игре → вето → по расписанию.
 * Матчи без обеих команд (TBD) не показываем: на трансляции «TBD vs TBD» бесполезно.
 */
export function pickOverlayMatch<T extends MatchCandidate>(rows: T[]): T | null {
  const live = rows.filter((m) => m.status === "live").sort((a, b) => a.number - b.number)[0];
  if (live) return live;
  const time = (m: T) => (m.scheduled_at ? Date.parse(m.scheduled_at) : Number.POSITIVE_INFINITY);
  return (
    rows
      .filter((m) => (UPCOMING as readonly string[]).includes(m.status) && m.team1_id && m.team2_id)
      .sort((a, b) => UPCOMING_RANK[a.status] - UPCOMING_RANK[b.status] || time(a) - time(b) || a.number - b.number)[0] ?? null
  );
}

// ───────────────────────── подпись этапа

/** Как matchStage на сайте: «Полуфинал», «Матч за 3-е место», «Группа A · тур 2» */
export function overlayStage(m: { bracket: string; round: number; group_label?: string | null }, all: { bracket: string; round: number }[]) {
  if (m.bracket === "group") return `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`;
  if (m.bracket === "swiss") return `Швейцарка · раунд ${m.round}`;
  const upper = Math.max(0, ...all.filter((x) => x.bracket === "upper").map((x) => x.round));
  const lower = Math.max(0, ...all.filter((x) => x.bracket === "lower").map((x) => x.round));
  // «Гранд-финал · фора 1:0» — фора видна по счёту, на оверлее хватит «Гранд-финал»
  return roundTitle(m.bracket as Side, m.round, upper, lower).replace(/ · фора.*$/, "");
}

// ───────────────────────── сборка ответа

export type OverlaySource = {
  match: {
    id: string;
    status: string;
    bracket: string;
    round: number;
    group_label?: string | null;
    best_of: number;
    team1_id: string | null;
    team2_id: string | null;
    team1_score: number;
    team2_score: number;
    scheduled_at: string | null;
  };
  tournament: { name: string } | null;
  teams: { id: string; name: string; tag: string; logo_url: string | null }[];
  maps: { map_number: number; map_name: string; status: string; team1_score: number; team2_score: number; winner_id: string | null; picked_by: string | null }[];
  /** bracket/round всех матчей турнира — для «Финал верхней сетки» и т.п. */
  rounds: { bracket: string; round: number }[];
  /** готовая подпись этапа (игра лобби — не матч сетки) */
  stage?: string;
};

const TBD: OverlayTeam = { name: "TBD", tag: "TBD", logo: null };
const MAP_STATUS = new Set(["pending", "live", "finished"]);

/** Только https-логотипы: на трансляцию не должен попасть data:/javascript: или локальный путь */
function safeLogo(url: string | null) {
  return url && /^https:\/\//i.test(url) ? url : null;
}

export function shapeOverlay(src: OverlaySource | null, now = new Date()): OverlayPayload {
  const updated_at = now.toISOString();
  if (!src) return { state: "none", match: null, updated_at };
  const m = src.match;
  if (m.status === "finished" || m.status === "cancelled") return { state: "none", match: null, updated_at };

  const byId = new Map(src.teams.map((t) => [t.id, t]));
  const team = (id: string | null): OverlayTeam => {
    const t = id ? byId.get(id) : null;
    return t ? { name: t.name, tag: t.tag, logo: safeLogo(t.logo_url) } : TBD;
  };
  const side = (id: string | null): 1 | 2 | null => (!id ? null : id === m.team1_id ? 1 : id === m.team2_id ? 2 : null);

  const maps: OverlayMap[] = [...src.maps]
    .sort((a, b) => a.map_number - b.map_number)
    .map((x) => ({
      number: x.map_number,
      name: mapLabel(x.map_name),
      status: (MAP_STATUS.has(x.status) ? x.status : "pending") as OverlayMap["status"],
      score1: x.team1_score,
      score2: x.team2_score,
      winner: x.status === "finished" ? side(x.winner_id) ?? (x.team1_score > x.team2_score ? 1 : x.team2_score > x.team1_score ? 2 : null) : null,
      pick: side(x.picked_by),
    }));

  const live = m.status === "live";
  const current = live ? maps.find((x) => x.status === "live") ?? null : null;
  const next = current ? null : maps.find((x) => x.status === "pending") ?? null;
  const status = (live ? "live" : (UPCOMING as readonly string[]).includes(m.status) ? m.status : "pending") as OverlayMatch["status"];

  return {
    state: live ? "live" : "upcoming",
    match: {
      id: m.id,
      status,
      tournament: src.tournament?.name ?? "F16 Arena",
      stage: src.stage ?? overlayStage(m, src.rounds),
      bestOf: m.best_of,
      team1: team(m.team1_id),
      team2: team(m.team2_id),
      series1: m.team1_score,
      series2: m.team2_score,
      scheduledAt: m.scheduled_at,
      maps,
      current,
      next,
    },
    updated_at,
  };
}

// ───────────────────────── разбор параметров

export type OverlayQuery = { server: string } | { match: string } | { tournament: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** ?server=CS2-01 | ?match=<uuid> | ?tournament=<slug>; мусор — null (400) */
export function parseOverlayQuery(params: URLSearchParams): OverlayQuery | null {
  const server = params.get("server")?.trim().toUpperCase();
  if (server) return /^CS2-\d{2}$/.test(server) ? { server } : null;
  const match = params.get("match")?.trim();
  if (match) return UUID.test(match) ? { match } : null;
  const tournament = params.get("tournament")?.trim().toLowerCase();
  if (tournament) return /^[a-z0-9-]{1,64}$/.test(tournament) ? { tournament } : null;
  return null;
}

// ───────────────────────── демо-данные (?mock=… только вне production)

export function mockOverlay(kind: string, now = new Date()): OverlayPayload {
  const long = kind === "long"; // проверка обрезки длинных названий
  const between = kind === "break"; // перерыв между картами
  const team1 = { id: "t1", name: long ? "Евразийский национальный университет им. Гумилёва" : "Astana Wolves", tag: long ? "ENU" : "AWL", logo_url: null };
  const team2 = { id: "t2", name: long ? "Колледж информационных технологий" : "Qazaq Reapers", tag: "QZR", logo_url: null };
  if (kind === "none") return shapeOverlay(null, now);
  // часы сдвигают счёт идущей карты — видно анимацию цифр
  const tick = Math.floor(now.getTime() / 4000) % 14;
  const upcoming = kind === "idle";
  const bo1 = kind === "bo1";
  return shapeOverlay(
    {
      match: {
        id: "00000000-0000-0000-0000-000000000000",
        status: upcoming ? "ready" : "live",
        bracket: "upper",
        round: kind === "final" ? 3 : 2,
        best_of: bo1 ? 1 : 3,
        team1_id: "t1",
        team2_id: "t2",
        team1_score: upcoming || bo1 ? 0 : 1,
        team2_score: between ? 1 : 0,
        scheduled_at: new Date(now.getTime() + 25 * 60_000).toISOString(),
      },
      tournament: { name: "F16 Arena Open Cup 2026" },
      teams: [team1, team2],
      maps: upcoming
        ? []
        : bo1
          ? [{ map_number: 1, map_name: "de_inferno", status: "live", team1_score: 4 + Math.floor(tick / 2), team2_score: 3 + Math.ceil(tick / 2), winner_id: null, picked_by: null }]
          : [
              { map_number: 1, map_name: "de_ancient", status: "finished", team1_score: 13, team2_score: 9, winner_id: "t1", picked_by: "t1" },
              between
                ? { map_number: 2, map_name: "de_mirage", status: "finished", team1_score: 10, team2_score: 13, winner_id: "t2", picked_by: "t2" }
                : { map_number: 2, map_name: "de_mirage", status: "live", team1_score: 5 + Math.floor(tick / 2), team2_score: 6 + Math.ceil(tick / 2), winner_id: null, picked_by: "t2" },
              { map_number: 3, map_name: "de_nuke", status: "pending", team1_score: 0, team2_score: 0, winner_id: null, picked_by: null },
            ],
      rounds: [
        { bracket: "upper", round: 1 },
        { bracket: "upper", round: 2 },
        { bracket: "upper", round: 3 },
      ],
    },
    now,
  );
}
