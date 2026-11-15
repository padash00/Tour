import "server-only";
import { db } from "./supabase";
import { buildCup, cupTeams, markCancelled, readyMatches, recordResult, requeue, roundTitle, standings, type Cup, type CupMatch } from "./cup-core";
import { closeLobby, createGame, getLobby, getLobbyByCode, getMembers, hashPassword, newCode, newToken, systemMessage, type Lobby, type LobbyGame } from "./lobby";
import { normalizeSettings, potBank } from "./lobby-settings";
import type { Json } from "./database.types";

/*
 * Лобби на 20–40 игроков. Большое лобби собирает игроков и команды; каждый матч сетки играется в своей
 * комнате — обычном лобби на две команды (приватном), поэтому бан-пик, сервер и результат работают как всегда.
 * Комната матча знает своё большое лобби (settings.cup_of) и после игры возвращает туда итог.
 */

export const cupOf = (lobby: Pick<Lobby, "bracket">): Cup | null => (lobby.bracket as Cup | null) ?? null;
export const teamSlots = (teams: number) => Array.from({ length: teams }, (_, i) => `team${i + 1}`);

/** Что мешает начать матчи (null — можно): все команды должны быть полными */
export function cupStartProblem(lobby: Lobby, members: { slot: string }[]): string | null {
  const teams = cupTeams(lobby.settings.players);
  if (!teams) return "Это лобби на две команды";
  if (lobby.status !== "waiting") return "Матчи уже идут";
  if (lobby.draft) return "Сначала закончите выбор игроков";
  const short = teamSlots(teams).filter((slot) => members.filter((m) => m.slot === slot).length !== lobby.settings.team_size);
  if (short.length) return `Не все команды собраны: полных ${teams - short.length} из ${teams}`;
  return null;
}

/**
 * Меняет сетку большого лобби. Два матча могут закончиться одновременно, поэтому запись условная
 * (по updated_at) с повтором: вторая запись перечитает сетку и применит своё изменение поверх первой.
 */
async function mutateCup(lobbyId: string, change: (cup: Cup, lobby: Lobby) => Cup | null, patch: (cup: Cup) => Record<string, unknown> = () => ({})): Promise<{ cup: Cup; lobby: Lobby } | null> {
  for (let attempt = 0; attempt < 6; attempt++) {
    const lobby = await getLobby(lobbyId);
    const cup = lobby && cupOf(lobby);
    if (!lobby || !cup) return null;
    const next = change(cup, lobby);
    if (!next) return null;
    const { data } = await db()
      .from("lobbies")
      .update({ bracket: next as unknown as Json, updated_at: new Date().toISOString(), ...patch(next) })
      .eq("id", lobby.id)
      .eq("updated_at", lobby.updated_at)
      .select("id");
    if (data?.length) return { cup: next, lobby };
  }
  throw new Error("Сетка лобби занята — не удалось записать изменение");
}

/** Организатор начинает матчи: составы фиксируются, строится сетка, первые матчи получают комнаты */
export async function startCup(lobby: Lobby): Promise<string | null> {
  const members = await getMembers(lobby.id);
  const problem = cupStartProblem(lobby, members);
  if (problem) return problem;
  const teams = cupTeams(lobby.settings.players);
  const prev = cupOf(lobby);
  const elo = (id: string) => lobby.settings.pot_elo[id] ?? members.find((m) => m.player_id === id)?.player.faceit_elo ?? 0;
  // капитан — тот, кого назначили перед выбором игроков; иначе самый высокий по ELO
  const rosters = teamSlots(teams).map((slot, i) => {
    const ids = members.filter((m) => m.slot === slot).map((m) => m.player_id);
    const captain = prev?.rosters?.[i]?.[0];
    return ids.sort((a, b) => Number(b === captain) - Number(a === captain) || elo(b) - elo(a));
  });
  const names = teamSlots(teams).map((_, i) => prev?.names?.[i] ?? `Команда ${i + 1}`);
  const cup = buildCup(lobby.settings.cup_format, names, rosters);
  // защита от двойного старта
  const { data } = await db()
    .from("lobbies")
    .update({ status: "playing", bracket: cup as unknown as Json, ready_check_until: null, current_game_id: null, updated_at: new Date().toISOString() })
    .eq("id", lobby.id)
    .eq("status", "waiting")
    .select("id");
  if (!data?.length) return "Матчи уже идут";
  await systemMessage(lobby.id, `${lobby.settings.cup_format === "round" ? "Круговая" : "Сетка"} на ${teams} команд началась. Свой матч откройте по кнопке «Мой матч».`);
  await launchReady(lobby.id);
  return null;
}

/** Комнаты для матчей, у которых известны обе команды */
export async function launchReady(lobbyId: string) {
  const parent = await getLobby(lobbyId);
  const cup = parent && cupOf(parent);
  if (!parent || !cup || parent.status !== "playing") return;
  for (const match of readyMatches(cup)) {
    // сначала занимаем матч (пишем код комнаты), потом создаём комнату: два одновременных вызова не создадут две
    const code = await freeCode();
    const claimed = await mutateCup(parent.id, (c) => {
      const m = c.matches.find((x) => x.id === match.id);
      if (!m || m.code || m.state !== "pending" || m.a === null || m.b === null) return null;
      return { ...c, matches: c.matches.map((x) => (x.id === match.id ? { ...x, code, state: "playing" as const } : x)) };
    });
    if (!claimed) continue;
    try {
      await createRoom(parent, claimed.cup, claimed.cup.matches.find((x) => x.id === match.id)!, code);
    } catch (e) {
      console.error("cup room failed", e);
      await mutateCup(parent.id, (c) => markCancelled(c, match.id));
      await systemMessage(parent.id, `Матч ${cup.names[match.a!]} — ${cup.names[match.b!]} не запустился. Организатор может запустить его заново.`);
    }
  }
}

async function freeCode() {
  for (let i = 0; i < 8; i++) {
    const code = newCode();
    const { data } = await db().from("lobbies").select("id").eq("code", code).maybeSingle();
    if (!data) return code;
  }
  throw new Error("Не удалось подобрать код комнаты");
}

/** Комната матча: приватное лобби на две команды с теми же настройками, составы уже расставлены, игра создана */
async function createRoom(parent: Lobby, cup: Cup, match: CupMatch, code: string) {
  const settings = normalizeSettings({
    ...parent.settings,
    players: 0,
    pot: false,
    rematch: false,
    player_pick: "free",
    allow_join_team: false,
    start: "host",
    cup_of: { code: parent.code, match: match.id },
  });
  const [a, b] = [match.a!, match.b!];
  const { data, error } = await db()
    .from("lobbies")
    .insert({
      code,
      host_id: parent.host_id,
      visibility: "private",
      password_hash: await hashPassword(newToken()),
      invite_token: newToken(),
      settings,
      team1_name: cup.names[a],
      team2_name: cup.names[b],
    })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  // капитан входит первым: в комнате на две команды капитан — первый по времени входа, он ведёт бан-пик
  const base = Date.now();
  const rows = [
    ...cup.rosters[a].map((id, i) => ({ lobby_id: data.id, player_id: id, slot: "team1", joined_at: new Date(base + i).toISOString() })),
    ...cup.rosters[b].map((id, i) => ({ lobby_id: data.id, player_id: id, slot: "team2", joined_at: new Date(base + i).toISOString() })),
  ];
  const { error: membersError } = await db().from("lobby_members").insert(rows);
  if (membersError) throw new Error(membersError.message);
  const room = (await getLobby(data.id))!;
  await systemMessage(room.id, `${roundTitle(cup, match.round)}: ${cup.names[a]} — ${cup.names[b]}. Матч лобби #${parent.code}.`);
  await createGame(room);
  await systemMessage(parent.id, `${roundTitle(cup, match.round)}: ${cup.names[a]} — ${cup.names[b]} — комната матча открыта.`);
}

/** Игра в комнате матча закончилась: итог — в сетку, комната закрывается, следующие матчи получают комнаты */
export async function cupGameFinished(room: Lobby, g: LobbyGame) {
  const link = room.settings.cup_of;
  if (!link) return;
  const parent = await getLobbyByCode(link.code);
  const score = `${g.team1.name} ${g.team1_score}:${g.team2_score} ${g.team2.name}`;
  // комната закрывается после записи итога: закрытие комнаты с несыгранным матчем считается отменой
  const closeRoom = () => closeLobby(room, `Матч окончен: ${score}. Сетка — в лобби #${link.code}.`);
  if (!parent || parent.status === "closed") return closeRoom();
  if (g.winner !== 1 && g.winner !== 2) {
    await closeRoom();
    // ничья по картам невозможна в BO1/3/5; на всякий случай — матч переигрывается
    await mutateCup(parent.id, (c) => markCancelled(c, link.match));
    await systemMessage(parent.id, `Матч ${score} закончился без победителя — организатор может запустить его заново.`);
    return;
  }
  const side = g.winner;
  const done = await mutateCup(
    parent.id,
    (c) => {
      const next = recordResult(c, link.match, side, [g.team1_score, g.team2_score]);
      return next === c ? null : next;
    },
    (c) => (c.state === "done" ? { status: "waiting" } : {}),
  );
  await closeRoom();
  if (!done) return;
  const { cup } = done;
  await systemMessage(parent.id, `Матч окончен: ${score}.`);
  if (cup.state !== "done") return launchReady(parent.id);

  // всё сыграно: чемпион, таблица круговой, банк
  const champion = cup.names[cup.champion!];
  const table = cup.format === "round" ? ` Таблица: ${standings(cup).map((r) => `${cup.names[r.team]} — ${r.wins} поб.`).join(", ")}.` : "";
  const fresh = (await getLobby(parent.id)) ?? parent;
  const bank = fresh.settings.pot ? potBank(fresh.settings) : 0;
  const money = bank > 0 ? ` Банк ${bank.toLocaleString("ru-RU")} тг — как его делить, решает организатор.` : "";
  await systemMessage(parent.id, `Победитель — ${champion}.${table}${money}`);
  // следующий сбор — с чистыми отметками взносов
  if (fresh.settings.pot) await db().from("lobbies").update({ settings: { ...fresh.settings, pot_paid: [], pot_elo: {} } as unknown as Json }).eq("id", parent.id);
}

/** Игра в комнате матча отменена: комната закрывается, матч в сетке ждёт перезапуска организатором */
export async function cupGameCancelled(room: Lobby, reason: string) {
  const link = room.settings.cup_of;
  if (!link) return;
  if (room.status !== "closed") await closeLobby(room, `Игра отменена: ${reason}. Комната закрыта — матч перезапустит организатор.`);
  const parent = await getLobbyByCode(link.code);
  const cup = parent && cupOf(parent);
  if (!parent || !cup || parent.status !== "playing") return;
  const m = cup.matches.find((x) => x.id === link.match);
  // матч уже сыгран, сетку отменили целиком или матч перезапущен в другой комнате
  if (!m || m.code !== room.code || m.state !== "playing") return;
  await mutateCup(parent.id, (c) => markCancelled(c, link.match));
  if (m.a !== null && m.b !== null) await systemMessage(parent.id, `Матч ${cup.names[m.a]} — ${cup.names[m.b]} отменён: ${reason}. Организатор может запустить его заново.`);
}

/** Организатор запускает отменённый матч заново — в новой комнате */
export async function restartCupMatch(parent: Lobby, matchId: string): Promise<string | null> {
  const cup = cupOf(parent);
  if (!cup || parent.status !== "playing") return "Матчи сейчас не идут";
  if (cup.matches.find((m) => m.id === matchId)?.state !== "cancelled") return "Этот матч не отменён";
  await mutateCup(parent.id, (c) => requeue(c, matchId));
  await launchReady(parent.id);
  return null;
}

/** Организатор останавливает всё: идущие комнаты закрываются, лобби снова собирается */
export async function cancelCup(parent: Lobby, by: string): Promise<string | null> {
  const cup = cupOf(parent);
  if (!cup || parent.status !== "playing") return "Матчи сейчас не идут";
  const codes = cup.matches.filter((m) => m.state === "playing" && m.code).map((m) => m.code!);
  // сначала снимаем сетку: закрытие комнат не должно помечать матчи «отменён» по одному
  await db().from("lobbies").update({ status: "waiting", bracket: { ...cup, state: "done", champion: null, matches: cup.matches.map((m) => (m.state === "done" ? m : { ...m, state: "cancelled", code: null })) } as unknown as Json, updated_at: new Date().toISOString() }).eq("id", parent.id);
  for (const code of codes) {
    const room = await getLobbyByCode(code);
    if (!room || room.status === "closed") continue;
    const { data: games } = await db().from("lobby_games").select("id, server_instance, status").eq("lobby_id", room.id).in("status", ["veto", "waiting", "live"]);
    for (const game of games ?? []) {
      if (game.server_instance) await db().from("agent_commands").insert({ instance: game.server_instance, type: "end_match", payload: {} });
      await db().from("lobby_games").update({ status: "cancelled", note: "сетка остановлена", server_instance: null, server_state: null, server_address: null }).eq("id", game.id);
    }
    await closeLobby(room, `Сетка остановлена: ${by}`);
  }
  await systemMessage(parent.id, `${by} остановил матчи. Составы остались — можно начать заново.`);
  return null;
}

/** Комната матча, в которой сейчас играет этот игрок (для кнопки «Мой матч») */
export function myCupRoom(cup: Cup | null, playerId: string): string | null {
  if (!cup) return null;
  const team = cup.rosters.findIndex((r) => r.includes(playerId));
  if (team < 0) return null;
  return cup.matches.find((m) => m.state === "playing" && m.code && (m.a === team || m.b === team))?.code ?? null;
}
