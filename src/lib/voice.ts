import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { db } from "./supabase";
import { env } from "./env";
import { isTeamSlot, type Lobby, type TeamSlot } from "./lobby";
import { cupTeams } from "./cup-core";

/*
 * Голосовая связь: привязка подключения TeamSpeak к профилю и комнаты команд.
 *
 * Бот сервера TeamSpeak (F16 Bot) каждые несколько секунд присылает, кто сейчас на сервере, и получает в ответ:
 * кто из них привязан к профилю и какие комнаты команд должны существовать. Сам бот ничего не решает —
 * он создаёт комнаты и переносит игроков по этому ответу.
 *
 * Привязка: игрок заходит в канал «Привязка», бот просит у сайта одноразовую ссылку и шлёт её игроку в личку.
 * Игрок открывает её в браузере, где он вошёл через Steam, и подтверждает — сайт запоминает пару
 * «идентификатор TeamSpeak — профиль». Привязка постоянная (решение владельца, 25.11.2026): выход с сервера её не снимает.
 * Снять её может сам игрок (команда !отвязать) или следующая привязка того же идентификатора к другому профилю —
 * на ПК клуба идентификатор общий для всех, кто садится за компьютер.
 */

/** Ссылка привязки действует столько (мс) */
const TOKEN_MS = 10 * 60_000;
/** Как часто обновлять «видели на сервере» (бот опрашивает чаще) */
const SEEN_WRITE_MS = 20_000;
/** «В голосе» в лобби: бот видел игрока на сервере за это время */
export const VOICE_ONLINE_MS = 60_000;

/** Идентификатор клиента TeamSpeak — base64 от хеша ключа, до 28 знаков; с запасом */
const UID = /^[A-Za-z0-9+/=]{20,64}$/;
export const isTsUid = (v: unknown): v is string => typeof v === "string" && UID.test(v);
const cleanNick = (v: unknown) => (typeof v === "string" ? v.replace(/[\u0000-\u001f]/g, "").trim().slice(0, 40) : "");

/*
 * Ссылка привязки. Бот шлёт её игроку всплывающим предупреждением TeamSpeak, а туда помещается 100 знаков,
 * поэтому ссылка короткая: 20 байт идентификатора (он — base64 от SHA-1) + срок (4 байта, секунды) + 10 байт подписи.
 */
const UID_BYTES = 20;
const MAC_BYTES = 10;
const sign = (body: Buffer) => createHmac("sha256", env.sessionSecret).update("voice-link.").update(body).digest().subarray(0, MAC_BYTES);

/** Ссылка привязки для идентификатора TeamSpeak; null — идентификатор не того вида (у клиентов TeamSpeak он всегда 20 байт) */
export function voiceToken(uid: string): string | null {
  const raw = Buffer.from(uid, "base64");
  if (raw.length !== UID_BYTES || raw.toString("base64") !== uid) return null;
  const exp = Buffer.alloc(4);
  exp.writeUInt32BE(Math.floor((Date.now() + TOKEN_MS) / 1000));
  const body = Buffer.concat([raw, exp]);
  return Buffer.concat([body, sign(body)]).toString("base64url");
}

export function readVoiceToken(token: string | null | undefined): { uid: string } | null {
  if (!token || !/^[A-Za-z0-9_-]{46}$/.test(token)) return null;
  const buf = Buffer.from(token, "base64url");
  if (buf.length !== UID_BYTES + 4 + MAC_BYTES) return null;
  const body = buf.subarray(0, UID_BYTES + 4);
  if (!timingSafeEqual(sign(body), buf.subarray(UID_BYTES + 4))) return null;
  if (body.readUInt32BE(UID_BYTES) * 1000 < Date.now()) return null;
  return { uid: body.subarray(0, UID_BYTES).toString("base64") };
}

export type VoiceLink = { ts_uid: string; ts_nick: string; seen_at: string };

/** Привязка игрока (null — не привязан или таблицы ещё нет) */
export async function getVoiceLink(playerId: string): Promise<VoiceLink | null> {
  const { data } = await db().from("voice_links").select("ts_uid, ts_nick, seen_at").eq("player_id", playerId).maybeSingle();
  return data ?? null;
}

/** Привязывает подключение TeamSpeak к профилю. У профиля одна привязка, у идентификатора — один профиль */
export async function linkVoice(playerId: string, uid: string, nick: string): Promise<boolean> {
  const now = new Date().toISOString();
  // идентификатор был за другим профилем (ПК клуба: сел следующий игрок) — прежняя привязка снимается
  await db().from("voice_links").delete().eq("ts_uid", uid).neq("player_id", playerId);
  const { error } = await db().from("voice_links").upsert({ player_id: playerId, ts_uid: uid, ts_nick: cleanNick(nick), linked_at: now, seen_at: now }, { onConflict: "player_id" });
  return !error;
}

export async function unlinkVoice(by: { playerId: string } | { uid: string }) {
  const q = db().from("voice_links").delete();
  await ("playerId" in by ? q.eq("player_id", by.playerId) : q.eq("ts_uid", by.uid));
}

/** Кто из игроков сейчас на сервере TeamSpeak с привязкой — для отметки «в голосе» в лобби */
export async function voiceOnline(playerIds: string[]): Promise<Set<string>> {
  if (!playerIds.length) return new Set();
  const { data } = await db()
    .from("voice_links")
    .select("player_id")
    .in("player_id", playerIds)
    .gt("seen_at", new Date(Date.now() - VOICE_ONLINE_MS).toISOString());
  return new Set((data ?? []).map((r) => r.player_id));
}

export type VoiceRoom = {
  /** постоянный ключ комнаты: код лобби и слот команды — по нему бот узнаёт свою комнату после перезапуска */
  key: string;
  name: string;
  /** идентификаторы TeamSpeak игроков команды (только привязанные) */
  uids: string[];
};

/** Название канала TeamSpeak — до 40 знаков */
export function roomName(team: string, code: string) {
  const tail = ` · ${code}`;
  return `${team.trim().slice(0, 40 - tail.length) || "Команда"}${tail}`;
}

/** Комната на каждую команду лобби, в котором идёт игра. Матч большого лобби играется в своей комнате-лобби, но команды сидят в комнатах общего */
export function roomsOf(
  lobbies: Pick<Lobby, "id" | "code" | "settings" | "team1_name" | "team2_name" | "bracket">[],
  members: { lobby_id: string; player_id: string; slot: string }[],
  uidOf: Map<string, string>,
): VoiceRoom[] {
  const rooms: VoiceRoom[] = [];
  for (const lobby of lobbies) {
    if (lobby.settings?.cup_of) continue;
    const many = cupTeams(lobby.settings?.players ?? 0) > 0;
    const names = many ? ((lobby.bracket as { names?: string[] } | null)?.names ?? []) : [lobby.team1_name, lobby.team2_name];
    const bySlot = new Map<TeamSlot, string[]>();
    for (const m of members) {
      if (m.lobby_id !== lobby.id || !isTeamSlot(m.slot)) continue;
      const list = bySlot.get(m.slot) ?? [];
      const uid = uidOf.get(m.player_id);
      if (uid) list.push(uid);
      bySlot.set(m.slot, list);
    }
    const used = new Set<string>();
    for (const slot of [...bySlot.keys()].sort()) {
      const i = Number(slot.slice(4)) - 1;
      let name = roomName(names[i] || `Команда ${i + 1}`, lobby.code);
      // две команды с одним названием — каналы TeamSpeak должны различаться
      if (used.has(name)) name = roomName(`${i + 1}. ${names[i] || "Команда"}`, lobby.code);
      used.add(name);
      rooms.push({ key: `${lobby.code}:${slot}`, name, uids: bySlot.get(slot)! });
    }
  }
  return rooms;
}

export type VoiceSync = {
  /** привязанные игроки из присланного списка */
  links: { uid: string; nickname: string }[];
  rooms: VoiceRoom[];
};

/**
 * Опрос бота: отмечает привязанных игроков «на сервере»
 * и отвечает, кто привязан и какие комнаты команд нужны сейчас.
 * Ошибка базы — исключение, а не пустой ответ: по пустому ответу бот распустил бы комнаты посреди матча.
 */
export async function voiceSync(clients: { uid: string; nick: string }[]): Promise<VoiceSync> {
  const online = [...new Set(clients.map((c) => c.uid))];
  const now = Date.now();
  if (online.length) {
    await db()
      .from("voice_links")
      .update({ seen_at: new Date(now).toISOString() })
      .in("ts_uid", online)
      .lt("seen_at", new Date(now - SEEN_WRITE_MS).toISOString())
      .throwOnError();
  }

  const { data: rows } = await db().from("voice_links").select("player_id, ts_uid, player:players(nickname)").throwOnError();
  const here = new Set(online);
  const linked = (rows ?? []).filter((r) => here.has(r.ts_uid));
  const links = linked.map((r) => ({ uid: r.ts_uid, nickname: r.player?.nickname ?? "" }));

  const { data: lobbies } = await db().from("lobbies").select("id, code, settings, team1_name, team2_name, bracket").eq("status", "playing").throwOnError();
  if (!lobbies?.length) return { links, rooms: [] };
  const { data: members } = await db()
    .from("lobby_members")
    .select("lobby_id, player_id, slot")
    .in(
      "lobby_id",
      lobbies.map((l) => l.id),
    )
    .like("slot", "team%")
    .throwOnError();
  const uidOf = new Map(linked.map((r) => [r.player_id, r.ts_uid]));
  return { links, rooms: roomsOf(lobbies as unknown as Parameters<typeof roomsOf>[0], members ?? [], uidOf) };
}
