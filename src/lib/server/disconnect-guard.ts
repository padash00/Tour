import "server-only";
import { audit, notify } from "../audit";
import { db } from "../supabase";
import { enqueueCommand } from "./state";

/*
 * Вылет игрока во время матча турнира — п. 5.8.1–5.8.3 регламента, решает Платформа по журналу сервера:
 *  - игрок отключился из-за сбоя связи (не вышел сам и не кикнут), в первые 20 секунд раунда и до первого урона
 *    в раунде → раунд переигрывается: агент загружает копию начала раунда (MatchZy сам ставит паузу);
 *  - не больше одного такого переигрывания на команду за карту;
 *  - иначе раунд доигрывается: сообщение в чат сервера и капитану — можно взять техническую паузу (.tech).
 * Строки журнала идут по порядку пачками (HTTP-лог CS2 через буфер агента; повторы пачек отброшены раньше),
 * поэтому порядок «начало раунда → урон → вылет» виден точно. Начало раунда — "Round_Start" (конец закупки).
 */

const WINDOW_S = 20;
const LIMIT_PER_TEAM = 1;
// сбой связи/ПК — переигровка возможна; вышел сам, кикнут, бан — нет
// TIMEDOUT — пропала связь или завис/упал ПК (сервер перестал получать пакеты); EXITING/LOOPSHUTDOWN — игрок закрыл игру
const NETWORK = /TIMEDOUT|TIMED_OUT|STEAM_LOGON|STEAM_CONNECTION|CONNECTION_(?:FAILURE|LOST)|NETCHAN|OVERFLOW/i;
const SELF = /BY_USER|EXITING|LOOPSHUTDOWN|SHUTDOWN|KICKED|BANNED|REJECT|CONSISTENCY/i;

type RoundState = { start: number | null; damage: boolean };
const rounds = new Map<number, RoundState>(); // matchzy id → текущий раунд

const STAMP = /^L (\d{2})\/(\d{2})\/(\d{4}) - (\d{2}):(\d{2}):(\d{2}): (.*)$/;
const DISC = /^"(.+?)<\d+><(\[U:1:(\d+)\]|STEAM_[\d:]+|BOT)><([A-Z]*)>" disconnected \(reason "([^"]*)"\)/;
const steam64 = (accountId: string) => (BigInt("76561197960265728") + BigInt(accountId)).toString();
const chatSafe = (s: string) => s.replace(/["\\;\r\n]/g, " ").slice(0, 180);

function stamp(line: string) {
  const m = STAMP.exec(line.trim());
  if (!m) return null;
  const [, mo, d, y, h, mi, s, rest] = m;
  return { t: Date.UTC(+y, +mo - 1, +d, +h, +mi, +s), rest };
}

export async function scanDisconnects(matchzyId: number, body: string) {
  let st = rounds.get(matchzyId) ?? { start: null, damage: false };
  for (const raw of body.split(/\r?\n/)) {
    const l = stamp(raw);
    if (!l) continue;
    if (l.rest === 'World triggered "Round_Start"') st = { start: l.t, damage: false };
    else if (l.rest === 'World triggered "Round_End"') st = { start: null, damage: false };
    else if (/" \[[-\d. ]+\] attacked "/.test(l.rest) || /" attacked "/.test(l.rest)) st.damage = true;
    else {
      const d = DISC.exec(l.rest);
      if (d && d[2] !== "BOT" && d[3]) {
        rounds.set(matchzyId, st);
        await onDisconnect(matchzyId, { name: d[1], steam: steam64(d[3]), side: d[4], reason: d[5], at: l.t }, { ...st }).catch((e) => console.error("disconnect guard", e));
      }
    }
  }
  rounds.set(matchzyId, st);
}

async function onDisconnect(matchzyId: number, p: { name: string; steam: string; side: string; reason: string; at: number }, st: RoundState) {
  const { data: match } = await db()
    .from("matches")
    .select("id, status, server_instance, team1_id, team2_id, team1:teams!matches_team1_id_fkey(id, name, captain_id), team2:teams!matches_team2_id_fkey(id, name, captain_id)")
    .eq("matchzy_id", matchzyId)
    .maybeSingle();
  const m = match as unknown as {
    id: string; status: string; server_instance: string | null;
    team1: { id: string; name: string; captain_id: string } | null; team2: { id: string; name: string; captain_id: string } | null;
  } | null;
  if (!m || m.status !== "live" || !m.server_instance) return;

  // чей игрок: по составу команд
  const { data: pl } = await db().from("players").select("id").eq("steam_id", p.steam).maybeSingle();
  let team: { id: string; name: string; captain_id: string } | null = null;
  if (pl) {
    const { data: tm } = await db().from("team_members").select("team_id").eq("player_id", pl.id).is("left_at", null);
    const ids = (tm ?? []).map((x) => x.team_id);
    team = m.team1 && ids.includes(m.team1.id) ? m.team1 : m.team2 && ids.includes(m.team2.id) ? m.team2 : null;
  }
  const { data: ls } = await db().from("match_log_state").select("map_number, round_number").eq("match_id", m.id).maybeSingle();
  const mapNumber = ls?.map_number ?? null;
  const roundNo = (ls?.round_number ?? 0) + 1;
  const key = `${m.id}:${p.steam}:${p.at}`;

  // одно решение на один вылет (на случай повторной обработки)
  const { data: dup } = await db().from("audit_logs").select("id").in("action", ["match.round_replay", "match.disconnect"]).eq("payload->>key", key).limit(1);
  if (dup?.length) return;

  const secs = st.start != null ? Math.round((p.at - st.start) / 1000) : null;
  const network = NETWORK.test(p.reason) && !SELF.test(p.reason);
  let used = 0;
  if (team && mapNumber != null) {
    const { data: prev } = await db().from("audit_logs").select("id").eq("action", "match.round_replay").eq("payload->>match_id", m.id).eq("payload->>map", String(mapNumber)).eq("payload->>team_id", team.id);
    used = prev?.length ?? 0;
  }
  const why = !network
    ? "игрок вышел сам или был отключён сервером (не сбой связи)"
    : st.start == null
      ? "раунд ещё не начался (закупка) — переигровка не нужна, ждём игрока"
      : st.damage
        ? "в раунде уже был урон"
        : secs != null && secs > WINDOW_S
          ? `прошло ${secs} с раунда (больше ${WINDOW_S} с)`
          : !team
            ? "игрок не из состава команд матча"
            : used >= LIMIT_PER_TEAM
              ? "команда уже использовала переигровку на этой карте"
              : null;
  const base = { key, match_id: m.id, map: mapNumber, round: roundNo, team_id: team?.id ?? null, team: team?.name ?? null, player: p.name, steam: p.steam, reason: p.reason, seconds: secs, damage: st.damage };
  const captain = team?.captain_id ? [team.captain_id] : [];
  const link = `/matches/${m.id}`;

  if (!why) {
    await enqueueCommand(m.server_instance, "restore_round", { reason: `вылет ${p.name}` });
    await enqueueCommand(m.server_instance, "rcon", { command: `css_asay ${chatSafe(`Платформа: ${p.name} отключился до первого урона — раунд ${roundNo} переигрывается (п. 5.8.1). Пауза, пока игрок не вернётся.`)}` });
    await audit(null, "match.round_replay", { type: "match", id: m.id }, base);
    await notify(captain, `Раунд ${roundNo} переигрывается`, `${p.name} отключился до первого урона — Платформа восстановила начало раунда (п. 5.8.1). Игра на паузе: когда игрок вернётся, обе команды пишут .unpause. Это ваша единственная переигровка за вылет на этой карте.`, link);
    return;
  }
  // раунд не переигрывается: в журнал, в чат сервера и капитану
  await audit(null, "match.disconnect", { type: "match", id: m.id }, { ...base, decision: why });
  if (st.start == null) return; // вылет на закупке/между раундами — просто ждём игрока, без шума
  await enqueueCommand(m.server_instance, "rcon", { command: `css_asay ${chatSafe(`Платформа: ${p.name} отключился — раунд продолжается (${why}). Капитан может взять техническую паузу: .tech`)}` });
  await notify(captain, `${p.name} отключился`, `Раунд ${roundNo} продолжается: ${why}. С начала следующего раунда можно взять техническую паузу командой .tech (до 2 по 5 минут за карту).`, link);
}
