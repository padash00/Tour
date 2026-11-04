import "server-only";
import { audit } from "./audit";
import { mapName } from "./format";
import { ogKey } from "./og-image";
import { aggregatePlayers, getStatRows } from "./stats";
import { db } from "./supabase";
import { SITE_URL, telegramConfig, telegramGroup, tgCall, tgEscape } from "./telegram";

/*
 * Итоги матча в Telegram-теме «Матчи турнира»: картинка сайта «Статистика матча»
 * и подпись — счёт по картам, MVP, кто проходит дальше. Публикуется один раз (audit tg.match_result),
 * через пару минут после конца матча, когда статистика уже записана. Вызывается на синхронизации агента.
 */

const WINDOW_MS = 3 * 60 * 60_000; // старые матчи не публикуем
const STATS_WAIT_MS = 90_000; // статистика пишется чуть позже счёта
const STATS_GIVE_UP_MS = 6 * 60_000; // статистики так и нет — публикуем без неё

export async function postMatchResults() {
  const { data: th } = await db().from("app_settings").select("value").eq("key", "TELEGRAM_MATCHES_THREAD").maybeSingle();
  const thread = Number(th?.value || "") || null;
  if (!thread) return;
  const [tg, group] = await Promise.all([telegramConfig(), telegramGroup()]);
  if (!tg.token || !group.id) return;

  const now = Date.now();
  const { data: ms } = await db()
    .from("matches")
    .select("id, number, best_of, team1_id, team2_id, team1_score, team2_score, winner_id, winner_to_match, bracket, finished_at, is_walkover, tournament:tournaments!inner(name, status)")
    .eq("status", "finished")
    .gte("finished_at", new Date(now - WINDOW_MS).toISOString())
    .lte("finished_at", new Date(now - STATS_WAIT_MS).toISOString())
    .neq("tournament.status", "draft")
    .order("finished_at")
    .limit(10);
  if (!ms?.length) return;
  const { data: done } = await db()
    .from("audit_logs")
    .select("entity_id")
    .eq("action", "tg.match_result")
    .in("entity_id", ms.map((m) => m.id));
  const posted = new Set((done ?? []).map((d) => d.entity_id));

  for (const m of ms.filter((x) => !posted.has(x.id)).slice(0, 3)) {
    if (!m.team1_id || !m.team2_id) continue;
    const [{ data: teams }, { data: maps }, rows] = await Promise.all([
      db().from("teams").select("id, name").in("id", [m.team1_id, m.team2_id]),
      db().from("match_maps").select("map_number, map_name, team1_score, team2_score, status").eq("match_id", m.id).order("map_number"),
      getStatRows({ matchId: m.id }),
    ]);
    const age = now - new Date(m.finished_at!).getTime();
    if (!m.is_walkover && !rows.length && age < STATS_GIVE_UP_MS) continue; // ждём статистику
    // помечаем сразу — чтобы два тика подряд не опубликовали дважды
    await audit(null, "tg.match_result", { type: "match", id: m.id }, {});

    const name = (id: string | null) => (teams ?? []).find((t) => t.id === id)?.name ?? "?";
    const t1 = name(m.team1_id);
    const t2 = name(m.team2_id);
    const winner = name(m.winner_id);
    const played = (maps ?? []).filter((x) => x.status === "finished");
    const lines: string[] = [`🏁 <b>Матч #${m.number}</b> · ${tgEscape((m.tournament as unknown as { name: string }).name)}`];
    if (m.best_of > 1) lines.push(`<b>${tgEscape(t1)} ${m.team1_score} : ${m.team2_score} ${tgEscape(t2)}</b>`);
    else {
      const x = played[0];
      lines.push(`<b>${tgEscape(t1)} ${x?.team1_score ?? m.team1_score} : ${x?.team2_score ?? m.team2_score} ${tgEscape(t2)}</b>`);
    }
    if (m.is_walkover) lines.push("Техническая победа");
    for (const x of played) lines.push(`🗺 ${tgEscape(mapName(x.map_name))} — ${x.team1_score}:${x.team2_score}`);
    const mvp = aggregatePlayers(rows).sort((a, b) => b.rating - a.rating)[0];
    if (mvp) lines.push(`⭐ MVP: <b>${tgEscape(mvp.name)}</b> — ${mvp.kills}/${mvp.deaths}, ADR ${Math.round(mvp.adr)}, рейтинг ${mvp.rating.toFixed(2)}`);
    lines.push(m.bracket === "grand_final" ? `🏆 <b>${tgEscape(winner)}</b> — победитель турнира!` : m.winner_to_match ? `➡️ <b>${tgEscape(winner)}</b> проходит дальше` : `✅ Победа — <b>${tgEscape(winner)}</b>`);
    lines.push(`<a href="${SITE_URL}/matches/${m.id}">Страница матча и полная статистика</a>`);
    const caption = lines.join("\n");

    // одна картинка: «Статистика» (счёт, составы K/A/D/ADR; BO1 — с историей раундов, серия — весь матч);
    // статистики нет — «Результат»
    const path = `/matches/${m.id}/image`;
    const k = ogKey(path);
    const url = rows.length && played.length ? `${SITE_URL}${path}?f=stats&map=${played.length > 1 ? "all" : played[0].map_number}&k=${k}` : `${SITE_URL}${path}?f=post&k=${k}`;
    const pic = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(40_000) })
      .then((r) => (r.ok ? r.blob() : null))
      .catch(() => null);

    const base = { chat_id: group.id, message_thread_id: thread };
    if (!pic) {
      await tgCall(tg.token, "sendMessage", { ...base, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
      continue;
    }
    const form = new FormData();
    form.set("chat_id", String(group.id));
    form.set("message_thread_id", String(thread));
    form.set("photo", pic, "match.png");
    form.set("caption", caption);
    form.set("parse_mode", "HTML");
    const method = "sendPhoto";
    const res = await fetch(`https://api.telegram.org/bot${tg.token}/${method}`, { method: "POST", body: form, signal: AbortSignal.timeout(60_000) })
      .then((r) => r.json() as Promise<{ ok: boolean; description?: string }>)
      .catch((e) => ({ ok: false, description: String(e) }));
    if (!res.ok) {
      console.error("tg match result", res.description);
      await tgCall(tg.token, "sendMessage", { ...base, text: caption, parse_mode: "HTML", link_preview_options: { is_disabled: true } });
    }
  }
}
