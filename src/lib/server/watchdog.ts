import "server-only";
import { notify } from "../audit";
import { db } from "../supabase";
import { syncBracket } from "../matches";
import { adminIds } from "./admins";
import { MAP_LOAD_TIMEOUT_MS } from "./workshop";

// ───────────────────────── сторож: зависшие команды, загрузки и матчи, пропавшие с сервера

/** Команды агента, которые выполняются быстро (агент обрывает их через 60 с, перезапуск с матчем — через 170 с) */
const QUICK_COMMANDS = ["start", "stop", "restart", "load_match", "end_match", "rcon", "replay_failed_events"];
const STALE_COMMAND_MS = 3 * 60_000;
const LOAD_WATCHDOG_MS = MAP_LOAD_TIMEOUT_MS + 60_000;
/** Отчёт инстанса свежий: агент присылает его раз в 5 с */
const FRESH_INSTANCE_MS = 30_000;
/** Сколько сервер может показывать «нет этого матча», пока матч на сайте идёт */
const LIVE_MISMATCH_MS = 60_000;
const MISMATCH_KEY = "LIVE_MATCH_MISMATCH";

/**
 * Агент перезапустился посреди команды или упал — команда навсегда «отправлено», а матч навсегда «loading».
 * Такие команды закрываем ошибкой, а матч переводим в «error», чтобы автопилот/админ перенёс его.
 * Вызывается фоновыми задачами обслуживания раз в минуту.
 */
export async function expireStaleWork() {
  const staleBefore = new Date(Date.now() - STALE_COMMAND_MS).toISOString();
  const { data: stale } = await db()
    .from("agent_commands")
    .update({ status: "error", result: "нет ответа агента (перезапуск или сбой) — команда снята", done_at: new Date().toISOString() })
    .eq("status", "sent")
    .in("type", QUICK_COMMANDS)
    .lt("sent_at", staleBefore)
    .select("id, type, instance, payload, created_at");
  for (const c of stale ?? []) {
    if (c.type === "load_match" && c.payload?.match_id) {
      const table = c.payload.lobby ? "lobby_games" : "matches";
      await db().from(table).update({ server_state: "error" }).eq("id", String(c.payload.match_id))
        .eq("server_state", "loading").eq("server_instance", c.instance).lte("server_assigned_at", c.created_at);
    }
  }
  await db().from("agent_commands").update({ status: "error", result: "Время обслуживания истекло — проверьте агент перед повтором", done_at: new Date().toISOString() })
    .eq("status", "sent").not("type", "in", `(${QUICK_COMMANDS.join(",")})`)
    .lt("sent_at", new Date(Date.now() - 45 * 60_000).toISOString());

  // игра лобби «загружается», но MatchZy её так и не взял → ошибка, назначим заново
  const { data: lobbyLoading } = await db()
    .from("lobby_games")
    .select("id, matchzy_id, server_instance")
    .eq("server_state", "loading")
    .lt("server_assigned_at", new Date(Date.now() - LOAD_WATCHDOG_MS).toISOString());
  if (lobbyLoading?.length) {
    const { data: insts } = await db().from("server_instances").select("name, matchzy_match_id");
    const onServer = new Map((insts ?? []).map((i) => [i.name, i.matchzy_match_id]));
    for (const g of lobbyLoading) {
      if (onServer.get(g.server_instance) === g.matchzy_id) continue;
      await db()
        .from("lobby_games")
        .update({ server_state: "error", note: `${g.server_instance} не принял матч — ищем другой сервер` })
        .eq("id", g.id)
        .eq("server_state", "loading");
    }
  }

  // матч «загружается», но MatchZy так и не взял его (конфиг не скачался, команда потерялась)
  const loadBefore = new Date(Date.now() - LOAD_WATCHDOG_MS).toISOString();
  const { data: loading } = await db()
    .from("matches")
    .select("id, number, matchzy_id, server_instance")
    .eq("server_state", "loading")
    .lt("server_assigned_at", loadBefore);
  if (loading?.length) {
    const { data: insts } = await db().from("server_instances").select("name, matchzy_match_id");
    const onServer = new Map((insts ?? []).map((i) => [i.name, i.matchzy_match_id]));
    for (const m of loading) {
      if (onServer.get(m.server_instance) === m.matchzy_id) continue; // загружен — ждёт карту, это проверяет health check
      await db().from("matches").update({ server_state: "error" }).eq("id", m.id).eq("server_state", "loading");
      await notify(
        await adminIds(),
        `Матч #${m.number}: сервер ${m.server_instance} не принял матч`,
        "MatchZy не загрузил конфиг за 3 минуты. Автопилот перенесёт матч на свободный сервер; проверьте журнал команд агента.",
        `/admin/matches/${m.id}`,
      );
    }
  }

  await reconcileLiveMatches();
}

type Mismatch = Record<string, string>; // id матча → когда впервые увидели, что сервера у него нет

/**
 * Турнирный матч идёт на сайте, а его сервер больше минуты явно говорит «матча нет» (gamestate none или
 * другой matchid): сервер перезапустили мимо агента, MatchZy снял матч, series_end потерялся.
 * Админам — уведомление, у матча server_state = error (видно в пульте, матч можно перенести).
 * Пустой ответ сервера (RCON не ответил), подъём после падения и непустой буфер событий за «нет матча» не считаем.
 * Как у игр лобби (lobbyGameWatchdog), но турнирный матч сам не закрываем — решает админ.
 */
export async function reconcileLiveMatches() {
  const [{ data: live }, { data: insts }, { data: host }, { data: saved }] = await Promise.all([
    db().from("matches").select("id, number, matchzy_id, server_instance").eq("status", "live").not("server_instance", "is", null).or("server_state.is.null,server_state.neq.error"),
    db().from("server_instances").select("name, running, gamestate, matchzy_match_id, last_seen_at"),
    db().from("server_host").select("info").eq("id", "main").maybeSingle(),
    db().from("app_settings").select("value").eq("key", MISMATCH_KEY).maybeSingle(),
  ]);
  let seen: Mismatch = {};
  try {
    seen = saved?.value ? (JSON.parse(saved.value) as Mismatch) : {};
  } catch {}
  const info = (host?.info ?? {}) as { recovering?: string[]; relay?: { queued?: number; oldest_age_s?: number } | null };
  const recovering = new Set(info.recovering ?? []);
  // события ещё в буфере агента (обрыв связи) — series_end может быть среди них; ждём до 5 минут
  const relayBacklog = (info.relay?.queued ?? 0) > 0 && (info.relay?.oldest_age_s ?? 0) < 300;
  const byName = new Map((insts ?? []).map((i) => [i.name, i]));
  const now = Date.now();
  const next: Mismatch = {};
  for (const m of live ?? []) {
    const inst = byName.get(m.server_instance!);
    const fresh = !!inst?.last_seen_at && now - new Date(inst.last_seen_at).getTime() < FRESH_INSTANCE_MS;
    const gone = !!inst && fresh && inst.running && !recovering.has(inst.name) &&
      (inst.gamestate === "none" || (inst.matchzy_match_id != null && Number(inst.matchzy_match_id) !== Number(m.matchzy_id)));
    if (!gone) continue;
    const since = seen[m.id] ?? new Date(now).toISOString();
    if (now - new Date(since).getTime() < LIVE_MISMATCH_MS || relayBacklog) {
      next[m.id] = since;
      continue;
    }
    const { data: updated } = await db().from("matches").update({ server_state: "error" })
      .eq("id", m.id).eq("status", "live").or("server_state.is.null,server_state.neq.error").select("id");
    if (!updated?.length) continue;
    await notify(
      await adminIds(),
      `Матч #${m.number}: на ${inst!.name} его больше нет`,
      `Матч идёт на сайте, а сервер больше минуты показывает ${inst!.gamestate === "none" ? "«нет матча»" : `другой матч (${inst!.matchzy_match_id})`}. ` +
        "Проверьте сервер: загрузите матч заново или перенесите его, при необходимости внесите счёт вручную.",
      `/admin/matches/${m.id}`,
    );
    await db().from("audit_logs").insert({ action: "server.match_lost", entity_type: "match", entity_id: m.id, payload: { instance: inst!.name, gamestate: inst!.gamestate, matchzy_match_id: inst!.matchzy_match_id } });
  }
  if (JSON.stringify(next) !== JSON.stringify(seen)) {
    await db().from("app_settings").upsert({ key: MISMATCH_KEY, value: JSON.stringify(next), updated_at: new Date().toISOString() }).throwOnError();
  }
}

/**
 * Сетка продвигается после map_result/series_end «по возможности»: если тот шаг сорвался, событие уже принято
 * и повторно не придёт. Раз в тик обслуживания пересверяем сетки идущих турниров — без изменений это одно чтение.
 */
export async function resyncLiveBrackets() {
  const { data } = await db().from("tournaments").select("id").eq("status", "live");
  for (const t of data ?? []) await syncBracket(t.id as string);
}
