/**
 * Экран перерыва трансляции (/broadcast в OBS): что показать зрителям между картами и матчами.
 * Чистые функции без базы — их проверяет scripts/test-broadcast.mts; запросы живут в /api/public/broadcast.
 * Наружу уходит только публичное (как на странице турнира): команды, счёт, карты, этап, расписание,
 * ники и статистика игроков. Ни адресов и паролей серверов, ни анкет.
 */
import { THIRD_PLACE_TITLE, roundTitle, type Side } from "./bracket";
import { mapLabel } from "./maps";

// ───────────────────────── типы ответа

export type BcTeam = { id: string; name: string; tag: string; logo: string | null };

export type BcMap = { number: number; name: string; status: "pending" | "live" | "finished"; score1: number; score2: number; winner: 1 | 2 | null };

export type BcStatus = "pending" | "upcoming" | "veto" | "ready" | "live" | "finished";

export type BcMatch = {
  id: string;
  number: number;
  status: BcStatus;
  bracket: Side;
  round: number;
  position: number;
  stage: string;
  bestOf: number;
  team1: BcTeam | null;
  team2: BcTeam | null;
  /** счёт серии (карты) */
  score1: number;
  score2: number;
  winner: 1 | 2 | null;
  /** проход без игры: соперника нет */
  bye: boolean;
  scheduledAt: string | null;
  /** сервер: готов / готовится / не выдан */
  server: "ready" | "loading" | null;
  /** карты серии — только у идущих матчей */
  maps: BcMap[];
  /** BO1: счёт раундов единственной карты — на трансляции он понятнее, чем «1:0» */
  rounds: [number, number] | null;
  current: BcMap | null;
};

export type BcStanding = { team: BcTeam; wins: number; losses: number; mapDiff: number; roundDiff: number; status: "active" | "advanced" | "eliminated" };
export type BcGroup = { label: string | null; rows: BcStanding[] };

export type BcLeader = { name: string; avatar: string | null; team: string | null; rating: number; kd: number; adr: number; maps: number; swing: number | null };

export type BcBracket = {
  /** se — одиночная, de — двойная, none — плей-офф ещё нет */
  kind: "se" | "de" | "none";
  /** колонки верхней сетки по раундам (в SE — вся сетка) */
  upper: BcMatch[][];
  lower: BcMatch[][];
  /** гранд-финал DE */
  final: BcMatch | null;
  third: BcMatch | null;
};

export type BcSchedule = {
  /** идут */
  now: BcMatch[];
  /** следующие: сервер готов или идёт вето */
  next: BcMatch[];
  /** ждут старта: обе команды известны */
  soon: BcMatch[];
  /** сыгранные матчи текущего раунда */
  results: BcMatch[];
};

export type BroadcastPayload = {
  tournament: { id: string; slug: string; name: string; status: string; stage: string; sponsors: string[] } | null;
  bracket: BcBracket;
  groups: BcGroup[];
  schedule: BcSchedule;
  live: BcMatch[];
  leaders: BcLeader[];
  mvp: (BcLeader & { by: "swing" | "rating" }) | null;
  updated_at: string;
};

// ───────────────────────── сцены

export const SCENES = ["bracket", "schedule", "live", "stats"] as const;
export type Scene = (typeof SCENES)[number];

export const SCENE_TITLE: Record<Scene, string> = {
  bracket: "Сетка",
  schedule: "Расписание",
  live: "Идут матчи",
  stats: "Лидеры",
};

export type BroadcastParams = {
  tournament: string | null;
  scene: Scene | "auto";
  /** секунд на сцену в авторежиме */
  interval: number;
  lower: boolean;
  footer: string | null;
};

/** ?tournament=<slug>&scene=bracket|schedule|live|stats|auto&interval=15&lower=1&footer=… — мусор заменяется умолчаниями */
export function parseBroadcastParams(params: URLSearchParams): BroadcastParams {
  const slug = params.get("tournament")?.trim().toLowerCase() ?? "";
  const scene = params.get("scene")?.trim().toLowerCase() ?? "";
  const n = Number(params.get("interval"));
  const footer = (params.get("footer") ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  return {
    tournament: /^[a-z0-9-]{1,64}$/.test(slug) ? slug : null,
    scene: (SCENES as readonly string[]).includes(scene) ? (scene as Scene) : "auto",
    interval: Number.isFinite(n) && n > 0 ? Math.round(Math.min(300, Math.max(5, n))) : 15,
    lower: params.get("lower") === "1",
    footer: footer || null,
  };
}

/** Сцены, которым есть что показать — в этом порядке их крутит авторежим */
export function availableScenes(p: BroadcastPayload): Scene[] {
  const out: Scene[] = [];
  if (p.bracket.kind !== "none" || p.groups.some((g) => g.rows.length)) out.push("bracket");
  const s = p.schedule;
  if (s.now.length || s.next.length || s.soon.length || s.results.length) out.push("schedule");
  if (p.live.length) out.push("live");
  if (p.leaders.length) out.push("stats");
  return out;
}

/** Следующая сцена авторежима: по кругу среди доступных; пропавшая текущая — с начала круга */
export function nextScene(available: Scene[], current: Scene | null): Scene | null {
  if (!available.length) return null;
  if (!current) return available[0];
  const at = available.indexOf(current);
  if (at < 0) {
    // текущая опустела — следующая по общему порядку после неё
    const order = SCENES.indexOf(current);
    return available.find((s) => SCENES.indexOf(s) > order) ?? available[0];
  }
  return available[(at + 1) % available.length];
}

// ───────────────────────── выбор турнира

const PICK_RANK: Record<string, number> = { live: 0, checkin: 1, registration_closed: 2, registration: 3 };

/**
 * Турнир по умолчанию: идущий → check-in → регистрация закрыта → регистрация (как /api/public/featured),
 * среди равных — ближайший по старту; если активных нет — последний завершённый. Черновики не показываются.
 */
export function pickBroadcastTournament<T extends { status: string; starts_at: string | null }>(rows: T[]): T | null {
  const time = (t: T) => (t.starts_at ? Date.parse(t.starts_at) : Number.POSITIVE_INFINITY);
  const active = rows.filter((t) => t.status in PICK_RANK).sort((a, b) => PICK_RANK[a.status] - PICK_RANK[b.status] || time(a) - time(b));
  if (active[0]) return active[0];
  const done = rows.filter((t) => t.status === "finished").sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""));
  return done[0] ?? null;
}

// ───────────────────────── подписи этапов

/**
 * Название раунда для трансляции. Одиночная сетка — «1/8 финала», «1/4 финала», «Полуфинал», «Финал»;
 * двойная — как на сайте («Финал верхней сетки», «Нижняя · раунд 2»), гранд-финал без пометки форы.
 */
export function bcRoundLabel(bracket: Side, round: number, totalUpper: number, totalLower: number, groupLabel?: string | null) {
  if (bracket === "group") return `${groupLabel ? `Группа ${groupLabel} · ` : ""}тур ${round}`;
  if (bracket === "swiss") return `Швейцарка · раунд ${round}`;
  if (bracket === "third_place") return THIRD_PLACE_TITLE;
  if (bracket === "grand_final") return "Гранд-финал";
  if (bracket === "upper" && !totalLower) {
    const left = totalUpper - round;
    if (left <= 0) return "Финал";
    if (left === 1) return "Полуфинал";
    return `1/${2 ** left} финала`;
  }
  return roundTitle(bracket, round, totalUpper, totalLower);
}

// ───────────────────────── сборка ответа

export type BroadcastSource = {
  tournament: { id: string; slug: string; name: string; status: string; sponsors?: { name: string }[] | null };
  matches: {
    id: string;
    number: number;
    status: string;
    stage: string;
    bracket: string;
    round: number;
    position: number;
    group_label: string | null;
    best_of: number;
    team1_id: string | null;
    team2_id: string | null;
    team1_score: number;
    team2_score: number;
    winner_id: string | null;
    is_walkover: boolean;
    scheduled_at: string | null;
    finished_at: string | null;
    server_state: string | null;
  }[];
  teams: { id: string; name: string; tag: string; logo_url: string | null }[];
  /** карты идущих матчей и сыгранных BO1 */
  maps: { match_id: string; map_number: number; map_name: string; status: string; team1_score: number; team2_score: number; winner_id: string | null }[];
  groups: {
    label: string | null;
    table: { teamId: string; wins: number; losses: number; mapWins: number; mapLosses: number; roundsFor: number; roundsAgainst: number; status: "active" | "advanced" | "eliminated" }[];
  }[];
  /** таблица игроков по рейтингу (как getPlayerLeaderboard) */
  leaders: BcLeader[];
  mvp: (BcLeader & { by: "swing" | "rating" }) | null;
};

/** Только https-логотипы: на трансляцию не должен попасть data:/javascript: или локальный путь */
function safeLogo(url: string | null) {
  return url && /^https:\/\//i.test(url) ? url : null;
}

const STATUSES = new Set<BcStatus>(["pending", "upcoming", "veto", "ready", "live", "finished"]);
const MAP_STATUS = new Set(["pending", "live", "finished"]);
const BRACKET_ORDER: Record<string, number> = { group: 0, swiss: 0, upper: 1, lower: 1, third_place: 2, grand_final: 3 };
const LEADERS_MAX = 8;

export function shapeBroadcast(src: BroadcastSource | null, now = new Date()): BroadcastPayload {
  const updated_at = now.toISOString();
  const empty: BroadcastPayload = {
    tournament: null,
    bracket: { kind: "none", upper: [], lower: [], final: null, third: null },
    groups: [],
    schedule: { now: [], next: [], soon: [], results: [] },
    live: [],
    leaders: [],
    mvp: null,
    updated_at,
  };
  if (!src) return empty;

  const teamById = new Map(src.teams.map((t) => [t.id, { id: t.id, name: t.name, tag: t.tag, logo: safeLogo(t.logo_url) } satisfies BcTeam]));
  const rows = src.matches.filter((m) => m.status !== "cancelled");
  const elim = rows.filter((m) => m.bracket === "upper" || m.bracket === "lower");
  const totalUpper = Math.max(0, ...elim.filter((m) => m.bracket === "upper").map((m) => m.round));
  const totalLower = Math.max(0, ...elim.filter((m) => m.bracket === "lower").map((m) => m.round));

  const shape = (m: BroadcastSource["matches"][number]): BcMatch => {
    const side = (id: string | null): 1 | 2 | null => (!id ? null : id === m.team1_id ? 1 : id === m.team2_id ? 2 : null);
    const status = (STATUSES.has(m.status as BcStatus) ? m.status : "pending") as BcStatus;
    const live = status === "live";
    const own = src.maps.filter((x) => x.match_id === m.id).sort((a, b) => a.map_number - b.map_number);
    const single = m.best_of === 1 ? own.find((x) => x.status === "finished" || x.status === "live") : undefined;
    const maps: BcMap[] = live
      ? own.map((x) => ({
            number: x.map_number,
            name: mapLabel(x.map_name),
            status: (MAP_STATUS.has(x.status) ? x.status : "pending") as BcMap["status"],
            score1: x.team1_score,
            score2: x.team2_score,
          winner: x.status === "finished" ? side(x.winner_id) ?? (x.team1_score > x.team2_score ? 1 : x.team2_score > x.team1_score ? 2 : null) : null,
        }))
      : [];
    return {
      id: m.id,
      number: m.number,
      status,
      bracket: m.bracket as Side,
      round: m.round,
      position: m.position,
      stage: bcRoundLabel(m.bracket as Side, m.round, totalUpper, totalLower, m.group_label),
      bestOf: m.best_of,
      team1: (m.team1_id && teamById.get(m.team1_id)) || null,
      team2: (m.team2_id && teamById.get(m.team2_id)) || null,
      score1: m.team1_score,
      score2: m.team2_score,
      winner: status === "finished" ? side(m.winner_id) : null,
      bye: m.is_walkover && (!m.team1_id || !m.team2_id),
      scheduledAt: m.scheduled_at,
      server: m.server_state === "ready" ? "ready" : m.server_state === "assigned" || m.server_state === "loading" ? "loading" : null,
      maps,
      current: maps.find((x) => x.status === "live") ?? null,
      rounds: single && (status === "finished" || live) ? [single.team1_score, single.team2_score] : null,
    };
  };

  const all = rows.map(shape);
  const byNumber = (a: BcMatch, b: BcMatch) => a.number - b.number;

  // ── сетка плей-офф
  const playoff = all.filter((m, i) => (rows[i].stage ?? "playoff") === "playoff" && m.bracket !== "group" && m.bracket !== "swiss");
  const columns = (list: BcMatch[]) =>
    [...new Set(list.map((m) => m.round))].sort((a, b) => a - b).map((r) => list.filter((m) => m.round === r).sort((a, b) => a.position - b.position));
  const upper = playoff.filter((m) => m.bracket === "upper");
  const lower = playoff.filter((m) => m.bracket === "lower");
  const bracket: BcBracket = {
    kind: !upper.length ? "none" : lower.length ? "de" : "se",
    upper: columns(upper),
    lower: columns(lower),
    final: playoff.find((m) => m.bracket === "grand_final") ?? null,
    third: playoff.find((m) => m.bracket === "third_place") ?? null,
  };

  // ── группы / швейцарка
  const groups: BcGroup[] = src.groups
    .map((g) => ({
      label: g.label,
      rows: g.table
        .map((r) => {
          const team = teamById.get(r.teamId);
          return team ? { team, wins: r.wins, losses: r.losses, mapDiff: r.mapWins - r.mapLosses, roundDiff: r.roundsFor - r.roundsAgainst, status: r.status } : null;
        })
        .filter((r): r is BcStanding => !!r),
    }))
    .filter((g) => g.rows.length);

  // ── расписание
  const playable = all.filter((m) => !m.bye);
  const time = (m: BcMatch) => (m.scheduledAt ? Date.parse(m.scheduledAt) : Number.POSITIVE_INFINITY);
  const ready = (m: BcMatch) => !!m.team1 && !!m.team2;
  const nowList = playable.filter((m) => m.status === "live").sort(byNumber);
  const nextList = playable
    .filter((m) => (m.status === "ready" || m.status === "veto") && ready(m))
    .sort((a, b) => (a.status === b.status ? 0 : a.status === "ready" ? -1 : 1) || time(a) - time(b) || a.number - b.number);
  const soonList = playable.filter((m) => m.status === "upcoming" && ready(m)).sort((a, b) => time(a) - time(b) || a.number - b.number);
  const key = (m: BcMatch) => `${m.bracket}:${m.round}`;
  const activeKeys = new Set([...nowList, ...nextList, ...soonList].map(key));
  let results = playable.filter((m) => m.status === "finished" && activeKeys.has(key(m)));
  if (!results.length) {
    // текущий раунд ещё не начат или всё сыграно — последние сыгранные матчи
    const finishedAt = new Map(rows.map((r) => [r.id, r.finished_at ?? ""]));
    results = playable
      .filter((m) => m.status === "finished")
      .sort((a, b) => (finishedAt.get(b.id) ?? "").localeCompare(finishedAt.get(a.id) ?? "") || b.number - a.number)
      .slice(0, 6)
      .sort(byNumber);
  }
  results.sort((a, b) => (BRACKET_ORDER[a.bracket] ?? 9) - (BRACKET_ORDER[b.bracket] ?? 9) || byNumber(a, b));

  // ── лидеры: игроки, сыгравшие хотя бы 2 карты (иначе одна удачная карта занимает весь топ)
  const most = Math.max(0, ...src.leaders.map((p) => p.maps));
  const leaders = src.leaders.filter((p) => p.maps >= Math.min(2, most)).slice(0, LEADERS_MAX);

  return {
    tournament: {
      id: src.tournament.id,
      slug: src.tournament.slug,
      name: src.tournament.name,
      status: src.tournament.status,
      stage: stageLabel(src.tournament.status, all),
      sponsors: (src.tournament.sponsors ?? []).map((s) => s.name).filter(Boolean).slice(0, 4),
    },
    bracket,
    groups,
    schedule: { now: nowList, next: nextList, soon: soonList, results },
    live: nowList,
    leaders,
    mvp: leaders.length ? src.mvp : null,
    updated_at,
  };
}

const TOURNAMENT_STAGE: Record<string, string> = {
  registration: "Идёт регистрация",
  registration_closed: "Регистрация закрыта",
  checkin: "Идёт check-in",
  finished: "Турнир завершён",
};

/** Этап в шапке: «Плей-офф · 1/4 финала», «Групповой этап · тур 2», «Идёт check-in» */
export function stageLabel(status: string, matches: BcMatch[]) {
  if (status !== "live") return TOURNAMENT_STAGE[status] ?? "";
  const open = matches
    .filter((m) => !m.bye && m.status !== "finished" && m.status !== "pending")
    .sort((a, b) => (BRACKET_ORDER[a.bracket] ?? 9) - (BRACKET_ORDER[b.bracket] ?? 9) || a.round - b.round || a.number - b.number);
  const m = open.find((x) => x.status === "live") ?? open[0];
  if (!m) return "Плей-офф";
  if (m.bracket === "group") return `Групповой этап · тур ${m.round}`;
  if (m.bracket === "swiss") return `Швейцарская система · раунд ${m.round}`;
  return `Плей-офф · ${m.stage}`;
}

// ───────────────────────── демо-данные (?mock=1 только вне production)

const MOCK_TEAMS: [string, string][] = [
  ["Astana Wolves", "AWL"],
  ["Qazaq Reapers", "QZR"],
  ["Steppe Eagles", "STE"],
  ["Almaty Snipers", "ALS"],
  ["Nomad Five", "NMD"],
  ["Baikonur Rockets", "BKR"],
  ["Irbis Esports", "IRB"],
  ["Turan Legion", "TRN"],
  ["Shymkent Kings", "SHK"],
  ["Karaganda Iron", "KRG"],
  ["Altai Storm", "ALT"],
  ["Caspian Sharks", "CSP"],
  ["Евразийский национальный университет", "ENU"],
  ["Tengri Gaming", "TNG"],
  ["Silk Road", "SLK"],
  ["Burabay Bears", "BRB"],
];

/**
 * Турнир на 16 команд, одиночная сетка с матчем за 3-е место: 1/8 сыграна, 1/4 идёт (два матча live,
 * один на вето, один ждёт сервер). Часы сдвигают счёт идущих карт — видно, как обновляются цифры.
 */
export function mockBroadcast(now = new Date()): BroadcastPayload {
  const teams = MOCK_TEAMS.map(([name, tag], i) => ({ id: `t${i + 1}`, name, tag, logo_url: null }));
  const id = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
  const tick = Math.floor(now.getTime() / 5000) % 12;
  const at = (min: number) => new Date(now.getTime() + min * 60_000).toISOString();
  const matches: BroadcastSource["matches"] = [];
  let number = 0;
  const add = (o: Partial<BroadcastSource["matches"][number]> & { bracket: string; round: number; position: number }) =>
    matches.push({
      id: id(++number),
      number,
      status: "pending",
      stage: "playoff",
      group_label: null,
      best_of: 1,
      team1_id: null,
      team2_id: null,
      team1_score: 0,
      team2_score: 0,
      winner_id: null,
      is_walkover: false,
      scheduled_at: null,
      finished_at: null,
      server_state: null,
      ...o,
    });
  // 1/8: посев 1-16, 8-9, … — все сыграны
  const order = [1, 16, 8, 9, 5, 12, 4, 13, 3, 14, 6, 11, 7, 10, 2, 15];
  const r1Scores: [number, number][] = [[13, 4], [11, 13], [13, 9], [13, 11], [16, 14], [7, 13], [13, 10], [13, 5]];
  const r1Winners: string[] = [];
  const r1Maps: BroadcastSource["maps"] = [];
  for (let p = 0; p < 8; p++) {
    const a = `t${order[p * 2]}`;
    const b = `t${order[p * 2 + 1]}`;
    const [s1, s2] = r1Scores[p];
    r1Winners.push(s1 > s2 ? a : b);
    r1Maps.push({ match_id: id(number + 1), map_number: 1, map_name: ["de_mirage", "de_inferno", "de_nuke", "de_ancient"][p % 4], status: "finished", team1_score: s1, team2_score: s2, winner_id: s1 > s2 ? a : b });
    add({ bracket: "upper", round: 1, position: p, team1_id: a, team2_id: b, team1_score: s1 > s2 ? 1 : 0, team2_score: s2 > s1 ? 1 : 0, winner_id: s1 > s2 ? a : b, status: "finished", finished_at: at(-120 + p * 5) });
  }
  // 1/4: BO3 — live, live, вето, сервер готов
  const qf = [
    { status: "live", score: [1, 0], server: "ready" },
    { status: "live", score: [0, 1], server: "ready" },
    { status: "veto", score: [0, 0], server: null },
    { status: "ready", score: [0, 0], server: "ready" },
  ] as const;
  qf.forEach((q, p) =>
    add({
      bracket: "upper",
      round: 2,
      position: p,
      best_of: 3,
      team1_id: r1Winners[p * 2],
      team2_id: r1Winners[p * 2 + 1],
      team1_score: q.score[0],
      team2_score: q.score[1],
      status: q.status,
      server_state: q.server,
      scheduled_at: at(p < 2 ? -40 : p === 2 ? 10 : 15),
    }),
  );
  add({ bracket: "upper", round: 3, position: 0, best_of: 3, scheduled_at: at(90) });
  add({ bracket: "upper", round: 3, position: 1, best_of: 3, scheduled_at: at(90) });
  add({ bracket: "upper", round: 4, position: 0, best_of: 3, scheduled_at: at(180) });
  add({ bracket: "third_place", round: 4, position: 0, best_of: 3, scheduled_at: at(180) });

  const liveIds = matches.filter((m) => m.status === "live").map((m) => m.id);
  const maps: BroadcastSource["maps"] = [
    ...r1Maps,
    { match_id: liveIds[0], map_number: 1, map_name: "de_ancient", status: "finished", team1_score: 13, team2_score: 9, winner_id: matches.find((m) => m.id === liveIds[0])!.team1_id },
    { match_id: liveIds[0], map_number: 2, map_name: "de_mirage", status: "live", team1_score: 6 + Math.floor(tick / 2), team2_score: 5 + Math.ceil(tick / 2), winner_id: null },
    { match_id: liveIds[0], map_number: 3, map_name: "de_nuke", status: "pending", team1_score: 0, team2_score: 0, winner_id: null },
    { match_id: liveIds[1], map_number: 1, map_name: "de_inferno", status: "finished", team1_score: 10, team2_score: 13, winner_id: matches.find((m) => m.id === liveIds[1])!.team2_id },
    { match_id: liveIds[1], map_number: 2, map_name: "de_anubis", status: "live", team1_score: 3 + Math.ceil(tick / 3), team2_score: 2 + Math.floor(tick / 3), winner_id: null },
    { match_id: liveIds[1], map_number: 3, map_name: "de_dust2", status: "pending", team1_score: 0, team2_score: 0, winner_id: null },
  ];

  const leaders: BcLeader[] = [
    ["kaz1k", "Astana Wolves", 1.42, 1.61, 98.4, 2.9],
    ["Zhanibek", "Steppe Eagles", 1.31, 1.44, 91.2, 2.1],
    ["m0rph", "Qazaq Reapers", 1.27, 1.38, 88.7, 1.7],
    ["Arman", "Nomad Five", 1.19, 1.29, 84.1, 1.2],
    ["dosya", "Almaty Snipers", 1.15, 1.22, 82.5, 0.9],
    ["Temirlan", "Irbis Esports", 1.11, 1.17, 80.3, 0.6],
    ["Nurik", "Baikonur Rockets", 1.08, 1.12, 78.9, 0.4],
    ["Aidos", "Turan Legion", 1.04, 1.06, 76.2, 0.1],
  ].map(([name, team, rating, kd, adr, swing]) => ({ name: name as string, avatar: null, team: team as string, rating: rating as number, kd: kd as number, adr: adr as number, maps: 3, swing: swing as number }));

  return shapeBroadcast(
    {
      tournament: { id: id(0), slug: "f16-open-cup", name: "F16 Arena Open Cup 2026", status: "live", sponsors: [] },
      matches,
      teams,
      maps,
      groups: [],
      leaders,
      mvp: { ...leaders[0], by: "swing" },
    },
    now,
  );
}
