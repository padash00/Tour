import "server-only";
import { randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { db } from "./supabase";
import { AGENT_OFFLINE_AFTER_MS } from "./server/state";
import { modeOf } from "./modes";
import { getSetting } from "./settings";
import { vetoState, type VetoAction } from "./veto";
import { BOT_NAMES, lobbyCvars, mapsProblem, normalizeSettings, type LobbySettings } from "./lobby-settings";
import type { Player } from "./types";

// ───────────────────────── типы

export type Slot = "team1" | "team2" | "wait" | "spec";

export type Lobby = {
  id: string;
  code: string;
  host_id: string;
  visibility: "public" | "closed" | "private";
  password_hash: string | null;
  invite_token: string;
  status: "waiting" | "playing" | "closed";
  settings: LobbySettings;
  team1_name: string;
  team2_name: string;
  bots: { team1: string[]; team2: string[] };
  ready_check_until: string | null;
  draft: { captains: [string, string]; turn: 1 | 2; deadline: string } | null;
  current_game_id: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
};

export type LobbyMember = {
  lobby_id: string;
  player_id: string;
  slot: Slot;
  ready: boolean;
  joined_at: string;
  last_seen_at: string;
};

export type GamePlayer = { id: string; steam_id: string; nickname: string };
export type GameTeam = { name: string; players: GamePlayer[]; bots: string[] };
export type GameMap = { map: string; team1_score: number; team2_score: number; status: "pending" | "live" | "finished"; winner: 1 | 2 | null };
export type GameVeto = { step: number; team: 1 | 2 | null; action: "ban" | "pick" | "decider"; map: string; auto: boolean };

export type LobbyGame = {
  id: string;
  lobby_id: string;
  matchzy_id: number;
  status: "veto" | "waiting" | "live" | "finished" | "cancelled";
  best_of: number;
  settings: LobbySettings;
  team1: GameTeam;
  team2: GameTeam;
  veto: GameVeto[];
  veto_pool: string[];
  veto_deadline: string | null;
  maps: GameMap[];
  team1_score: number;
  team2_score: number;
  winner: 1 | 2 | null;
  server_instance: string | null;
  server_state: "loading" | "ready" | "error" | null;
  server_address: string | null;
  server_assigned_at: string | null;
  server_ready_at: string | null;
  note: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export const ONLINE_MS = 45_000; // игрок «в лобби», если страница опрашивала сервер за это время
const HOST_AWAY_MS = 3 * 60_000; // хост пропал — хост переходит к следующему
export const READY_CHECK_SECONDS = 30;
export const DRAFT_STEP_SECONDS = 30;
export const LOBBY_VETO_SECONDS = 30;

// ───────────────────────── мелочи

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export function newCode(len = 6) {
  return Array.from({ length: len }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join("");
}
export const newToken = () => randomBytes(12).toString("base64url");

// scrypt асинхронный: синхронный блокировал event loop функции на каждый ввод пароля
const scryptAsync = promisify(scrypt) as (pw: string, salt: string, len: number) => Promise<Buffer>;

export async function hashPassword(pw: string) {
  const salt = randomBytes(12).toString("hex");
  return `${salt}:${(await scryptAsync(pw, salt, 32)).toString("hex")}`;
}
export async function checkPassword(pw: string, stored: string | null) {
  if (!stored) return true;
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const a = await scryptAsync(pw, salt, 32);
  const b = Buffer.from(hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export function checkInvite(token: string | null | undefined, lobby: Pick<Lobby, "invite_token">) {
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(lobby.invite_token);
  return a.length === b.length && timingSafeEqual(a, b);
}

const touch = (lobbyId: string, patch: Record<string, unknown> = {}) =>
  db().from("lobbies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", lobbyId);

export async function systemMessage(lobbyId: string, body: string) {
  await db().from("lobby_messages").insert({ lobby_id: lobbyId, player_id: null, body: body.slice(0, 300) });
}

function parseLobby(row: Record<string, unknown> | null): Lobby | null {
  if (!row) return null;
  const l = row as unknown as Lobby;
  l.settings = normalizeSettings(l.settings);
  l.bots = { team1: l.bots?.team1 ?? [], team2: l.bots?.team2 ?? [] };
  return l;
}

export async function getLobbyByCode(code: string) {
  const { data } = await db().from("lobbies").select("*").eq("code", code.toUpperCase()).maybeSingle();
  return parseLobby(data);
}

export async function getLobby(id: string) {
  const { data } = await db().from("lobbies").select("*").eq("id", id).maybeSingle();
  return parseLobby(data);
}

export async function getMembers(lobbyId: string) {
  const { data } = await db()
    .from("lobby_members")
    .select("*, player:players(id, steam_id, nickname, avatar_url, faceit_level, faceit_elo, is_banned)")
    .eq("lobby_id", lobbyId)
    .order("joined_at");
  return (data ?? []) as (LobbyMember & { player: Pick<Player, "id" | "steam_id" | "nickname" | "avatar_url" | "faceit_level" | "faceit_elo" | "is_banned"> })[];
}

export async function getGame(id: string) {
  const { data } = await db().from("lobby_games").select("*").eq("id", id).maybeSingle().throwOnError();
  if (!data) return null;
  const g = data as LobbyGame;
  g.settings = normalizeSettings(g.settings);
  return g;
}

export const isOnline = (m: Pick<LobbyMember, "last_seen_at">) => Date.now() - new Date(m.last_seen_at).getTime() < ONLINE_MS;

/** Активная игра игрока в любом лобби — нельзя быть в двух лобби одновременно */
export async function playerLobby(playerId: string) {
  const { data } = await db()
    .from("lobby_members")
    .select("lobby_id, lobby:lobbies!inner(code, status)")
    .eq("player_id", playerId)
    .neq("lobby.status", "closed");
  const row = (data ?? [])[0] as unknown as { lobby_id: string; lobby: { code: string } } | undefined;
  return row ? { id: row.lobby_id, code: row.lobby.code } : null;
}

/** Сколько матчей игрок сыграл на сайте (турниры + лобби) — для фильтра входа */
export async function playedMatches(playerId: string) {
  const [{ data: t }, { data: l }] = await Promise.all([
    db().from("player_map_stats").select("match_id").eq("player_id", playerId).limit(1000),
    db().from("lobby_player_stats").select("game_id").eq("player_id", playerId).limit(1000),
  ]);
  return new Set((t ?? []).map((r) => r.match_id)).size + new Set((l ?? []).map((r) => r.game_id)).size;
}

/** Причина, по которой фильтр лобби не пускает игрока (null — пускает) */
export async function filterProblem(s: LobbySettings, p: Pick<Player, "id" | "faceit_level">) {
  if (!s.filter) return null;
  const lvl = p.faceit_level ?? 0;
  if (s.filter_faceit_min > 0 && lvl < s.filter_faceit_min) return `Нужен уровень FACEIT от ${s.filter_faceit_min}`;
  if (s.filter_faceit_max < 10 && lvl > s.filter_faceit_max) return `Лобби для уровня FACEIT до ${s.filter_faceit_max}`;
  if (s.filter_min_matches > 0 && (await playedMatches(p.id)) < s.filter_min_matches) {
    return `Нужно хотя бы ${s.filter_min_matches} сыгранных матчей на сайте`;
  }
  return null;
}

// ───────────────────────── хост

/** Хост ушёл или пропал → хостом становится следующий игрок (сначала из команд, потом остальные). Нет никого — лобби закрывается. */
export async function passHost(lobby: Lobby, leavingId: string | null) {
  const members = (await getMembers(lobby.id)).filter((m) => m.player_id !== leavingId);
  const online = members.filter(isOnline);
  const order = (list: typeof members) =>
    [...list].sort((a, b) => rankSlot(a.slot) - rankSlot(b.slot) || a.joined_at.localeCompare(b.joined_at));
  const next = order(online)[0] ?? order(members)[0];
  if (!next) {
    await closeLobby(lobby, "Лобби закрыто — в нём никого не осталось");
    return null;
  }
  // условное обновление: несколько одновременных опросов страницы передадут хоста один раз
  const { data } = await db()
    .from("lobbies")
    .update({ host_id: next.player_id, updated_at: new Date().toISOString() })
    .eq("id", lobby.id)
    .eq("host_id", lobby.host_id)
    .select("id");
  if (data?.length) await systemMessage(lobby.id, `Новый хост — ${next.player.nickname}`);
  return next.player_id;
}
const rankSlot = (s: Slot) => (s === "team1" || s === "team2" ? 0 : s === "wait" ? 1 : 2);

export async function closeLobby(lobby: Lobby, reason: string) {
  await touch(lobby.id, { status: "closed", closed_at: new Date().toISOString(), ready_check_until: null, draft: null });
  await systemMessage(lobby.id, reason);
  // игра, которая ещё не на сервере, отменяется; идущую доигрывают
  await db().from("lobby_games").update({ status: "cancelled", note: "лобби закрыто" }).eq("lobby_id", lobby.id).in("status", ["veto"]);
  const { data: waiting } = await db()
    .from("lobby_games")
    .select("id, server_instance")
    .eq("lobby_id", lobby.id)
    .eq("status", "waiting");
  for (const g of waiting ?? []) {
    if (g.server_instance) await db().from("agent_commands").insert({ instance: g.server_instance, type: "end_match", payload: {} });
    await db().from("lobby_games").update({ status: "cancelled", note: "лобби закрыто", server_instance: null, server_state: null }).eq("id", g.id);
  }
}

/** Хост давно не открывал лобби — передаём хоста тому, кто на месте */
/** true — хост передан (лобби нужно перечитать) */
export async function checkHostAway(lobby: Lobby, members: LobbyMember[]) {
  // во время игры хост в CS2, а не на странице — не передаём
  if (lobby.status !== "waiting") return false;
  const host = members.find((m) => m.player_id === lobby.host_id);
  if (host && Date.now() - new Date(host.last_seen_at).getTime() < HOST_AWAY_MS) return false;
  if (!members.some((m) => m.player_id !== lobby.host_id && isOnline(m))) return false;
  await passHost(lobby, host ? null : lobby.host_id);
  return true;
}

// ───────────────────────── состав

export function teamCount(lobby: Lobby, members: LobbyMember[], team: "team1" | "team2") {
  return members.filter((m) => m.slot === team).length + lobby.bots[team].length;
}

/** Можно ли поставить игрока в слот (без учёта прав) */
export function slotProblem(lobby: Lobby, members: LobbyMember[], slot: Slot, playerId: string) {
  const s = lobby.settings;
  const others = members.filter((m) => m.player_id !== playerId);
  if (slot === "team1" || slot === "team2") {
    if (teamCount(lobby, others, slot) >= s.team_size) return "В команде нет мест";
  } else if (slot === "wait") {
    if (others.filter((m) => m.slot === "wait").length >= s.max_waiting) return "Список ожидания заполнен";
  } else if (others.filter((m) => m.slot === "spec").length >= s.max_spectators) {
    return "Мест для наблюдателей нет";
  }
  return null;
}

export async function setSlot(lobbyId: string, playerId: string, slot: Slot) {
  await db().from("lobby_members").update({ slot, ready: false }).eq("lobby_id", lobbyId).eq("player_id", playerId);
  await touch(lobbyId);
}

/** Лишние в командах после уменьшения размера команды → в ожидание (боты убираются первыми) */
export async function fitTeams(lobby: Lobby) {
  const size = lobby.settings.team_size;
  const members = await getMembers(lobby.id);
  const bots = { team1: [...lobby.bots.team1], team2: [...lobby.bots.team2] };
  for (const team of ["team1", "team2"] as const) {
    const humans = members.filter((m) => m.slot === team);
    while (humans.length + bots[team].length > size && bots[team].length) bots[team].pop();
    for (const extra of humans.slice(size)) await setSlot(lobby.id, extra.player_id, "wait");
  }
  await touch(lobby.id, { bots });
}

export function nextBotName(lobby: Lobby) {
  const used = new Set([...lobby.bots.team1, ...lobby.bots.team2]);
  return BOT_NAMES.find((n) => !used.has(n)) ?? `Bot ${used.size + 1}`;
}

/** Капитаны команд: первый (по времени входа) игрок команды */
export function captainsOf(lobby: Lobby, members: LobbyMember[]): [string | null, string | null] {
  if (lobby.draft) return lobby.draft.captains;
  const first = (team: Slot) => members.filter((m) => m.slot === team).sort((a, b) => a.joined_at.localeCompare(b.joined_at))[0]?.player_id ?? null;
  return [first("team1"), first("team2")];
}

// ───────────────────────── драфт капитанов

export async function startDraft(lobby: Lobby, captains: [string, string]) {
  const members = await getMembers(lobby.id);
  // все, кроме капитанов, из команд — в ожидание
  for (const m of members) {
    if (m.player_id === captains[0]) await setSlot(lobby.id, m.player_id, "team1");
    else if (m.player_id === captains[1]) await setSlot(lobby.id, m.player_id, "team2");
    else if (m.slot === "team1" || m.slot === "team2") await setSlot(lobby.id, m.player_id, "wait");
  }
  await touch(lobby.id, {
    draft: { captains, turn: 1, deadline: new Date(Date.now() + DRAFT_STEP_SECONDS * 1000).toISOString() },
    bots: { team1: [], team2: [] },
    ready_check_until: null,
  });
  const name = (id: string) => members.find((m) => m.player_id === id)?.player.nickname ?? "капитан";
  await systemMessage(lobby.id, `Драфт: капитаны ${name(captains[0])} и ${name(captains[1])}. Первым выбирает ${name(captains[0])}.`);
}

/** Капитан берёт игрока из ожидания. Драфт заканчивается, когда команды полные или выбирать некого. */
export async function draftPick(lobby: Lobby, pickedId: string, auto = false) {
  if (!lobby.draft) return "Драфт не идёт";
  const members = await getMembers(lobby.id);
  const picked = members.find((m) => m.player_id === pickedId && m.slot === "wait");
  if (!picked) return "Этого игрока нельзя выбрать";
  if (!auto) {
    // забираем ход условным обновлением: двойной клик или авто-пик в ту же секунду не возьмут двух игроков
    const { data } = await db()
      .from("lobbies")
      .update({ draft: { ...lobby.draft, deadline: new Date(Date.now() + DRAFT_STEP_SECONDS * 1000).toISOString() } })
      .eq("id", lobby.id)
      .eq("draft->>deadline", lobby.draft.deadline)
      .select("id");
    if (!data?.length) return "Ход уже сделан — обновите страницу";
  }
  const team = lobby.draft.turn === 1 ? "team1" : "team2";
  await setSlot(lobby.id, pickedId, team);
  await systemMessage(lobby.id, `${auto ? "Время вышло — " : ""}${team === "team1" ? lobby.team1_name : lobby.team2_name} берёт ${picked.player.nickname}`);
  const after = await getMembers(lobby.id);
  const size = lobby.settings.team_size;
  const t1 = after.filter((m) => m.slot === "team1").length;
  const t2 = after.filter((m) => m.slot === "team2").length;
  const pool = after.filter((m) => m.slot === "wait").length;
  if (pool === 0 || (t1 >= size && t2 >= size)) {
    await touch(lobby.id, { draft: null });
    await systemMessage(lobby.id, "Драфт окончен");
    return null;
  }
  // очередь: 1-2-2-1… упрощённо — по очереди, но полная команда пропускает ход
  let turn: 1 | 2 = lobby.draft.turn === 1 ? 2 : 1;
  if (turn === 1 && t1 >= size) turn = 2;
  if (turn === 2 && t2 >= size) turn = 1;
  await touch(lobby.id, { draft: { ...lobby.draft, turn, deadline: new Date(Date.now() + DRAFT_STEP_SECONDS * 1000).toISOString() } });
  return null;
}

// ───────────────────────── старт игры

/** Что мешает начать игру (null — можно) */
export function startProblem(lobby: Lobby, members: LobbyMember[]) {
  if (lobby.status !== "waiting") return "Игра уже идёт";
  if (lobby.draft) return "Сначала закончите драфт";
  const maps = mapsProblem(lobby.settings);
  if (maps) return maps;
  const h1 = members.filter((m) => m.slot === "team1").length;
  const h2 = members.filter((m) => m.slot === "team2").length;
  if (h1 + h2 === 0) return "В командах никого нет";
  const c1 = teamCount(lobby, members, "team1");
  const c2 = teamCount(lobby, members, "team2");
  if (c1 === 0 || c2 === 0) return "В каждой команде должен быть хотя бы один игрок или бот";
  if (c1 !== c2) return `Команды неравные: ${c1} против ${c2} — добавьте игрока или бота`;
  return null;
}

/** Создаёт игру по текущему составу и настройкам: вето или сразу карты, дальше — ожидание сервера */
export async function createGame(lobby: Lobby) {
  const members = await getMembers(lobby.id);
  const s = lobby.settings;
  const captains = captainsOf(lobby, members);
  // капитан — первым в составе: он действует в вето
  const team = (slot: Slot, name: string, bots: string[]): GameTeam => ({
    name,
    players: members
      .filter((m) => m.slot === slot)
      .sort((a, b) => Number(captains.includes(b.player_id)) - Number(captains.includes(a.player_id)))
      .map((m) => ({ id: m.player_id, steam_id: m.player.steam_id, nickname: m.player.nickname })),
    bots,
  });
  let maps: GameMap[] = [];
  let status: LobbyGame["status"] = "waiting";
  const blank = (map: string): GameMap => ({ map, team1_score: 0, team2_score: 0, status: "pending", winner: null });
  if (s.map_choice === "host") maps = s.maps.slice(0, s.best_of).map(blank);
  else if (s.map_choice === "random") {
    const pool = [...s.maps];
    for (let i = 0; i < s.best_of; i++) {
      if (!pool.length) pool.push(...s.maps); // карт меньше, чем BO — повторяем
      maps.push(blank(pool.splice(randomInt(pool.length), 1)[0]));
    }
  } else status = "veto";

  const { data, error } = await db()
    .from("lobby_games")
    .insert({
      lobby_id: lobby.id,
      status,
      best_of: s.best_of,
      settings: s,
      team1: team("team1", lobby.team1_name, lobby.bots.team1),
      team2: team("team2", lobby.team2_name, lobby.bots.team2),
      veto_pool: status === "veto" ? s.maps : [],
      veto_deadline: status === "veto" ? new Date(Date.now() + LOBBY_VETO_SECONDS * 1000).toISOString() : null,
      maps,
      note: status === "veto" ? null : "ждём свободный сервер",
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  await touch(lobby.id, { status: "playing", current_game_id: data.id, ready_check_until: null });
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", lobby.id);
  await systemMessage(lobby.id, status === "veto" ? "Игра создана — капитаны выбирают карты" : `Игра создана: ${maps.map((m) => mapTitle(m.map)).join(", ")}. Ищем сервер…`);
  return data as LobbyGame;
}

export const mapTitle = (m: string) => {
  const name = m.split("@")[0].replace(/^(de|cs|aim|awp)_/, "");
  return name.charAt(0).toUpperCase() + name.slice(1);
};

// ───────────────────────── вето лобби

const toVeto = (g: LobbyGame): VetoAction[] =>
  g.veto.map((v) => ({ step: v.step, team_id: v.team ? String(v.team) : null, action: v.action, map_name: v.map }));

export function lobbyVetoState(g: LobbyGame) {
  return vetoState(g.best_of, g.veto_pool, toVeto(g));
}

/** Шаг вето (капитан или авто по таймеру). Последняя карта — decider, дальше ждём сервер. */
export async function lobbyVetoAct(g: LobbyGame, map: string, auto: boolean) {
  const state = lobbyVetoState(g);
  if (!state.current || state.current.action === "decider") return "Вето завершено";
  if (!state.remaining.includes(map)) return "Эта карта уже выбрана";
  const veto = [...g.veto, { step: state.current.step, team: state.current.team, action: state.current.action, map, auto }];
  const next = vetoState(g.best_of, g.veto_pool, toVeto({ ...g, veto }));
  const patch: Record<string, unknown> = { veto, veto_deadline: new Date(Date.now() + LOBBY_VETO_SECONDS * 1000).toISOString() };
  if (next.current?.action === "decider") {
    veto.push({ step: next.current.step, team: null, action: "decider", map: next.remaining[0], auto: true });
    const maps = veto
      .filter((v) => v.action === "pick" || v.action === "decider")
      .map((v) => ({ map: v.map, team1_score: 0, team2_score: 0, status: "pending" as const, winner: null }));
    Object.assign(patch, { veto, maps, status: "waiting", veto_deadline: null, note: "ждём свободный сервер" });
  }
  // защита от двойного шага: дедлайн меняется на каждом шаге — обновляем, только если он тот же, что мы прочитали
  let q = db().from("lobby_games").update(patch).eq("id", g.id).eq("status", "veto");
  q = g.veto_deadline ? q.eq("veto_deadline", g.veto_deadline) : q.is("veto_deadline", null);
  const { data } = await q.select("id");
  if (!data?.length) return "Не удалось — обновите страницу";
  return null;
}

// ───────────────────────── фоновые задачи (на каждой синхронизации агента)

export async function lobbyTick() {
  const now = Date.now();
  // вето: время хода вышло → случайная карта
  const { data: vetoGames } = await db().from("lobby_games").select("*").eq("status", "veto").lt("veto_deadline", new Date(now).toISOString());
  for (const row of vetoGames ?? []) {
    const g = row as LobbyGame;
    const st = lobbyVetoState(g);
    if (st.remaining.length) await lobbyVetoAct(g, st.remaining[randomInt(st.remaining.length)], true);
  }
  // драфт и проверка готовности
  const { data: due } = await db()
    .from("lobbies")
    .select("*")
    .neq("status", "closed")
    .or(`draft.not.is.null,ready_check_until.lt.${new Date(now).toISOString()}`);
  for (const row of due ?? []) await lobbyTimeouts(parseLobby(row)!);
  await lobbyGameWatchdog();
}

/**
 * Истёкшие таймеры одного лобби (вызывается и из тика агента, и при опросе страницы лобби).
 * Каждое действие сначала «забирается» условным обновлением — два одновременных вызова не сделают его дважды.
 */
export async function lobbyTimeouts(lobby: Lobby) {
  const now = Date.now();
  if (lobby.draft && new Date(lobby.draft.deadline).getTime() <= now) {
    const { data } = await db()
      .from("lobbies")
      .update({ draft: { ...lobby.draft, deadline: new Date(now + DRAFT_STEP_SECONDS * 1000).toISOString() } })
      .eq("id", lobby.id)
      .eq("draft->>deadline", lobby.draft.deadline)
      .select("id");
    if (data?.length) {
      const pool = (await getMembers(lobby.id)).filter((m) => m.slot === "wait");
      if (!pool.length) await touch(lobby.id, { draft: null });
      else await draftPick(lobby, pool[randomInt(pool.length)].player_id, true);
    }
  }
  if (lobby.status === "waiting" && lobby.ready_check_until && new Date(lobby.ready_check_until).getTime() <= now) {
    const { data } = await db()
      .from("lobbies")
      .update({ ready_check_until: null })
      .eq("id", lobby.id)
      .eq("ready_check_until", lobby.ready_check_until)
      .select("id");
    if (data?.length) await expireReadyCheck(lobby);
  }
  if (lobby.status === "playing" && lobby.current_game_id) {
    const g = await getGame(lobby.current_game_id);
    if (g?.status === "veto" && g.veto_deadline && new Date(g.veto_deadline).getTime() <= now) {
      const st = lobbyVetoState(g);
      if (st.remaining.length) await lobbyVetoAct(g, st.remaining[randomInt(st.remaining.length)], true);
    }
  }
}

/** Есть ли у лобби истёкший таймер (чтобы не дёргать базу на каждом опросе) */
export function lobbyHasDue(lobby: Lobby, game: LobbyGame | null) {
  const now = Date.now();
  const past = (t: string | null | undefined) => !!t && new Date(t).getTime() <= now;
  return past(lobby.draft?.deadline) || past(lobby.ready_check_until) || (game?.status === "veto" && past(game.veto_deadline));
}

export async function expireReadyCheck(lobby: Lobby) {
  const members = await getMembers(lobby.id);
  const late = members.filter((m) => (m.slot === "team1" || m.slot === "team2") && !m.ready);
  for (const m of late) await setSlot(lobby.id, m.player_id, "wait");
  await touch(lobby.id, { ready_check_until: null });
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", lobby.id);
  await systemMessage(lobby.id, late.length ? `Не подтвердили готовность: ${late.map((m) => m.player.nickname).join(", ")} — переведены в ожидание` : "Проверка готовности отменена");
}

/** Все в командах готовы → старт (проверка готовности хоста или режим «все готовы») */
export async function maybeStartOnReady(lobbyId: string) {
  const lobby = await getLobby(lobbyId);
  if (!lobby || lobby.status !== "waiting") return false;
  const members = await getMembers(lobby.id);
  const inTeams = members.filter((m) => m.slot === "team1" || m.slot === "team2");
  if (!inTeams.length || inTeams.some((m) => !m.ready)) return false;
  if (!lobby.ready_check_until) {
    if (lobby.settings.start !== "all_ready") return false;
    // автостарт — только когда команды полные
    const size = lobby.settings.team_size;
    if (teamCount(lobby, members, "team1") < size || teamCount(lobby, members, "team2") < size) return false;
  }
  if (startProblem(lobby, members)) return false;
  // защита от двойного старта
  const { data } = await db().from("lobbies").update({ status: "playing" }).eq("id", lobby.id).eq("status", "waiting").select("id");
  if (!data?.length) return false;
  try {
    await createGame({ ...lobby, status: "waiting" });
  } catch (e) {
    // игра не создалась — лобби не должно зависнуть в «идёт игра»
    await touch(lobby.id, { status: "waiting", ready_check_until: null });
    await systemMessage(lobby.id, "Не удалось создать игру — попробуйте ещё раз");
    throw e;
  }
  return true;
}

// ───────────────────────── сервер

/** Инстанс для игры лобби: только помеченные «для лобби», запущенные, свободные */
export async function pickLobbyInstance() {
  const [{ data: insts }, { data: host }, { data: m1 }, { data: m2 }] = await Promise.all([
    db().from("server_instances").select("name, running, gamestate, for_lobby").eq("for_lobby", true).order("name"),
    db().from("server_host").select("last_seen_at, info").eq("id", "main").maybeSingle(),
    db().from("matches").select("server_instance").not("server_instance", "is", null).in("status", ["ready", "live"]),
    db().from("lobby_games").select("server_instance").not("server_instance", "is", null).in("status", ["waiting", "live"]),
  ]);
  const online = !!host?.last_seen_at && Date.now() - new Date(host.last_seen_at).getTime() < AGENT_OFFLINE_AFTER_MS;
  if (!online || (host?.info as { busy?: string | null } | null)?.busy) return { inst: null, stopped: [] as string[] };
  const taken = new Set([...(m1 ?? []), ...(m2 ?? [])].map((r) => r.server_instance));
  const list = (insts ?? []).filter((i) => !taken.has(i.name));
  const free = list.find((i) => i.running && (i.gamestate ?? "none") === "none") ?? null;
  return { inst: free?.name ?? null, stopped: list.filter((i) => !i.running).map((i) => i.name) };
}

/** Игры, которые ждут сервер, → на свободный инстанс лобби. Выключенный инстанс лобби агент запускает сам. */
export async function assignLobbyServers(opts: { workshopBusy: (maps: string[], gameId: string) => Promise<boolean> }) {
  const { data } = await db()
    .from("lobby_games")
    .select("*")
    .eq("status", "waiting")
    .or("server_instance.is.null,server_state.eq.error")
    .order("created_at");
  for (const row of data ?? []) {
    const g = row as LobbyGame;
    if (g.server_instance && g.server_state === "error") {
      // прошлый сервер не справился — снимаем матч с него (иначе он так и останется занят) и ищем другой
      await db().from("agent_commands").insert({ instance: g.server_instance, type: "end_match", payload: {} });
      await db()
        .from("lobby_games")
        .update({ server_instance: null, server_state: null, server_address: null, note: g.note ?? "ищем другой сервер" })
        .eq("id", g.id)
        .eq("server_state", "error");
      return; // новый сервер — на следующем тике, когда старый освободится
    }
    if (await opts.workshopBusy(g.maps.map((m) => m.map), g.id)) {
      await setNote(g, "карта из мастерской прогревается на сервере…");
      continue;
    }
    const { inst, stopped } = await pickLobbyInstance();
    if (!inst) {
      if (stopped.length) {
        // свободный инстанс выключен — запускаем (не чаще раза в 3 минуты)
        const since = new Date(Date.now() - 3 * 60_000).toISOString();
        const { count } = await db()
          .from("agent_commands")
          .select("id", { count: "exact", head: true })
          .eq("type", "start")
          .eq("instance", stopped[0])
          .gte("created_at", since);
        if (!count) await db().from("agent_commands").insert({ instance: stopped[0], type: "start", payload: { lobby: true } });
        await setNote(g, `запускаем сервер ${stopped[0]}…`);
      } else {
        await setNote(g, "все серверы для лобби заняты — ждём, когда освободится");
      }
      return; // по одному за тик
    }
    const { error } = await db().rpc("assign_game_server", { p_game: g.id, p_instance: inst, p_lobby: true });
    if (error) throw new Error("Не удалось назначить сервер лобби", { cause: error });
    return;
  }
}

async function setNote(g: LobbyGame, note: string) {
  if (g.note !== note) await db().from("lobby_games").update({ note }).eq("id", g.id);
}

/** Явно заданный адрес игрокам важнее сети лобби; иначе LAN использует адрес агента, интернет — UPnP. */
export async function lobbyAddress(g: LobbyGame, lanIp: string | null, upnpIp: string | null) {
  const configured = ((await getSetting("PLAYER_IP")) ?? "").trim();
  if (configured) return configured;
  return g.settings.network === "lan" ? lanIp || upnpIp : upnpIp || lanIp;
}

/** Конфиг MatchZy для игры лобби */
export async function buildLobbyConfig(gameId: string, observers: [string, string][]) {
  const g = await getGame(gameId);
  if (!g || g.maps.length === 0 || g.status === "cancelled" || g.status === "finished") return null;
  const s = g.settings;
  const players = (t: GameTeam) => Object.fromEntries(t.players.map((p) => [p.steam_id, p.nickname]));
  const humans = g.team1.players.length + g.team2.players.length;
  const bots = g.team1.bots.length + g.team2.bots.length;
  const inGame = new Set([...g.team1.players, ...g.team2.players].map((p) => p.steam_id));
  const { data: specs } = await db()
    .from("lobby_members")
    .select("player:players(steam_id, nickname)")
    .eq("lobby_id", g.lobby_id)
    .eq("slot", "spec");
  const spectators = [
    ...((specs ?? []) as unknown as { player: { steam_id: string; nickname: string } }[]).map((r) => [r.player.steam_id, r.player.nickname] as [string, string]),
    ...observers,
  ].filter(([id]) => !inGame.has(id));
  const perTeam = Math.max(g.team1.players.length + g.team1.bots.length, g.team2.players.length + g.team2.bots.length, 1);
  return {
    matchid: g.matchzy_id,
    team1: { name: g.team1.name, tag: "A", players: players(g.team1) },
    team2: { name: g.team2.name, tag: "B", players: players(g.team2) },
    num_maps: g.best_of,
    maplist: g.maps.map((m) => (m.map.includes("@") ? m.map.split("@")[1] : m.map)),
    map_sides: g.maps.map((_, i) => (s.knife ? "knife" : i % 2 === 0 ? "team1_ct" : "team2_ct")),
    skip_veto: true,
    clinch_series: true,
    players_per_team: perTeam,
    // боты MatchZy не считает — готовыми должны быть люди
    min_players_to_ready: Math.max(1, humans),
    wingman: modeOf(s.mode).wingman,
    min_spectators_to_ready: 0,
    spectators: { players: Object.fromEntries(spectators) },
    cvars: lobbyCvars(s, bots, humans),
  };
}

/** cvars, которые агент держит весь матч (только числа) */
export async function lobbyEnforce(gameId: string) {
  const g = await getGame(gameId);
  if (!g) return null;
  const humans = g.team1.players.length + g.team2.players.length;
  const bots = g.team1.bots.length + g.team2.bots.length;
  const all = lobbyCvars(g.settings, bots, humans);
  const keep = [
    "mp_maxrounds", "mp_freezetime", "mp_startmoney", "mp_maxmoney", "mp_damage_headshot_only",
    "sv_gravity", "sv_infinite_ammo", "bot_quota", "bot_difficulty", "tv_delay", "mp_match_restart_delay",
    // MatchZy загружает warmup/live.cfg после конфига матча и сбрасывает голосовые cvars.
    "sv_voiceenable", "sv_alltalk", "sv_deadtalk", "sv_full_alltalk",
    "sv_talk_enemy_living", "sv_talk_enemy_dead",
  ];
  const cvars = Object.fromEntries(keep.filter((k) => typeof all[k] === "number").map((k) => [k, all[k] as number]));
  return { matchid: g.matchzy_id, cvars };
}

/** Какую карту должен показать сервер (стандартная — id; workshop — по библиотеке прогрева) */
export function currentLobbyMap(g: LobbyGame) {
  return (g.maps.find((m) => m.status !== "finished") ?? g.maps[0])?.map ?? null;
}

// ───────────────────────── события MatchZy для игр лобби

type StatsPlayer = { steamid: string; name: string; stats: Record<string, number> };
type StatsTeam = { name?: string; score?: number; series_score?: number; players?: StatsPlayer[] };
export type LobbyEvent = {
  event: string;
  matchid?: number;
  map_number?: number;
  winner?: { side?: string; team?: string };
  team1?: StatsTeam;
  team2?: StatsTeam;
  team1_series_score?: number;
  team2_series_score?: number;
};

async function upsertLobbyStats(g: LobbyGame, mapNumber: number, ev: LobbyEvent) {
  const sides: [StatsTeam | undefined, 1 | 2][] = [
    [ev.team1, 1],
    [ev.team2, 2],
  ];
  // у ботов SteamID 0 — их не считаем
  const all = sides.flatMap(([t]) => t?.players ?? []).filter((p) => /^\d{17}$/.test(String(p.steamid)));
  if (!all.length) return;
  const { data: known } = await db().from("players").select("id, steam_id").in("steam_id", all.map((p) => String(p.steamid)));
  const ids = new Map((known ?? []).map((p) => [p.steam_id, p.id]));
  const rows = sides.flatMap(([t, team]) =>
    (t?.players ?? [])
      .filter((p) => /^\d{17}$/.test(String(p.steamid)))
      .map((p) => {
        const n = (k: string) => Number(p.stats?.[k] ?? 0) || 0;
        return {
          game_id: g.id,
          map_number: mapNumber,
          steam_id: String(p.steamid),
          player_id: ids.get(String(p.steamid)) ?? null,
          team,
          name: p.name,
          kills: n("kills"),
          deaths: n("deaths"),
          assists: n("assists"),
          damage: n("damage"),
          headshot_kills: n("headshot_kills"),
          rounds_played: n("rounds_played"),
          kast: n("kast"),
          first_kills: n("first_kills_t") + n("first_kills_ct"),
          clutch_wins: n("1v1") + n("1v2") + n("1v3") + n("1v4") + n("1v5"),
          mvp: n("mvp"),
          raw: p.stats ?? {},
          updated_at: new Date().toISOString(),
        };
      }),
  );
  await db().from("lobby_player_stats").upsert(rows, { onConflict: "game_id,map_number,steam_id" }).throwOnError();
}

/** Возвращает строки для чата игры (итог карты / матча) или null */
export async function handleLobbyEvent(ev: LobbyEvent): Promise<{ instance: string; lines: string[] } | null> {
  if (ev.matchid == null) return null;
  const { data } = await db().from("lobby_games").select("*").eq("matchzy_id", ev.matchid).maybeSingle().throwOnError();
  if (!data) return null;
  const g = data as LobbyGame;
  const idx = ev.map_number ?? 0;
  if (["going_live", "round_end"].includes(ev.event) && (g.status === "finished" || g.status === "cancelled" || g.maps[idx]?.status === "finished")) return null;
  const maps = [...g.maps];
  const setMap = (patch: Partial<GameMap>) => {
    if (maps[idx]) maps[idx] = { ...maps[idx], ...patch };
  };

  switch (ev.event) {
    case "going_live": {
      // series_start приходит сразу при загрузке конфига, ещё до игроков — «идёт» только с началом карты
      setMap({ status: "live" });
      await db()
        .from("lobby_games")
        .update({ status: g.status === "waiting" ? "live" : g.status, started_at: g.started_at ?? new Date().toISOString(), maps, note: null })
        .eq("id", g.id).in("status", ["waiting", "live"]).throwOnError();
      return null;
    }
    case "round_end": {
      setMap({ team1_score: ev.team1?.score ?? 0, team2_score: ev.team2?.score ?? 0, status: "live" });
      await db().from("lobby_games").update({ maps, status: g.status === "waiting" ? "live" : g.status }).eq("id", g.id).in("status", ["waiting", "live"]).throwOnError();
      await upsertLobbyStats(g, idx + 1, ev);
      return null;
    }
    case "map_result": {
      const winner = ev.winner?.team === "team1" ? 1 : ev.winner?.team === "team2" ? 2 : null;
      setMap({ team1_score: ev.team1?.score ?? 0, team2_score: ev.team2?.score ?? 0, status: "finished", winner });
      await upsertLobbyStats(g, idx + 1, ev);
      const s1 = maps.filter((m) => m.winner === 1).length;
      const s2 = maps.filter((m) => m.winner === 2).length;
      const need = Math.floor(g.best_of / 2) + 1;
      const done = s1 >= need || s2 >= need || maps.every((m) => m.status === "finished");
      await db()
        .from("lobby_games")
        .update({ maps, team1_score: s1, team2_score: s2, ...(done && { winner: s1 > s2 ? 1 : s2 > s1 ? 2 : null }) })
        .eq("id", g.id).throwOnError();
      if (done) await finishGame(g.id);
      const m = maps[idx];
      const lines = [`Карта ${idx + 1} (${mapTitle(m?.map ?? "")}): ${g.team1.name} ${m?.team1_score ?? 0}:${m?.team2_score ?? 0} ${g.team2.name}`];
      if (done) lines.push(`Матч окончен — ${s1 === s2 ? "ничья" : `победил ${s1 > s2 ? g.team1.name : g.team2.name}`}, ${s1}:${s2}. Спасибо за игру!`);
      else lines.push(`Серия ${g.team1.name} ${s1}:${s2} ${g.team2.name}`);
      return g.server_instance ? { instance: g.server_instance, lines } : null;
    }
    case "series_end": {
      const fresh = await getGame(g.id);
      if (fresh && fresh.status !== "finished") {
        const s1 = ev.team1_series_score ?? fresh.team1_score;
        const s2 = ev.team2_series_score ?? fresh.team2_score;
        await db()
          .from("lobby_games")
          .update({ team1_score: s1, team2_score: s2, winner: s1 > s2 ? 1 : s2 > s1 ? 2 : null })
          .eq("id", g.id).throwOnError();
        await finishGame(g.id);
      }
      return null;
    }
  }
  return null;
}

/** Игра окончена: сервер свободен, лобби — снова собирается (реванш) или закрывается */
export async function finishGame(gameId: string) {
  const { data } = await db()
    .from("lobby_games")
    .update({ status: "finished", finished_at: new Date().toISOString(), server_state: null, note: null })
    .eq("id", gameId)
    .in("status", ["waiting", "live"])
    .select("*")
    .maybeSingle();
  if (!data) return;
  const g = data as LobbyGame;
  const lobby = await getLobby(g.lobby_id);
  if (!lobby || lobby.status === "closed") return;
  const score = `${g.team1.name} ${g.team1_score}:${g.team2_score} ${g.team2.name}`;
  if (lobby.settings.rematch) {
    await touch(lobby.id, { status: "waiting" });
    await systemMessage(lobby.id, `Матч окончен: ${score}. Можно сыграть ещё раз тем же составом.`);
  } else {
    await closeLobby(lobby, `Матч окончен: ${score}. Лобби закрыто.`);
  }
}

/** Отменить игру (хост, пока она не началась на сервере, или админ) */
const NO_START_MS = 20 * 60_000;

/**
 * Сторож игр лобби (на каждой синхронизации агента):
 *  - сервер готов, но за 20 минут матч так и не начался — отменяем, сервер освобождается;
 *  - сервер явно говорит, что этого матча на нём больше нет (сняли из админки, MatchZy закончил без series_end) —
 *    засчитываем сыгранное или отменяем. Пустой ответ сервера (RCON не ответил) за «нет матча» не считаем.
 */
export async function lobbyGameWatchdog() {
  const { data } = await db()
    .from("lobby_games")
    .select("*")
    .in("status", ["waiting", "live"])
    .eq("server_state", "ready")
    .not("server_instance", "is", null);
  if (!data?.length) return;
  const { data: insts } = await db().from("server_instances").select("name, running, gamestate, matchzy_match_id, last_seen_at");
  const byName = new Map((insts ?? []).map((i) => [i.name, i]));
  const now = Date.now();
  for (const row of data) {
    const g = row as LobbyGame;
    const readyFor = g.server_ready_at ? now - new Date(g.server_ready_at).getTime() : 0;
    const inst = byName.get(g.server_instance!);
    const fresh = inst?.last_seen_at && now - new Date(inst.last_seen_at).getTime() < AGENT_OFFLINE_AFTER_MS;
    const gone =
      fresh && inst.running && readyFor > 60_000 && (inst.gamestate === "none" || (inst.matchzy_match_id != null && Number(inst.matchzy_match_id) !== Number(g.matchzy_id)));
    if (gone) {
      if (g.maps.some((m) => m.status === "finished")) {
        const s1 = g.maps.filter((m) => m.winner === 1).length;
        const s2 = g.maps.filter((m) => m.winner === 2).length;
        await db().from("lobby_games").update({ team1_score: s1, team2_score: s2, winner: s1 > s2 ? 1 : s2 > s1 ? 2 : null }).eq("id", g.id);
        await finishGame(g.id);
      } else {
        await cancelGame(g, "матч снят с сервера");
      }
    } else if (g.status === "waiting" && readyFor > NO_START_MS) {
      await cancelGame(g, "за 20 минут матч так и не начался");
    }
  }
}

export async function cancelGame(g: LobbyGame, reason: string) {
  if (g.server_instance) await db().from("agent_commands").insert({ instance: g.server_instance, type: "end_match", payload: {} });
  await db().from("lobby_games").update({ status: "cancelled", note: reason, server_instance: null, server_state: null, server_address: null }).eq("id", g.id);
  const lobby = await getLobby(g.lobby_id);
  if (lobby && lobby.status === "playing") await touch(lobby.id, { status: "waiting" });
  await systemMessage(g.lobby_id, `Игра отменена: ${reason}`);
}

// ───────────────────────── списки

/** Карты для выбора в лобби: официальные (кроме скрытых админом) и проверенные карты мастерской из библиотеки */
export async function lobbyMapCatalog() {
  const { CS2_MAPS } = await import("./maps");
  const { getDisabledMaps, getMapImages, getWorkshopMaps } = await import("./settings");
  const [disabled, images, workshop, { data: info }] = await Promise.all([
    getDisabledMaps(),
    getMapImages(),
    getWorkshopMaps(),
    db().from("app_settings").select("value").eq("key", "WORKSHOP_MAP_INFO").maybeSingle(),
  ]);
  let checked: Record<string, { ok?: boolean }> = {};
  try {
    checked = info?.value ? JSON.parse(info.value) : {};
  } catch {}
  const official = CS2_MAPS.filter((m) => !disabled.includes(m.id)).map((m) => ({ id: m.id as string, image: images[m.id] ?? null }));
  const ws = workshop.filter((w) => checked[w.split("@")[1]]?.ok !== false).map((w) => ({ id: w, image: images[w] ?? null }));
  return [...official, ...ws];
}

export type LobbyListItem = {
  code: string;
  visibility: Lobby["visibility"];
  status: Lobby["status"];
  host: { nickname: string; avatar_url: string | null };
  settings: LobbySettings;
  players: number;
  online: number;
  members: { nickname: string; avatar_url: string | null }[];
  game: { status: string; team1_score: number; team2_score: number; map: string | null } | null;
  created_at: string;
};

/** Открытые лобби для списка: публичные и закрытые, где кто-то есть на месте (приватные не показываем) */
export async function listOpenLobbies(): Promise<LobbyListItem[]> {
  const { data } = await db()
    .from("lobbies")
    .select("*, host:players!lobbies_host_id_fkey(nickname, avatar_url), members:lobby_members(slot, last_seen_at, player:players(nickname, avatar_url)), game:lobby_games!lobbies_current_game_fkey(status, team1_score, team2_score, maps)")
    .neq("status", "closed")
    .in("visibility", ["public", "closed"])
    .order("created_at", { ascending: false })
    .limit(60);
  type Row = Lobby & {
    host: { nickname: string; avatar_url: string | null };
    members: { slot: Slot; last_seen_at: string; player: { nickname: string; avatar_url: string | null } }[];
    game: { status: string; team1_score: number; team2_score: number; maps: GameMap[] } | null;
  };
  return ((data ?? []) as unknown as Row[])
    .map((r) => {
      const l = parseLobby(r as unknown as Record<string, unknown>)!;
      const inTeams = r.members.filter((m) => m.slot === "team1" || m.slot === "team2");
      return {
        code: l.code,
        visibility: l.visibility,
        status: l.status,
        host: r.host,
        settings: l.settings,
        players: inTeams.length + l.bots.team1.length + l.bots.team2.length,
        online: r.members.filter(isOnline).length,
        members: r.members.map((m) => m.player).slice(0, 10),
        game:
          r.game && ["veto", "waiting", "live"].includes(r.game.status)
            ? { status: r.game.status, team1_score: r.game.team1_score, team2_score: r.game.team2_score, map: (r.game.maps.find((m) => m.status === "live") ?? r.game.maps[0])?.map ?? null }
            : null,
        created_at: l.created_at,
      };
    })
    .filter((l) => l.online > 0 || l.status === "playing");
}

/** Карты, которые нельзя поставить в лобби: не официальные CS2 (или скрытые админом) и карты мастерской, которые не загрузились на сервере */
export async function badMaps(maps: string[]) {
  const { CS2_MAPS } = await import("./maps");
  const { getDisabledMaps } = await import("./settings");
  const [disabled, { data: info }] = await Promise.all([getDisabledMaps(), db().from("app_settings").select("value").eq("key", "WORKSHOP_MAP_INFO").maybeSingle()]);
  let checked: Record<string, { ok?: boolean }> = {};
  try {
    checked = info?.value ? JSON.parse(info.value) : {};
  } catch {}
  const official = new Set(CS2_MAPS.map((m) => m.id as string).filter((id) => !disabled.includes(id)));
  return maps.filter((m) => (m.includes("@") ? checked[m.split("@")[1]]?.ok === false : !official.has(m)));
}
