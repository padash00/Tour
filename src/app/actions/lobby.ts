"use server";

import { randomInt } from "node:crypto";
import { getT } from "@/lib/i18n/server";
import { z } from "zod";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BANNED_ERROR, isRateLimited } from "@/lib/data";
import { db } from "@/lib/supabase";
import {
  badMaps,
  captainsOf,
  cancelGame,
  checkInvite,
  checkPassword,
  closeLobby,
  draftPick,
  filterProblem,
  fitTeams,
  getGame,
  getLobbyByCode,
  getMembers,
  hashPassword,
  isOnline,
  lobbyVetoAct,
  lobbyVetoState,
  maybeStartOnReady,
  newCode,
  newToken,
  nextBotName,
  passHost,
  playerLobby,
  potProblem,
  READY_CHECK_SECONDS,
  setSlot,
  slotProblem,
  startDraft,
  startProblem,
  systemMessage,
  teamCount,
  isTeamSlot,
  type Lobby,
  type Slot,
} from "@/lib/lobby";
import { DEFAULT_SETTINGS, MAP_RE, normalizeSettings, playersNeeded, POT_FEE_MAX, POT_MAPS, type LobbySettings } from "@/lib/lobby-settings";
import { cupFormatAllowed, cupTeams } from "@/lib/cup-core";
import { cancelCup, cupOf, restartCupMatch, startCup } from "@/lib/cup";
import { fetchFaceitLastKnown } from "@/lib/faceit";
import { normalizeTiers, TIERS } from "@/lib/tiers";
import type { Player } from "@/lib/types";

export type LobbyResult = { error?: string; ok?: true; code?: string } | null;

const TEAM_SLOTS = ["team1", "team2", "team3", "team4", "team5", "team6", "team7", "team8"] as const;
const SLOTS: Slot[] = [...TEAM_SLOTS, "wait", "spec"];

// ───────────────────────── проверка аргументов (server actions вызываются с любыми данными, не только из нашего UI)

const Code = z.string().regex(/^[A-Za-z0-9]{3,16}$/);
const Id = z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
const SlotArg = z.enum([...TEAM_SLOTS, "wait", "spec"]);
/** Сколько игроков собирает лобби: 0 — обычное, 20/30/40 — несколько команд */
const PlayersArg = z.union([z.literal(0), z.literal(20), z.literal(30), z.literal(40)]);
const FormatArg = z.enum(["bracket", "round"]);
const MatchArg = z.string().regex(/^r\d{1,2}m\d{1,2}$/);
const TeamArg = z.enum(["team1", "team2"]);
const Visibility = z.enum(["public", "closed", "private"]);
const Password = z.string().max(64);
const Text = (max: number) => z.string().max(max);
const JoinOpts = z.object({ password: Password.optional(), invite: Text(64).optional(), slot: SlotArg.optional() });
const SettingsPatch = z.record(z.string(), z.unknown());
const TeamTool = z.enum(["balance", "shuffle", "swap", "clear"]);
const TiersArg = z.array(z.enum(TIERS)).min(1).max(TIERS.length);
const FeeArg = z.number().int().min(0).max(POT_FEE_MAX);

/** Поля «Десятки», которые нельзя менять формой настроек: режим задаётся при создании, отметки и ELO пишет сервер */
function withoutPotState<T extends Record<string, unknown>>(patch: T): T {
  const rest: Record<string, unknown> = { ...patch };
  for (const key of ["pot", "pot_paid", "pot_elo", "players", "cup_of"]) delete rest[key];
  return rest as T;
}

/**
 * ELO игрока для «Десятки» — свежее с FACEIT (на калибровке и после перерыва — последнее известное).
 * FACEIT не ответил — берём то, что уже знает сайт.
 */
async function potRating(p: Pick<Player, "steam_id" | "faceit_elo" | "faceit_level">) {
  const fresh = await fetchFaceitLastKnown(p.steam_id);
  return fresh ? { faceit_elo: fresh.elo, faceit_level: fresh.level } : { faceit_elo: p.faceit_elo, faceit_level: p.faceit_level };
}

/** null — все аргументы в порядке, иначе ошибка для ответа */
function invalid(...checks: [z.ZodType, unknown][]): LobbyResult {
  for (const [schema, value] of checks) if (!schema.safeParse(value).success) return { error: "Некорректный запрос — обновите страницу" };
  return null;
}

/** Пароль лобби: новый — от 4 символов; старые короткие пароли при входе по-прежнему принимаются */
const PASSWORD_MIN = 4;
const passwordError = (t: Awaited<ReturnType<typeof getT>>) => t("Пароль — от {min} до 32 символов", { min: PASSWORD_MIN });

// подбор пароля: не чаще попытки в 3 с, не больше 10 неверных за 10 минут с игрока.
// Общий лимит лобби (30 неверных) касается только тех, кто уже ошибался в этом лобби: иначе любой
// мог бы спамом закрыть вход всем, кто знает пароль.
const JOIN_FAILED = "lobby.join_failed";
async function failedJoins(by: { actor?: string; lobby?: string }, seconds: number) {
  let q = db()
    .from("audit_logs")
    .select("id", { count: "exact", head: true })
    .eq("action", JOIN_FAILED)
    .gte("created_at", new Date(Date.now() - seconds * 1000).toISOString());
  if (by.actor) q = q.eq("actor_id", by.actor);
  if (by.lobby) q = q.eq("entity_id", by.lobby);
  const { count } = await q;
  return count ?? 0;
}
async function passwordThrottle(playerId: string, lobbyId: string): Promise<string | null> {
  const t = await getT();
  const [recent, mine, mineHere, lobby] = await Promise.all([
    isRateLimited(playerId, JOIN_FAILED, 3),
    failedJoins({ actor: playerId }, 600),
    failedJoins({ actor: playerId, lobby: lobbyId }, 600),
    failedJoins({ lobby: lobbyId }, 600),
  ]);
  if (recent) return t("Слишком часто — подождите пару секунд");
  if (mine >= 10 || (mineHere > 0 && lobby >= 30)) return t("Слишком много неверных паролей — попробуйте через несколько минут или войдите по ссылке-приглашению");
  return null;
}
const touch = (id: string, patch: Record<string, unknown> = {}) => db().from("lobbies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);

async function me(): Promise<Player | { error: string }> {
  const t = await getT();
  const p = await getCurrentPlayer();
  if (!p) return { error: t("Войдите через Steam") };
  if (p.is_banned) return { error: t(BANNED_ERROR) };
  return p;
}

/**
 * «Десятка»: наблюдатель переходит в игроки — та же проверка тира, что на входе (наблюдателем пускают любого).
 * Возвращает текст отказа или null; ELO допущенного игрока записывается в настройки лобби.
 */
async function admitToPot(lobby: Lobby, p: Pick<Player, "id" | "steam_id" | "faceit_elo" | "faceit_level">, t: Awaited<ReturnType<typeof getT>>) {
  if (!lobby.settings.pot || lobby.settings.pot_elo[p.id]) return null;
  const rating = await potRating(p);
  const problem = potProblem(lobby.settings, rating, t);
  if (problem) return problem;
  const fresh = await getLobbyByCode(lobby.code);
  if (fresh && rating.faceit_elo) await touch(lobby.id, { settings: { ...fresh.settings, pot_elo: { ...fresh.settings.pot_elo, [p.id]: rating.faceit_elo } } });
  return null;
}

/** Лобби + игрок + проверка: хост (или админ сайта) */
async function asHost(code: string): Promise<{ lobby: Lobby; player: Player } | { error: string }> {
  const t = await getT();
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: t("Лобби не найдено или закрыто") };
  if (lobby.host_id !== player.id && !isAdmin(player)) return { error: t("Это может только хост лобби") };
  return { lobby, player };
}

async function asMember(code: string): Promise<{ lobby: Lobby; player: Player; slot: Slot } | { error: string }> {
  const t = await getT();
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: t("Лобби не найдено или закрыто") };
  const { data } = await db().from("lobby_members").select("slot").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  if (!data) return { error: t("Вы не в этом лобби") };
  return { lobby, player, slot: data.slot as Slot };
}

// ───────────────────────── создание, вход, выход

export async function createLobby(visibility: Lobby["visibility"], password: string, players: number = 0, format: "bracket" | "round" = "bracket"): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Visibility, visibility], [Password, password], [PlayersArg, players], [FormatArg, format]);
  if (bad) return bad;
  const many = cupTeams(players) > 0;
  if (many && !cupFormatAllowed(cupTeams(players), format)) return { error: t("Круговая — только на 20 игроков: на большее число команд матчей слишком много") };
  const player = await me();
  if ("error" in player) return player;
  if (!["public", "closed", "private"].includes(visibility)) return { error: t("Неизвестный тип лобби") };
  const pw = password.trim();
  if (visibility !== "public" && (pw.length < PASSWORD_MIN || pw.length > 32)) return { error: passwordError(t) };
  const other = await playerLobby(player.id);
  if (other) return { error: t("Вы уже в другом лобби — выйдите из него"), code: other.code };

  // последние настройки этого хоста — удобно пересоздавать
  const { data: last } = await db().from("lobbies").select("settings").eq("host_id", player.id).order("created_at", { ascending: false }).limit(1);
  // настройки «Десятки» в обычное лобби не переносим
  const inherited = normalizeSettings({ ...((last?.[0]?.settings ?? DEFAULT_SETTINGS) as object), players: 0, cup_of: null });
  const base = inherited.pot ? DEFAULT_SETTINGS : inherited;
  // несколько команд: игроков разбирают капитаны, карты — бан-пиком из соревновательного пула
  const settings = many ? normalizeSettings({ ...base, players, cup_format: format, map_choice: "veto", maps: base.maps.length >= base.best_of + 1 ? base.maps : POT_MAPS }) : base;
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data, error } = await db()
      .from("lobbies")
      .insert({
        code,
        host_id: player.id,
        visibility,
        password_hash: visibility === "public" ? null : await hashPassword(pw),
        invite_token: newToken(),
        settings,
        team1_name: `team_${player.nickname}`.replace(/[\u0000-\u001f";#|]/g, "").slice(0, 24),
        team2_name: "Команда B",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue; // код занят — другой
      return { error: error.message };
    }
    await db().from("lobby_members").insert({ lobby_id: data.id, player_id: player.id, slot: many ? "wait" : "team1" });
    await systemMessage(data.id, many ? `${player.nickname} собирает лобби на ${players} игроков: ${cupTeams(players)} команд по 5, ${format === "round" ? "круговая" : "сетка"}` : `${player.nickname} создал лобби`);
    await audit(player.id, "lobby.create", { type: "lobby", id: data.id }, { visibility, ...(many && { players, format }) });
    return { ok: true, code };
  }
  return { error: t("Не удалось создать лобби — попробуйте ещё раз") };
}

/**
 * «Десятка»: игра на банк между игроками. Создать может любой игрок, подходящий под свои же тиры.
 * Взносы игроки передают организатору сами — сайт только показывает банк и отметки организатора.
 */
export async function createPot(tiers: string[], fee: number, visibility: Lobby["visibility"], password: string, players: number = 0, format: "bracket" | "round" = "bracket"): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([TiersArg, tiers], [FeeArg, fee], [Visibility, visibility], [Password, password], [PlayersArg, players], [FormatArg, format]);
  if (bad) return bad;
  const many = cupTeams(players) > 0;
  if (many && !cupFormatAllowed(cupTeams(players), format)) return { error: t("Круговая — только на 20 игроков: на большее число команд матчей слишком много") };
  const player = await me();
  if ("error" in player) return player;
  const pw = password.trim();
  if (visibility !== "public" && (pw.length < PASSWORD_MIN || pw.length > 32)) return { error: passwordError(t) };
  const other = await playerLobby(player.id);
  if (other) return { error: t("Вы уже в другом лобби — выйдите из него"), code: other.code };

  // карты, скрытые админом клуба, в пул не берём
  const bannedMaps = new Set(await badMaps(POT_MAPS));
  const pool = POT_MAPS.filter((m) => !bannedMaps.has(m));
  const settings = normalizeSettings({
    ...DEFAULT_SETTINGS,
    pot: true,
    pot_tiers: normalizeTiers(tiers),
    pot_fee: fee,
    best_of: 3,
    map_choice: "veto",
    maps: pool.length >= 4 ? pool : POT_MAPS,
    rematch: false,
    players: many ? players : 0,
    cup_format: format,
  });
  const rating = await potRating(player);
  const problem = potProblem(settings, rating, t);
  if (problem) return { error: problem };
  if (rating.faceit_elo) settings.pot_elo = { [player.id]: rating.faceit_elo };

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data, error } = await db()
      .from("lobbies")
      .insert({
        code,
        host_id: player.id,
        visibility,
        password_hash: visibility === "public" ? null : await hashPassword(pw),
        invite_token: newToken(),
        settings,
        team1_name: "Команда A",
        team2_name: "Команда B",
      })
      .select("id")
      .single();
    if (error) {
      if (error.code === "23505") continue;
      return { error: error.message };
    }
    // организатор — в общий список: капитанов определит ELO, а не он сам
    await db().from("lobby_members").insert({ lobby_id: data.id, player_id: player.id, slot: "wait" });
    await systemMessage(data.id, `${player.nickname} собирает «${many ? `${players}к` : "Десятку"}»: тиры ${settings.pot_tiers.join(", ")}${fee > 0 ? `, взнос ${fee.toLocaleString("ru-RU")} тг` : ", без взноса"}`);
    await audit(player.id, "lobby.create", { type: "lobby", id: data.id }, { visibility, pot: true, tiers: settings.pot_tiers, fee });
    return { ok: true, code };
  }
  return { error: t("Не удалось создать лобби — попробуйте ещё раз") };
}

/** Организатор «Десятки» отмечает, что игрок передал ему взнос (или снимает отметку) */
export async function togglePaid(code: string, playerId: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Id, playerId]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (!lobby.settings.pot) return { error: t("Это не «Десятка»") };
  const members = await getMembers(lobby.id);
  if (!members.some((m) => m.player_id === playerId)) return { error: t("Игрок уже вышел") };
  const paid = lobby.settings.pot_paid.includes(playerId) ? lobby.settings.pot_paid.filter((id) => id !== playerId) : [...lobby.settings.pot_paid, playerId];
  await touch(lobby.id, { settings: { ...lobby.settings, pot_paid: paid } });
  return { ok: true };
}

export async function joinLobby(code: string, opts: { password?: string; invite?: string; slot?: Slot }): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [JoinOpts, opts]);
  if (bad) return bad;
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: t("Лобби не найдено или закрыто") };
  const members = await getMembers(lobby.id);
  if (members.some((m) => m.player_id === player.id)) return { ok: true, code: lobby.code };

  const { data: banned } = await db().from("lobby_bans").select("player_id").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  // админ сайта заходит в любое лобби: без пароля и несмотря на запрет хоста
  const admin = isAdmin(player);
  if (banned && !admin) return { error: t("Хост запретил вам вход в это лобби") };
  if (lobby.visibility !== "public" && !admin && !checkInvite(opts.invite, lobby)) {
    const throttled = await passwordThrottle(player.id, lobby.id);
    if (throttled) return { error: throttled };
    if (!(await checkPassword(opts.password ?? "", lobby.password_hash))) {
      await audit(player.id, JOIN_FAILED, { type: "lobby", id: lobby.id });
      return { error: t("Неверный пароль") };
    }
  }
  const filter = await filterProblem(lobby.settings, player, t);
  if (filter) return { error: filter };
  // «Десятка»: играть пускаем только с подходящим тиром; наблюдателем — любого
  let potEloNow: number | null = null;
  if (lobby.settings.pot && opts.slot !== "spec") {
    const rating = await potRating(player);
    const problem = potProblem(lobby.settings, rating, t);
    if (problem) return { error: problem };
    potEloNow = rating.faceit_elo;
  }
  const other = await playerLobby(player.id);
  if (other) return { error: t("Вы уже в другом лобби — выйдите из него"), code: other.code };

  // куда встать: просили слот — туда, иначе в команду, где меньше (если можно), иначе в ожидание
  let slot: Slot = opts.slot && SLOTS.includes(opts.slot) ? opts.slot : "wait";
  // в команду сам — только если хост разрешил, нет драфта / пика капитанов и не идёт проверка готовности
  const teamsOpen = lobby.settings.allow_join_team && lobby.settings.player_pick !== "captains" && !lobby.draft && !lobby.ready_check_until;
  if (!opts.slot && teamsOpen) {
    const c1 = teamCount(lobby, members, "team1");
    const c2 = teamCount(lobby, members, "team2");
    const size = lobby.settings.team_size;
    if (c1 < size || c2 < size) slot = c1 <= c2 && c1 < size ? "team1" : "team2";
  }
  if (isTeamSlot(slot) && !teamsOpen) slot = "wait";
  let problem = slotProblem(lobby, members, slot, player.id, t);
  if (problem && slot !== "spec") {
    slot = "wait";
    problem = slotProblem(lobby, members, slot, player.id);
  }
  if (problem) return { error: problem };

  const { error } = await db().from("lobby_members").insert({ lobby_id: lobby.id, player_id: player.id, slot });
  if (error) return { error: t("Не удалось войти — обновите страницу") };
  if (isTeamSlot(slot)) {
    // двое зашли в одну секунду — места проверяем ещё раз уже после записи
    const after = await getMembers(lobby.id);
    if (teamCount(lobby, after, slot) > lobby.settings.team_size) await setSlot(lobby.id, player.id, "wait");
  }
  if (potEloNow) {
    // ELO, с которым игрок допущен: настройки перечитываем, чтобы не затереть отметки соседнего входа
    const fresh = await getLobbyByCode(lobby.code);
    if (fresh) await touch(lobby.id, { settings: { ...fresh.settings, pot_elo: { ...fresh.settings.pot_elo, [player.id]: potEloNow } } });
  } else await touch(lobby.id);
  await systemMessage(lobby.id, `${player.nickname} зашёл в лобби`);
  return { ok: true, code: lobby.code };
}

export async function leaveLobby(code: string): Promise<LobbyResult> {
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player, slot } = ctx;
  // идут матчи сетки: состав команды зафиксирован, выйти можно после них (или организатор остановит матчи)
  if (lobby.status === "playing" && cupTeams(lobby.settings.players) > 0 && isTeamSlot(slot)) {
    return { error: (await getT())("Идут матчи — выйти из лобби можно после них") };
  }
  await db().from("lobby_members").delete().eq("lobby_id", lobby.id).eq("player_id", player.id);
  await systemMessage(lobby.id, `${player.nickname} вышел из лобби`);
  if (lobby.draft?.captains.includes(player.id)) {
    await touch(lobby.id, { draft: null });
    await systemMessage(lobby.id, "Капитан вышел — драфт отменён");
  }
  if (lobby.host_id === player.id) await passHost(lobby, player.id);
  else await touch(lobby.id);
  // шла проверка готовности — остальные могли быть уже готовы
  if (lobby.ready_check_until) await maybeStartOnReady(lobby.id);
  return { ok: true };
}

// ───────────────────────── слоты

export async function moveSelf(code: string, slot: Slot): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [SlotArg, slot]);
  if (bad) return bad;
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (!SLOTS.includes(slot)) return { error: t("Неизвестное место") };
  const isHost = lobby.host_id === player.id;
  if (lobby.status === "playing" && cupTeams(lobby.settings.players) > 0) return { error: t("Идут матчи — составы менять нельзя") };
  if (isTeamSlot(slot) && !isHost) {
    if (lobby.draft) return { error: t("Идёт драфт — игроков выбирают капитаны") };
    if (!lobby.settings.allow_join_team) return { error: t("В команды расставляет хост") };
    if (lobby.settings.player_pick === "captains") return { error: t("Составы собирают капитаны через драфт") };
  }
  if (lobby.ready_check_until) return { error: t("Идёт проверка готовности") };
  const problem = slotProblem(lobby, await getMembers(lobby.id), slot, player.id, t);
  if (problem) return { error: problem };
  if (slot !== "spec") {
    const denied = await admitToPot(lobby, player, t);
    if (denied) return { error: denied };
  }
  await setSlot(lobby.id, player.id, slot);
  return { ok: true };
}

export async function movePlayer(code: string, playerId: string, slot: Slot): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Id, playerId], [SlotArg, slot]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (!SLOTS.includes(slot)) return { error: t("Неизвестное место") };
  if (lobby.draft) return { error: t("Идёт драфт") };
  if (lobby.status === "playing" && cupTeams(lobby.settings.players) > 0) return { error: t("Идут матчи — составы менять нельзя") };
  const members = await getMembers(lobby.id);
  const target = members.find((m) => m.player_id === playerId);
  if (!target) return { error: t("Игрок уже вышел") };
  const problem = slotProblem(lobby, members, slot, playerId, t);
  if (problem) return { error: problem };
  if (slot !== "spec") {
    const denied = await admitToPot(lobby, target.player, t);
    if (denied) return { error: `${target.player.nickname}: ${denied}` };
  }
  await setSlot(lobby.id, playerId, slot);
  return { ok: true };
}

export async function kickPlayer(code: string, playerId: string, ban: boolean): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Id, playerId], [z.boolean(), ban]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (playerId === lobby.host_id) return { error: t("Хоста выгнать нельзя — сначала передайте хоста") };
  const members = await getMembers(lobby.id);
  const target = members.find((m) => m.player_id === playerId);
  await db().from("lobby_members").delete().eq("lobby_id", lobby.id).eq("player_id", playerId);
  if (ban) await db().from("lobby_bans").upsert({ lobby_id: lobby.id, player_id: playerId });
  await touch(lobby.id, lobby.draft?.captains.includes(playerId) ? { draft: null } : {});
  if (target) await systemMessage(lobby.id, `${player.nickname} ${ban ? "забанил" : "выгнал"} ${target.player.nickname}`);
  if (lobby.ready_check_until) await maybeStartOnReady(lobby.id);
  return { ok: true };
}

export async function unbanPlayer(code: string, playerId: string): Promise<LobbyResult> {
  const bad = invalid([Code, code], [Id, playerId]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await db().from("lobby_bans").delete().eq("lobby_id", ctx.lobby.id).eq("player_id", playerId);
  return { ok: true };
}

export async function transferHost(code: string, playerId: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Id, playerId]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const members = await getMembers(ctx.lobby.id);
  const target = members.find((m) => m.player_id === playerId);
  if (!target) return { error: t("Игрок уже вышел") };
  await touch(ctx.lobby.id, { host_id: playerId });
  await systemMessage(ctx.lobby.id, `Новый хост — ${target.player.nickname}`);
  return { ok: true };
}

// ───────────────────────── команды: имена, боты, перемешать, баланс

export async function setTeamName(code: string, team: "team1" | "team2", name: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [TeamArg, team], [Text(200), name]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const clean = name.replace(/[\u0000-\u001f";#|]/g, "").trim().slice(0, 24);
  if (clean.length < 2) return { error: t("Название — от 2 символов") };
  await touch(ctx.lobby.id, { [team === "team1" ? "team1_name" : "team2_name"]: clean });
  return { ok: true };
}

export async function addBot(code: string, team: "team1" | "team2"): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [TeamArg, team]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: t("Игра уже идёт") };
  if (lobby.draft) return { error: t("Идёт драфт") };
  if (lobby.settings.pot) return { error: t("В «Десятке» играют без ботов") };
  if (cupTeams(lobby.settings.players) > 0 || lobby.settings.cup_of) return { error: t("В лобби на несколько команд играют без ботов") };
  if (teamCount(lobby, await getMembers(lobby.id), team) >= lobby.settings.team_size) return { error: t("В команде нет мест") };
  const bots = { ...lobby.bots, [team]: [...lobby.bots[team], nextBotName(lobby)] };
  await touch(lobby.id, { bots });
  return { ok: true };
}

export async function removeBot(code: string, team: "team1" | "team2", name: string): Promise<LobbyResult> {
  const bad = invalid([Code, code], [TeamArg, team], [Text(64), name]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  const bots = { ...lobby.bots, [team]: lobby.bots[team].filter((b) => b !== name) };
  await touch(lobby.id, { bots });
  return { ok: true };
}

/** Командные инструменты хоста: баланс по ELO, перемешать, поменять местами, очистить */
export async function teamTool(code: string, tool: "balance" | "shuffle" | "swap" | "clear"): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [TeamTool, tool]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: t("Игра уже идёт") };
  if (lobby.draft) return { error: t("Идёт драфт") };
  if (lobby.settings.pot && (tool === "balance" || tool === "shuffle")) return { error: t("В «Десятке» составы собирают капитаны") };
  if (lobby.settings.cup_of) return { error: t("Составы матча заданы сеткой") };
  if (cupTeams(lobby.settings.players) > 0 && tool !== "clear") return { error: t("В лобби на несколько команд составы собирают капитаны") };
  const members = await getMembers(lobby.id);
  const inTeams = members.filter((m) => isTeamSlot(m.slot));
  const assign = async (team1: string[], team2: string[]) => {
    for (const id of team1) await setSlot(lobby.id, id, "team1");
    for (const id of team2) await setSlot(lobby.id, id, "team2");
  };

  if (tool === "clear") {
    for (const m of inTeams) await setSlot(lobby.id, m.player_id, "wait");
    await touch(lobby.id, { bots: { team1: [], team2: [] } });
    await systemMessage(lobby.id, "Команды очищены");
  } else if (tool === "swap") {
    await assign(inTeams.filter((m) => m.slot === "team2").map((m) => m.player_id), inTeams.filter((m) => m.slot === "team1").map((m) => m.player_id));
    await touch(lobby.id, { bots: { team1: lobby.bots.team2, team2: lobby.bots.team1 }, team1_name: lobby.team2_name, team2_name: lobby.team1_name });
  } else if (tool === "shuffle") {
    const ids = inTeams.map((m) => m.player_id);
    for (let i = ids.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      [ids[i], ids[j]] = [ids[j], ids[i]];
    }
    const half = Math.ceil(ids.length / 2);
    await assign(ids.slice(0, half), ids.slice(half));
    await systemMessage(lobby.id, "Команды перемешаны");
  } else {
    // баланс: по ELO FACEIT (без него — 1000), сильнейший — в команду со слабее суммой
    const rated = inTeams.map((m) => ({ id: m.player_id, elo: m.player.faceit_elo ?? 1000 })).sort((a, b) => b.elo - a.elo);
    const half = Math.ceil(rated.length / 2);
    const t1: typeof rated = [];
    const t2: typeof rated = [];
    const sum = (l: typeof rated) => l.reduce((s, x) => s + x.elo, 0);
    for (const p of rated) {
      if (t1.length >= half) t2.push(p);
      else if (t2.length >= rated.length - half) t1.push(p);
      else (sum(t1) <= sum(t2) ? t1 : t2).push(p);
    }
    await assign(t1.map((x) => x.id), t2.map((x) => x.id));
    await systemMessage(lobby.id, `Баланс по ELO: ${Math.round(sum(t1) / Math.max(1, t1.length))} против ${Math.round(sum(t2) / Math.max(1, t2.length))}`);
  }
  await fitTeams((await getLobbyByCode(code))!);
  return { ok: true };
}

// ───────────────────────── настройки

export async function updateSettings(code: string, patch: Partial<LobbySettings>): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [SettingsPatch, patch]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: t("Настройки меняются между играми") };
  if (lobby.settings.pot && lobby.draft && (patch.pot_tiers || patch.pot_fee != null)) return { error: t("Идёт выбор игроков — тиры и взнос уже не меняются") };
  const next = normalizeSettings({ ...lobby.settings, ...withoutPotState(patch) });
  if (patch.maps) {
    const bad = await badMaps(next.maps);
    if (bad.length) return { error: t("Эту карту поставить нельзя: {maps}", { maps: bad.join(", ") }) };
  }
  await touch(lobby.id, { settings: next, ready_check_until: null });
  if (next.team_size < lobby.settings.team_size) await fitTeams({ ...lobby, settings: next });
  return { ok: true };
}

export async function setVisibility(code: string, visibility: Lobby["visibility"], password: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Visibility, visibility], [Password, password]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  if (!["public", "closed", "private"].includes(visibility)) return { error: t("Неизвестный тип лобби") };
  const pw = password.trim();
  const patch: Record<string, unknown> = { visibility };
  if (visibility === "public") patch.password_hash = null;
  else if (pw) {
    if (pw.length < PASSWORD_MIN || pw.length > 32) return { error: passwordError(t) };
    patch.password_hash = await hashPassword(pw);
  } else if (!ctx.lobby.password_hash) return { error: t("Задайте пароль") };
  await touch(ctx.lobby.id, patch);
  return { ok: true };
}

/** Новая ссылка-приглашение (старая перестаёт пускать) */
export async function resetInvite(code: string): Promise<LobbyResult> {
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await touch(ctx.lobby.id, { invite_token: newToken() });
  return { ok: true };
}

export async function saveTemplate(name: string, settings: Partial<LobbySettings>): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Text(200), name], [SettingsPatch, settings]);
  if (bad) return bad;
  const player = await me();
  if ("error" in player) return player;
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) return { error: t("Название шаблона — от 2 символов") };
  const { count } = await db().from("lobby_templates").select("id", { count: "exact", head: true }).eq("player_id", player.id);
  if ((count ?? 0) >= 20) return { error: t("Не больше 20 шаблонов — удалите ненужные") };
  await db().from("lobby_templates").insert({ player_id: player.id, name: clean, settings: normalizeSettings({ ...settings, pot: false }) });
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<LobbyResult> {
  const bad = invalid([Id, id]);
  if (bad) return bad;
  const player = await me();
  if ("error" in player) return player;
  await db().from("lobby_templates").delete().eq("id", id).eq("player_id", player.id);
  return { ok: true };
}

export async function myTemplates(): Promise<{ id: string; name: string; settings: LobbySettings }[]> {
  const player = await getCurrentPlayer();
  if (!player) return [];
  const { data } = await db().from("lobby_templates").select("id, name, settings").eq("player_id", player.id).order("created_at");
  return (data ?? []).map((t) => ({ ...t, settings: normalizeSettings(t.settings) })) as { id: string; name: string; settings: LobbySettings }[];
}

/** Карта из мастерской по ссылке или ID: название и превью из Steam */
export async function lookupWorkshop(input: string): Promise<{ error?: string; map?: string; title?: string; image?: string | null }> {
  const t = await getT();
  if (!Text(500).safeParse(input).success) return { error: t("Вставьте ссылку на карту в мастерской Steam или её ID") };
  const id = /(?:id=)?(\d{6,12})/.exec(input.trim())?.[1];
  if (!id) return { error: t("Вставьте ссылку на карту в мастерской Steam или её ID") };
  try {
    const res = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ itemcount: "1", "publishedfileids[0]": id }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { response?: { publishedfiledetails?: { result: number; title?: string; preview_url?: string; consumer_app_id?: number }[] } };
    const d = json.response?.publishedfiledetails?.[0];
    if (!d || d.result !== 1) return { error: t("Карта не найдена в мастерской (или она скрыта)") };
    if (d.consumer_app_id && d.consumer_app_id !== 730) return { error: t("Это не карта Counter-Strike") };
    const slug = (d.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    const map = `${slug.length >= 2 ? slug : "workshop"}@${id}`;
    if (!MAP_RE.test(map)) return { error: t("Не удалось разобрать карту") };
    return { map, title: d.title ?? map, image: d.preview_url ?? null };
  } catch {
    return { error: t("Steam не ответил — попробуйте ещё раз") };
  }
}

// ───────────────────────── готовность и старт

export async function toggleReady(code: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player, slot } = ctx;
  if (!isTeamSlot(slot)) return { error: t("Готовность — для игроков команд") };
  const { data } = await db().from("lobby_members").select("ready").eq("lobby_id", lobby.id).eq("player_id", player.id).single();
  await db().from("lobby_members").update({ ready: !data?.ready }).eq("lobby_id", lobby.id).eq("player_id", player.id);
  await touch(lobby.id);
  await maybeStartOnReady(lobby.id);
  return { ok: true };
}

/** «Начать матч»: проверка готовности на 30 секунд; если в командах только хост — сразу */
export async function startMatch(code: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  const members = await getMembers(lobby.id);
  const problem = startProblem(lobby, members, t);
  if (problem) return { error: problem };
  // кто не на странице — не блокирует старт: не подтвердил готовность за 30 с — уходит в ожидание
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", lobby.id);
  await db().from("lobby_members").update({ ready: true }).eq("lobby_id", lobby.id).eq("player_id", player.id);
  await touch(lobby.id, { ready_check_until: new Date(Date.now() + READY_CHECK_SECONDS * 1000).toISOString() });
  await systemMessage(lobby.id, `Проверка готовности — ${READY_CHECK_SECONDS} секунд`);
  await maybeStartOnReady(lobby.id);
  return { ok: true };
}

export async function cancelReadyCheck(code: string): Promise<LobbyResult> {
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await touch(ctx.lobby.id, { ready_check_until: null });
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", ctx.lobby.id);
  await systemMessage(ctx.lobby.id, "Хост отменил проверку готовности");
  return { ok: true };
}

export async function cancelCurrentGame(code: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const g = ctx.lobby.current_game_id ? await getGame(ctx.lobby.current_game_id) : null;
  if (!g || !["veto", "waiting", "live"].includes(g.status)) return { error: t("Игры нет") };
  if (g.status === "live" && !isAdmin(ctx.player)) return { error: t("Матч уже идёт на сервере — его может остановить только админ") };
  await cancelGame(g, `отменил ${ctx.player.nickname}`);
  return { ok: true };
}

export async function closeLobbyAction(code: string): Promise<LobbyResult> {
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  // идут матчи сетки — сначала закрываем их комнаты
  if (ctx.lobby.status === "playing" && cupOf(ctx.lobby)?.state === "playing") await cancelCup(ctx.lobby, ctx.player.nickname);
  await closeLobby(ctx.lobby, `${ctx.player.nickname} закрыл лобби`);
  return { ok: true };
}

// ───────────────────────── драфт и вето

/**
 * Начать выбор игроков капитанами. captains — кого организатор назначил капитанами (в «Десятке» и в лобби
 * на несколько команд); не передан — капитанами становятся самые высокие по ELO.
 */
export async function beginDraft(code: string, captains?: string[]): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [z.array(Id).max(8).optional(), captains]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: t("Игра уже идёт") };
  if (lobby.settings.cup_of) return { error: t("Составы матча заданы сеткой") };
  const members = await getMembers(lobby.id);
  if (lobby.settings.pot || cupTeams(lobby.settings.players) > 0) return beginSnakeDraft(lobby, members, t, captains);
  let [c1, c2] = captainsOf({ ...lobby, draft: null }, members);
  // капитанов нет в обеих командах — случайные из тех, кто на месте
  if (!c1 || !c2) {
    const pool = members.filter((m) => m.slot !== "spec" && isOnline(m) && m.player_id !== c1 && m.player_id !== c2).map((m) => m.player_id);
    const pick = () => (pool.length ? pool.splice(randomInt(pool.length), 1)[0] : null);
    c1 ??= pick();
    c2 ??= pick();
  }
  if (!c1 || !c2 || c1 === c2) return { error: t("Для драфта нужны хотя бы двое игроков") };
  await startDraft(lobby, [c1, c2]);
  return { ok: true };
}

/**
 * Выбор игроков змейкой («Десятка» и лобби на несколько команд): участников ровно столько, сколько мест;
 * ELO каждого фиксируется сейчас; капитаны — кого назначил организатор, иначе самые высокие по ELO;
 * первым выбирает капитан с меньшим ELO, дальше змейкой.
 */
async function beginSnakeDraft(lobby: Lobby, members: Awaited<ReturnType<typeof getMembers>>, t: Awaited<ReturnType<typeof getT>>, chosen?: string[]): Promise<LobbyResult> {
  const need = playersNeeded(lobby.settings);
  const teams = cupTeams(lobby.settings.players) || 2;
  const players = members.filter((m) => m.slot !== "spec");
  if (players.length < need) return { error: t("Нужно {need} игроков — сейчас {n}", { need, n: players.length }) };
  if (players.length > need) return { error: t("В игре {need} мест, а игроков {n} — лишних переведите в наблюдатели", { need, n: players.length }) };
  const rated = await Promise.all(
    players.map(async (m) => {
      // свежий рейтинг с FACEIT нужен только игре на банк (тиры); без банка хватает того, что знает сайт
      const fresh = lobby.settings.pot ? await fetchFaceitLastKnown(m.player.steam_id) : null;
      return { m, elo: fresh?.elo ?? lobby.settings.pot_elo[m.player_id] ?? m.player.faceit_elo ?? null };
    }),
  );
  // рейтинг обязателен только в игре на банк: по нему считаются тиры
  const unrated = lobby.settings.pot ? rated.filter((r) => !r.elo) : [];
  if (unrated.length) return { error: t("Нет рейтинга FACEIT: {names} — замените игрока", { names: unrated.map((r) => r.m.player.nickname).join(", ") }) };
  const order = [...rated].sort((a, b) => (b.elo ?? 0) - (a.elo ?? 0) || a.m.joined_at.localeCompare(b.m.joined_at));
  let caps = order.slice(0, teams);
  if (chosen?.length) {
    if (chosen.length !== teams || new Set(chosen).size !== teams) return { error: t("Нужно выбрать капитанов: {n}", { n: teams }) };
    caps = order.filter((r) => chosen.includes(r.m.player_id));
    if (caps.length !== teams) return { error: t("Капитан должен быть среди игроков лобби") };
  }
  // первым выбирает капитан с меньшим ELO
  caps = [...caps].reverse();
  const teamName = (nick: string) => `team_${nick}`.replace(/[\u0000-\u001f";#|]/g, "").slice(0, 24);
  const settings = { ...lobby.settings, pot_elo: Object.fromEntries(rated.filter((r) => r.elo).map((r) => [r.m.player_id, r.elo!])) };
  await startDraft(lobby, caps.map((r) => r.m.player_id), { snake: true, settings, teamNames: caps.map((r) => teamName(r.m.player.nickname)) });
  return { ok: true };
}

export async function pickInDraft(code: string, playerId: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Id, playerId]);
  if (bad) return bad;
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (!lobby.draft) return { error: t("Драфт не идёт") };
  if (lobby.draft.captains[lobby.draft.turn - 1] !== player.id) return { error: t("Сейчас выбирает другой капитан") };
  const err = await draftPick(lobby, playerId, false, t);
  return err ? { error: err } : { ok: true };
}

export async function lobbyVeto(code: string, map: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Text(120), map]);
  if (bad) return bad;
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  const g = lobby?.current_game_id ? await getGame(lobby.current_game_id) : null;
  if (!lobby || !g || g.status !== "veto") return { error: t("Вето сейчас не идёт") };
  const st = lobbyVetoState(g);
  if (!st.current?.team) return { error: t("Вето завершено") };
  const team = st.current.team === 1 ? g.team1 : g.team2;
  // ход капитана команды; за команду из одних ботов выбирает хост
  const captain = team.players[0]?.id ?? lobby.host_id;
  if (captain !== player.id) return { error: team.players.length ? t("Сейчас выбирает капитан {name}", { name: team.name }) : t("За команду ботов выбирает хост") };
  const err = await lobbyVetoAct(g, map, false, t);
  return err ? { error: err } : { ok: true };
}

// ───────────────────────── лобби на несколько команд: матчи сетки

/** Организатор начинает матчи: команды собраны, строится сетка, первые матчи получают комнаты */
export async function startCupMatches(code: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const mapProblem = (await import("@/lib/lobby-settings")).mapsProblem(ctx.lobby.settings, t);
  if (mapProblem) return { error: mapProblem };
  const problem = await startCup(ctx.lobby);
  return problem ? { error: t(problem) } : { ok: true };
}

/** Организатор останавливает все матчи: комнаты закрываются, составы остаются */
export async function stopCupMatches(code: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const problem = await cancelCup(ctx.lobby, ctx.player.nickname);
  return problem ? { error: t(problem) } : { ok: true };
}

/** Организатор запускает отменённый матч заново */
export async function restartCupMatchAction(code: string, match: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [MatchArg, match]);
  if (bad) return bad;
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const problem = await restartCupMatch(ctx.lobby, match);
  return problem ? { error: t(problem) } : { ok: true };
}

// ───────────────────────── чат

export async function sendLobbyMessage(code: string, body: string): Promise<LobbyResult> {
  const t = await getT();
  const bad = invalid([Code, code], [Text(4000), body]);
  if (bad) return bad;
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return { error: t("Лобби не найдено") };
  const { data: member } = await db().from("lobby_members").select("player_id").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  if (!member && !isAdmin(player)) return { error: t("Писать в чат могут участники лобби") };
  const text = body.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, "").trim().slice(0, 300);
  if (!text) return null;
  // не чаще сообщения в секунду
  const { data: last } = await db()
    .from("lobby_messages")
    .select("created_at")
    .eq("lobby_id", lobby.id)
    .eq("player_id", player.id)
    .order("id", { ascending: false })
    .limit(1);
  if (last?.[0] && Date.now() - new Date(last[0].created_at).getTime() < 1000) return { error: t("Не так быстро") };
  await db().from("lobby_messages").insert({ lobby_id: lobby.id, player_id: player.id, body: text });
  return { ok: true };
}
