"use server";

import { randomInt } from "node:crypto";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { BANNED_ERROR } from "@/lib/data";
import { db } from "@/lib/supabase";
import {
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
  READY_CHECK_SECONDS,
  setSlot,
  slotProblem,
  startDraft,
  startProblem,
  systemMessage,
  teamCount,
  type Lobby,
  type Slot,
} from "@/lib/lobby";
import { DEFAULT_SETTINGS, MAP_RE, normalizeSettings, type LobbySettings } from "@/lib/lobby-settings";
import type { Player } from "@/lib/types";

export type LobbyResult = { error?: string; ok?: true; code?: string } | null;

const SLOTS: Slot[] = ["team1", "team2", "wait", "spec"];
const touch = (id: string, patch: Record<string, unknown> = {}) => db().from("lobbies").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id);

async function me(): Promise<Player | { error: string }> {
  const p = await getCurrentPlayer();
  if (!p) return { error: "Войдите через Steam" };
  if (p.is_banned) return { error: BANNED_ERROR };
  return p;
}

/** Лобби + игрок + проверка: хост (или админ сайта) */
async function asHost(code: string): Promise<{ lobby: Lobby; player: Player } | { error: string }> {
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: "Лобби не найдено или закрыто" };
  if (lobby.host_id !== player.id && !isAdmin(player)) return { error: "Это может только хост лобби" };
  return { lobby, player };
}

async function asMember(code: string): Promise<{ lobby: Lobby; player: Player; slot: Slot } | { error: string }> {
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: "Лобби не найдено или закрыто" };
  const { data } = await db().from("lobby_members").select("slot").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  if (!data) return { error: "Вы не в этом лобби" };
  return { lobby, player, slot: data.slot as Slot };
}

// ───────────────────────── создание, вход, выход

export async function createLobby(visibility: Lobby["visibility"], password: string): Promise<LobbyResult> {
  const player = await me();
  if ("error" in player) return player;
  if (!["public", "closed", "private"].includes(visibility)) return { error: "Неизвестный тип лобби" };
  const pw = password.trim();
  if (visibility !== "public" && (pw.length < 3 || pw.length > 32)) return { error: "Пароль — от 3 до 32 символов" };
  const other = await playerLobby(player.id);
  if (other) return { error: "Вы уже в другом лобби — выйдите из него", code: other.code };

  // последние настройки этого хоста — удобно пересоздавать
  const { data: last } = await db().from("lobbies").select("settings").eq("host_id", player.id).order("created_at", { ascending: false }).limit(1);
  const settings = normalizeSettings(last?.[0]?.settings ?? DEFAULT_SETTINGS);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newCode();
    const { data, error } = await db()
      .from("lobbies")
      .insert({
        code,
        host_id: player.id,
        visibility,
        password_hash: visibility === "public" ? null : hashPassword(pw),
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
    await db().from("lobby_members").insert({ lobby_id: data.id, player_id: player.id, slot: "team1" });
    await systemMessage(data.id, `${player.nickname} создал лобби`);
    await audit(player.id, "lobby.create", { type: "lobby", id: data.id }, { visibility });
    return { ok: true, code };
  }
  return { error: "Не удалось создать лобби — попробуйте ещё раз" };
}

export async function joinLobby(code: string, opts: { password?: string; invite?: string; slot?: Slot }): Promise<LobbyResult> {
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby || lobby.status === "closed") return { error: "Лобби не найдено или закрыто" };
  const members = await getMembers(lobby.id);
  if (members.some((m) => m.player_id === player.id)) return { ok: true, code: lobby.code };

  const { data: banned } = await db().from("lobby_bans").select("player_id").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  if (banned) return { error: "Хост запретил вам вход в это лобби" };
  if (lobby.visibility !== "public" && !checkInvite(opts.invite, lobby) && !checkPassword(opts.password ?? "", lobby.password_hash)) {
    return { error: "Неверный пароль" };
  }
  const filter = await filterProblem(lobby.settings, player);
  if (filter) return { error: filter };
  const other = await playerLobby(player.id);
  if (other) return { error: "Вы уже в другом лобби — выйдите из него", code: other.code };

  // куда встать: просили слот — туда, иначе в команду, где меньше (если можно), иначе в ожидание
  let slot: Slot = opts.slot && SLOTS.includes(opts.slot) ? opts.slot : "wait";
  if (!opts.slot && lobby.settings.allow_join_team && !lobby.draft) {
    const c1 = teamCount(lobby, members, "team1");
    const c2 = teamCount(lobby, members, "team2");
    const size = lobby.settings.team_size;
    if (c1 < size || c2 < size) slot = c1 <= c2 && c1 < size ? "team1" : "team2";
  }
  if ((slot === "team1" || slot === "team2") && (!lobby.settings.allow_join_team || lobby.draft)) slot = "wait";
  let problem = slotProblem(lobby, members, slot, player.id);
  if (problem && slot !== "spec") {
    slot = "wait";
    problem = slotProblem(lobby, members, slot, player.id);
  }
  if (problem) return { error: problem };

  const { error } = await db().from("lobby_members").insert({ lobby_id: lobby.id, player_id: player.id, slot });
  if (error) return { error: "Не удалось войти — обновите страницу" };
  await touch(lobby.id);
  await systemMessage(lobby.id, `${player.nickname} зашёл в лобби`);
  return { ok: true, code: lobby.code };
}

export async function leaveLobby(code: string): Promise<LobbyResult> {
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  await db().from("lobby_members").delete().eq("lobby_id", lobby.id).eq("player_id", player.id);
  await systemMessage(lobby.id, `${player.nickname} вышел из лобби`);
  if (lobby.draft?.captains.includes(player.id)) {
    await touch(lobby.id, { draft: null });
    await systemMessage(lobby.id, "Капитан вышел — драфт отменён");
  }
  if (lobby.host_id === player.id) await passHost(lobby, player.id);
  else await touch(lobby.id);
  return { ok: true };
}

// ───────────────────────── слоты

export async function moveSelf(code: string, slot: Slot): Promise<LobbyResult> {
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (!SLOTS.includes(slot)) return { error: "Неизвестное место" };
  const isHost = lobby.host_id === player.id;
  if ((slot === "team1" || slot === "team2") && !isHost) {
    if (lobby.draft) return { error: "Идёт драфт — игроков выбирают капитаны" };
    if (!lobby.settings.allow_join_team) return { error: "В команды расставляет хост" };
    if (lobby.settings.player_pick === "captains") return { error: "Составы собирают капитаны через драфт" };
  }
  if (lobby.ready_check_until) return { error: "Идёт проверка готовности" };
  const problem = slotProblem(lobby, await getMembers(lobby.id), slot, player.id);
  if (problem) return { error: problem };
  await setSlot(lobby.id, player.id, slot);
  return { ok: true };
}

export async function movePlayer(code: string, playerId: string, slot: Slot): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (!SLOTS.includes(slot)) return { error: "Неизвестное место" };
  if (lobby.draft) return { error: "Идёт драфт" };
  const members = await getMembers(lobby.id);
  if (!members.some((m) => m.player_id === playerId)) return { error: "Игрок уже вышел" };
  const problem = slotProblem(lobby, members, slot, playerId);
  if (problem) return { error: problem };
  await setSlot(lobby.id, playerId, slot);
  return { ok: true };
}

export async function kickPlayer(code: string, playerId: string, ban: boolean): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (playerId === lobby.host_id) return { error: "Хоста выгнать нельзя — сначала передайте хоста" };
  const members = await getMembers(lobby.id);
  const target = members.find((m) => m.player_id === playerId);
  await db().from("lobby_members").delete().eq("lobby_id", lobby.id).eq("player_id", playerId);
  if (ban) await db().from("lobby_bans").upsert({ lobby_id: lobby.id, player_id: playerId });
  await touch(lobby.id, lobby.draft?.captains.includes(playerId) ? { draft: null } : {});
  if (target) await systemMessage(lobby.id, `${player.nickname} ${ban ? "забанил" : "выгнал"} ${target.player.nickname}`);
  return { ok: true };
}

export async function unbanPlayer(code: string, playerId: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await db().from("lobby_bans").delete().eq("lobby_id", ctx.lobby.id).eq("player_id", playerId);
  return { ok: true };
}

export async function transferHost(code: string, playerId: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const members = await getMembers(ctx.lobby.id);
  const target = members.find((m) => m.player_id === playerId);
  if (!target) return { error: "Игрок уже вышел" };
  await touch(ctx.lobby.id, { host_id: playerId });
  await systemMessage(ctx.lobby.id, `Новый хост — ${target.player.nickname}`);
  return { ok: true };
}

// ───────────────────────── команды: имена, боты, перемешать, баланс

export async function setTeamName(code: string, team: "team1" | "team2", name: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const clean = name.replace(/[\u0000-\u001f";#|]/g, "").trim().slice(0, 24);
  if (clean.length < 2) return { error: "Название — от 2 символов" };
  await touch(ctx.lobby.id, { [team === "team1" ? "team1_name" : "team2_name"]: clean });
  return { ok: true };
}

export async function addBot(code: string, team: "team1" | "team2"): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: "Игра уже идёт" };
  if (lobby.draft) return { error: "Идёт драфт" };
  if (teamCount(lobby, await getMembers(lobby.id), team) >= lobby.settings.team_size) return { error: "В команде нет мест" };
  const bots = { ...lobby.bots, [team]: [...lobby.bots[team], nextBotName(lobby)] };
  await touch(lobby.id, { bots });
  return { ok: true };
}

export async function removeBot(code: string, team: "team1" | "team2", name: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  const bots = { ...lobby.bots, [team]: lobby.bots[team].filter((b) => b !== name) };
  await touch(lobby.id, { bots });
  return { ok: true };
}

/** Командные инструменты хоста: баланс по ELO, перемешать, поменять местами, очистить */
export async function teamTool(code: string, tool: "balance" | "shuffle" | "swap" | "clear"): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: "Игра уже идёт" };
  if (lobby.draft) return { error: "Идёт драфт" };
  const members = await getMembers(lobby.id);
  const inTeams = members.filter((m) => m.slot === "team1" || m.slot === "team2");
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
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: "Настройки меняются между играми" };
  const next = normalizeSettings({ ...lobby.settings, ...patch });
  await touch(lobby.id, { settings: next, ready_check_until: null });
  if (next.team_size < lobby.settings.team_size) await fitTeams({ ...lobby, settings: next });
  return { ok: true };
}

export async function setVisibility(code: string, visibility: Lobby["visibility"], password: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  if (!["public", "closed", "private"].includes(visibility)) return { error: "Неизвестный тип лобби" };
  const pw = password.trim();
  const patch: Record<string, unknown> = { visibility };
  if (visibility === "public") patch.password_hash = null;
  else if (pw) {
    if (pw.length < 3 || pw.length > 32) return { error: "Пароль — от 3 до 32 символов" };
    patch.password_hash = hashPassword(pw);
  } else if (!ctx.lobby.password_hash) return { error: "Задайте пароль" };
  await touch(ctx.lobby.id, patch);
  return { ok: true };
}

/** Новая ссылка-приглашение (старая перестаёт пускать) */
export async function resetInvite(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await touch(ctx.lobby.id, { invite_token: newToken() });
  return { ok: true };
}

export async function saveTemplate(name: string, settings: Partial<LobbySettings>): Promise<LobbyResult> {
  const player = await me();
  if ("error" in player) return player;
  const clean = name.trim().slice(0, 40);
  if (clean.length < 2) return { error: "Название шаблона — от 2 символов" };
  const { count } = await db().from("lobby_templates").select("id", { count: "exact", head: true }).eq("player_id", player.id);
  if ((count ?? 0) >= 20) return { error: "Не больше 20 шаблонов — удалите ненужные" };
  await db().from("lobby_templates").insert({ player_id: player.id, name: clean, settings: normalizeSettings(settings) });
  return { ok: true };
}

export async function deleteTemplate(id: string): Promise<LobbyResult> {
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
  const id = /(?:id=)?(\d{6,12})/.exec(input.trim())?.[1];
  if (!id) return { error: "Вставьте ссылку на карту в мастерской Steam или её ID" };
  try {
    const res = await fetch("https://api.steampowered.com/ISteamRemoteStorage/GetPublishedFileDetails/v1/", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ itemcount: "1", "publishedfileids[0]": id }),
      signal: AbortSignal.timeout(8000),
    });
    const json = (await res.json()) as { response?: { publishedfiledetails?: { result: number; title?: string; preview_url?: string; consumer_app_id?: number }[] } };
    const d = json.response?.publishedfiledetails?.[0];
    if (!d || d.result !== 1) return { error: "Карта не найдена в мастерской (или она скрыта)" };
    if (d.consumer_app_id && d.consumer_app_id !== 730) return { error: "Это не карта Counter-Strike" };
    const slug = (d.title ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    const map = `${slug.length >= 2 ? slug : "workshop"}@${id}`;
    if (!MAP_RE.test(map)) return { error: "Не удалось разобрать карту" };
    return { map, title: d.title ?? map, image: d.preview_url ?? null };
  } catch {
    return { error: "Steam не ответил — попробуйте ещё раз" };
  }
}

// ───────────────────────── готовность и старт

export async function toggleReady(code: string): Promise<LobbyResult> {
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player, slot } = ctx;
  if (slot !== "team1" && slot !== "team2") return { error: "Готовность — для игроков команд" };
  const { data } = await db().from("lobby_members").select("ready").eq("lobby_id", lobby.id).eq("player_id", player.id).single();
  await db().from("lobby_members").update({ ready: !data?.ready }).eq("lobby_id", lobby.id).eq("player_id", player.id);
  await touch(lobby.id);
  await maybeStartOnReady(lobby.id);
  return { ok: true };
}

/** «Начать матч»: проверка готовности на 30 секунд; если в командах только хост — сразу */
export async function startMatch(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  const members = await getMembers(lobby.id);
  const problem = startProblem(lobby, members);
  if (problem) return { error: problem };
  const offline = members.filter((m) => (m.slot === "team1" || m.slot === "team2") && !isOnline(m));
  if (offline.length) return { error: `Не на странице лобби: ${offline.map((m) => m.player.nickname).join(", ")}` };
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", lobby.id);
  await db().from("lobby_members").update({ ready: true }).eq("lobby_id", lobby.id).eq("player_id", player.id);
  await touch(lobby.id, { ready_check_until: new Date(Date.now() + READY_CHECK_SECONDS * 1000).toISOString() });
  await systemMessage(lobby.id, `Проверка готовности — ${READY_CHECK_SECONDS} секунд`);
  await maybeStartOnReady(lobby.id);
  return { ok: true };
}

export async function cancelReadyCheck(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await touch(ctx.lobby.id, { ready_check_until: null });
  await db().from("lobby_members").update({ ready: false }).eq("lobby_id", ctx.lobby.id);
  await systemMessage(ctx.lobby.id, "Хост отменил проверку готовности");
  return { ok: true };
}

export async function cancelCurrentGame(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const g = ctx.lobby.current_game_id ? await getGame(ctx.lobby.current_game_id) : null;
  if (!g || !["veto", "waiting", "live"].includes(g.status)) return { error: "Игры нет" };
  if (g.status === "live" && !isAdmin(ctx.player)) return { error: "Матч уже идёт на сервере — его может остановить только админ" };
  await cancelGame(g, `отменил ${ctx.player.nickname}`);
  return { ok: true };
}

export async function closeLobbyAction(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  await closeLobby(ctx.lobby, `${ctx.player.nickname} закрыл лобби`);
  return { ok: true };
}

// ───────────────────────── драфт и вето

export async function beginDraft(code: string): Promise<LobbyResult> {
  const ctx = await asHost(code);
  if ("error" in ctx) return ctx;
  const { lobby } = ctx;
  if (lobby.status !== "waiting") return { error: "Игра уже идёт" };
  const members = await getMembers(lobby.id);
  let [c1, c2] = captainsOf({ ...lobby, draft: null }, members);
  // капитанов нет в обеих командах — случайные из тех, кто на месте
  if (!c1 || !c2) {
    const pool = members.filter((m) => m.slot !== "spec" && isOnline(m) && m.player_id !== c1 && m.player_id !== c2).map((m) => m.player_id);
    const pick = () => (pool.length ? pool.splice(randomInt(pool.length), 1)[0] : null);
    c1 ??= pick();
    c2 ??= pick();
  }
  if (!c1 || !c2 || c1 === c2) return { error: "Для драфта нужны хотя бы двое игроков" };
  await startDraft(lobby, [c1, c2]);
  return { ok: true };
}

export async function pickInDraft(code: string, playerId: string): Promise<LobbyResult> {
  const ctx = await asMember(code);
  if ("error" in ctx) return ctx;
  const { lobby, player } = ctx;
  if (!lobby.draft) return { error: "Драфт не идёт" };
  if (lobby.draft.captains[lobby.draft.turn - 1] !== player.id) return { error: "Сейчас выбирает другой капитан" };
  const err = await draftPick(lobby, playerId);
  return err ? { error: err } : { ok: true };
}

export async function lobbyVeto(code: string, map: string): Promise<LobbyResult> {
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  const g = lobby?.current_game_id ? await getGame(lobby.current_game_id) : null;
  if (!lobby || !g || g.status !== "veto") return { error: "Вето сейчас не идёт" };
  const st = lobbyVetoState(g);
  if (!st.current?.team) return { error: "Вето завершено" };
  const team = st.current.team === 1 ? g.team1 : g.team2;
  // ход капитана команды; за команду из одних ботов выбирает хост
  const captain = team.players[0]?.id ?? lobby.host_id;
  if (captain !== player.id) return { error: team.players.length ? `Сейчас выбирает капитан ${team.name}` : "За команду ботов выбирает хост" };
  const err = await lobbyVetoAct(g, map, false);
  return err ? { error: err } : { ok: true };
}

// ───────────────────────── чат

export async function sendLobbyMessage(code: string, body: string): Promise<LobbyResult> {
  const player = await me();
  if ("error" in player) return player;
  const lobby = await getLobbyByCode(code);
  if (!lobby) return { error: "Лобби не найдено" };
  const { data: member } = await db().from("lobby_members").select("player_id").eq("lobby_id", lobby.id).eq("player_id", player.id).maybeSingle();
  if (!member && !isAdmin(player)) return { error: "Писать в чат могут участники лобби" };
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
  if (last?.[0] && Date.now() - new Date(last[0].created_at).getTime() < 1000) return { error: "Не так быстро" };
  await db().from("lobby_messages").insert({ lobby_id: lobby.id, player_id: player.id, body: text });
  return { ok: true };
}
