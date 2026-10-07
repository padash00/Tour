// Загрузка матча в MatchZy на инстансе (и по команде сайта, и при автоподъёме после падения).
import { AUTO_HALFTIME_VOICE } from "./enforce.mjs";
import { parseGet5 } from "./lib.mjs";

const q = (s) => `"${String(s).replace(/"/g, "")}"`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** ctx: { rc(inst, command), relay, enforce, log } */
export function createMatchLoader({ rc, relay, enforce }) {
  /**
   * Адреса матча — через буфер агента: события и лог копятся на диске при обрыве связи,
   * конфиг кэшируется и отдаётся MatchZy локально (матч можно загрузить заново без интернета).
   * Буфер не запустился — оставляем прямые адреса сайта.
   */
  async function viaRelay(payload) {
    if (!relay.running) return payload;
    const out = { ...payload, events_url: relay.urls.events };
    if (payload.log_url) {
      try {
        out.log_url = relay.urls.log(new URL(payload.log_url).searchParams.toString());
      } catch {}
    }
    try {
      const res = await fetch(payload.url, { headers: { [payload.header_key]: payload.header_value }, signal: AbortSignal.timeout(15_000) });
      if (res.ok) {
        relay.saveConfig(payload.match_id, await res.text());
        out.url = relay.urls.config(payload.match_id);
      }
    } catch {
      // сайт не ответил — MatchZy попробует скачать конфиг напрямую
    }
    return out;
  }

  /** Отправка событий и HTTP-лога: загрузка матча сбрасывает эти настройки — выставляем после неё, в кавычках */
  async function remoteLogging(inst, { header_key, header_value, events_url, log_url, post_cmds = [] }) {
    for (const c of [
      `matchzy_remote_log_url ${q(events_url)}`,
      `matchzy_remote_log_header_key ${q(header_key)}`,
      `matchzy_remote_log_header_value ${q(header_value)}`,
      // HTTP-лог CS2 для Swing: каждое убийство, плент, дефьюз и конец раунда
      "logaddress_delall_http",
      ...(log_url ? [`logaddress_add_http ${q(log_url)}`] : []),
      // настройки MatchZy из турнира (без кавычек — int-convar'ы)
      ...post_cmds.filter((c) => /^matchzy_[a-z_]+ \d+$/.test(c)),
    ]) {
      await rc(inst, c).catch(() => {});
    }
  }

  async function loadMatch(inst, payload) {
    const { url, header_key, header_value, events_url, enforce: rule = null } = payload;
    enforce.set(inst, rule, header_value);
    const relayNote = `события → ${String(events_url).startsWith("http://127.0.0.1") ? "буфер агента" : "сайт"}${String(url).startsWith("http://127.0.0.1") ? " · конфиг из кэша" : ""}`;
    // Этот же матч уже загружен (повторная доставка, сервер не падал) — get5_endmatch и повторная загрузка
    // сбросили бы идущую игру. Только возвращаем адреса событий.
    const current = parseGet5(await rc(inst, "get5_status").catch(() => null));
    if (current && current.gamestate && current.gamestate !== "none" && Number(current.matchid) === Number(payload.matchzy_id)) {
      await remoteLogging(inst, payload);
      return { ok: true, result: `матч ${payload.matchzy_id} уже загружен (${current.gamestate}) · ${relayNote}` };
    }
    // на случай, если на сервере остался старый (другой) матч; состояние неизвестно — тоже снимаем, как раньше
    if (!current || current.gamestate !== "none") await rc(inst, "get5_endmatch").catch(() => {});
    await rc(inst, `${AUTO_HALFTIME_VOICE} 0`).catch(() => {});
    const out = await rc(inst, `matchzy_loadmatch_url ${q(url)} ${q(header_key)} ${q(header_value)}`);
    await sleep(2500);
    await remoteLogging(inst, payload);
    return { ok: true, result: `${out.trim() || "loadmatch sent"} · ${relayNote}` };
  }

  return { loadMatch, viaRelay };
}
