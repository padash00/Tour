import "server-only";
import { createHash } from "node:crypto";
import { notify } from "../audit";
import { db } from "../supabase";
import type { ClaimIngestResult } from "../types";
import { adminIds } from "./admins";
import { enqueueAutoPrefetch } from "./workshop";

/*
 * Защита от сбоев в день турнира и «Проверка перед турниром».
 *   - дедупликация событий, которые агент досылает после обрыва связи;
 *   - проверка, не вышло ли обновление CS2 (Steam UpToDateCheck);
 *   - события агента (сервер упал и поднят / не удалось поднять) → уведомления админам;
 *   - отчёт самопроверки серверов.
 */

// ───────────────────────── дедупликация досылаемых событий

export const ingestKey = (prefix: string, body: string) => `${prefix}:${createHash("sha256").update(body).digest("hex")}`;

/**
 * A delivery is acknowledged only after completion. Database errors must reach
 * the relay as 5xx so its durable outbox keeps the event for another attempt.
 */
export async function claimIngest(key: string): Promise<ClaimIngestResult> {
  const { data, error } = await db().rpc("claim_ingest", { p_key: key });
  if (error) throw new Error("Не удалось принять событие", { cause: error });
  return data as ClaimIngestResult;
}

/** Обработка упала — снимаем отметку, чтобы досылка агента обработала событие заново */
export async function releaseIngest(key: string, token: string) {
  await db().from("ingest_dedupe").delete().eq("key", key).eq("lease_token", token).is("completed_at", null).throwOnError();
}

export async function completeIngest(key: string, token: string) {
  const { data } = await db().from("ingest_dedupe").update({ completed_at: new Date().toISOString(), lease_until: null })
    .eq("key", key).eq("lease_token", token).select("key").throwOnError();
  if (!data?.length) throw new Error("Срок обработки события истёк");
}

/** Старые ключи не нужны: агент досылает в пределах часов, не дней */
export async function pruneIngest() {
  if (Math.random() > 0.01) return; // примерно раз в 100 синхронизаций
  await db().from("ingest_dedupe").delete().lt("created_at", new Date(Date.now() - 3 * 86_400_000).toISOString());
  // журналы: аудит 180 дней, сырые события матчей 365, команды агента 30 (prune_old_rows в миграции integrity_rpcs)
  await db().rpc("prune_old_rows").throwOnError();
}

// ───────────────────────── обновление CS2

export type Cs2UpdateCheck = { patch: string; up_to_date: boolean; required: string | null; checked_at: string; error?: string };
const CS2_KEY = "CS2_UPDATE_CHECK";
const CS2_CHECK_EVERY_MS = 10 * 60_000;

export async function getCs2UpdateCheck(): Promise<Cs2UpdateCheck | null> {
  const { data } = await db().from("app_settings").select("value").eq("key", CS2_KEY).maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as Cs2UpdateCheck) : null;
  } catch {
    return null;
  }
}

/**
 * Сверяет версию серверов (PatchVersion из steam.inf, её присылает агент) со Steam.
 * Steam отвечает «up_to_date: false, required_version» сразу после выхода обновления —
 * клиенты игроков обновятся, а к старым серверам подключиться будет нельзя.
 */
export async function checkCs2UpToDate(patch: unknown) {
  if (typeof patch !== "string" || !/^[\d.]+$/.test(patch)) return;
  const prev = await getCs2UpdateCheck();
  if (prev && prev.patch === patch && Date.now() - new Date(prev.checked_at).getTime() < CS2_CHECK_EVERY_MS) return;
  let next: Cs2UpdateCheck;
  try {
    const res = await fetch(`https://api.steampowered.com/ISteamApps/UpToDateCheck/v1/?appid=730&version=${encodeURIComponent(patch)}`, {
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
    const j = (await res.json()) as { response?: { success?: boolean; up_to_date?: boolean; message?: string } };
    if (!j.response?.success) throw new Error("Steam не ответил");
    const required = /required:\s*([\d.]+)/i.exec(j.response.message ?? "")?.[1] ?? null;
    next = { patch, up_to_date: !!j.response.up_to_date, required, checked_at: new Date().toISOString() };
  } catch (e) {
    // Steam недоступен — оставляем прошлый результат, но отмечаем время, чтобы не долбить API
    next = { ...(prev ?? { patch, up_to_date: true, required: null }), patch, checked_at: new Date().toISOString(), error: String((e as Error).message ?? e) };
  }
  await db().from("app_settings").upsert({ key: CS2_KEY, value: JSON.stringify(next), updated_at: next.checked_at });
  if (prev?.up_to_date !== false && next.up_to_date === false) {
    await notify(
      await adminIds(),
      "Вышло обновление CS2",
      `Серверы на версии ${patch}, Steam требует ${next.required ?? "новую"}. Игроки с обновлённым клиентом не подключатся — обновите CS2 в F16 Control → Серверы.`,
      "/admin/servers",
    );
  }
}

// ───────────────────────── события агента

export type AgentEvent = {
  type: "recovered" | "recovery_failed" | "recovery_started";
  instance: string;
  matchzy_id?: number | null;
  detail?: string;
  at?: string;
  /** id события у агента: агент удаляет событие, только когда сайт вернул его id в processed_events */
  id?: string;
};

/** Ключ повтора события агента: тип, инстанс и время (одно событие могло прийти в двух синхронизациях) */
export const agentEventKey = (e: AgentEvent) =>
  e.at ? `agent-event:${e.type}:${e.instance}:${e.at}` : ingestKey("agent-event", JSON.stringify(e));

/**
 * Агент сам поднял упавший сервер (или не смог) — сообщаем админам и пишем в журнал.
 * Повтор (агент не получил ответ и прислал снова) отбрасывается. Возвращает id обработанных событий:
 * агент удаляет у себя только их, остальные пришлёт снова.
 */
export async function applyAgentEvents(events: unknown): Promise<string[]> {
  if (!Array.isArray(events) || events.length === 0) return [];
  const processed: string[] = [];
  let admins: string[] | null = null;
  for (const raw of events.slice(0, 20) as AgentEvent[]) {
    if (!raw || typeof raw.instance !== "string" || typeof raw.type !== "string") continue;
    const key = agentEventKey(raw);
    const claim = await claimIngest(key);
    if (claim.status === "done") {
      if (raw.id) processed.push(raw.id);
      continue;
    }
    if (claim.status !== "claimed" || !claim.token) continue; // обрабатывается параллельно — агент пришлёт снова
    try {
      admins ??= await adminIds();
      const { data: match } = raw.matchzy_id
        ? await db().from("matches").select("id, number").eq("matchzy_id", raw.matchzy_id).maybeSingle()
        : { data: null };
      const where = match ? `матч #${match.number}` : raw.instance;
      const detail = String(raw.detail ?? "").slice(0, 400);
      if (raw.type === "recovered") {
        await notify(admins, `${raw.instance} упал и поднят автоматически (${where})`, detail || "Матч загружен заново.", match ? `/admin/matches/${match.id}` : "/admin/servers");
      } else if (raw.type === "recovery_failed") {
        await notify(admins, `${raw.instance} упал — поднять не удалось (${where})`, detail || "Перенесите матч на другой сервер вручную.", match ? `/admin/matches/${match.id}` : "/admin/servers");
      }
      await db()
        .from("audit_logs")
        .insert({ action: `server.${raw.type}`, entity_type: match ? "match" : "server", entity_id: match?.id ?? null, payload: { instance: raw.instance, detail } })
        .throwOnError();
      await completeIngest(key, claim.token);
      if (raw.id) processed.push(raw.id);
    } catch (e) {
      await releaseIngest(key, claim.token).catch(() => {});
      throw e;
    }
  }
  return processed;
}

// ───────────────────────── проверка перед турниром

export type SelfCheckInstance = {
  name: string;
  was_running: boolean;
  skipped?: string;
  rcon: boolean;
  map: string | null;
  map_ok: boolean;
  matchzy: string | null;
  css: string | null;
  metamod: string | null;
  seconds: number;
  error?: string;
};

export type SelfCheckReport = {
  started_at: string;
  finished_at: string;
  instances: SelfCheckInstance[];
  host: {
    disk_free_gb: number | null;
    cs2_patch: string | null;
    cs2_build: string | null;
    reboot_pending: boolean | null;
    versions: Record<string, string>;
    workshop: { id: string; cached: boolean }[];
    relay: { running: boolean; queued: number; failed: number; failed_oldest_age_s?: number } | null;
    site_rtt_ms: number | null;
  };
  /** добавляет сайт: актуальна ли версия CS2 по Steam */
  cs2_up_to_date?: boolean | null;
  cs2_required?: string | null;
};

const SELF_CHECK_KEY = "SELF_CHECK_REPORT";

export async function saveSelfCheck(result: string) {
  let report: SelfCheckReport;
  try {
    report = JSON.parse(result) as SelfCheckReport;
  } catch {
    return;
  }
  if (report.host?.cs2_patch) await checkCs2UpToDate(report.host.cs2_patch).catch(() => {});
  const cs2 = await getCs2UpdateCheck();
  report.cs2_up_to_date = cs2 ? cs2.up_to_date : null;
  report.cs2_required = cs2?.required ?? null;
  await db().from("app_settings").upsert({ key: SELF_CHECK_KEY, value: JSON.stringify(report), updated_at: new Date().toISOString() });
  // Workshop-карт турниров нет в кэше — сразу ставим прогрев, чтобы к матчу они были скачаны
  const missing = (report.host?.workshop ?? []).filter((w) => !w.cached).map((w) => w.id);
  if (missing.length) await enqueueAutoPrefetch(missing);
}

export async function getSelfCheck(): Promise<SelfCheckReport | null> {
  const { data } = await db().from("app_settings").select("value").eq("key", SELF_CHECK_KEY).maybeSingle();
  try {
    return data?.value ? (JSON.parse(data.value) as SelfCheckReport) : null;
  } catch {
    return null;
  }
}

/** Пункты отчёта для экрана: зелёный / красный / жёлтый */
export type CheckItem = { label: string; ok: boolean | null; detail: string };

export function selfCheckItems(r: SelfCheckReport): CheckItem[] {
  const items: CheckItem[] = [];
  for (const i of r.instances) {
    if (i.skipped) {
      items.push({ label: i.name, ok: i.rcon, detail: `${i.skipped}${i.rcon ? " · RCON отвечает" : " · RCON не отвечает"}` });
      continue;
    }
    const ok = i.rcon && i.map_ok && !!i.matchzy;
    const parts = [
      i.rcon ? "RCON ✓" : "RCON ✕",
      i.map_ok ? `карта ${i.map} ✓` : `карта ✕${i.map ? ` (${i.map})` : ""}`,
      i.matchzy ? `MatchZy ${i.matchzy}` : "MatchZy не загружен",
      `${i.seconds} с`,
    ];
    items.push({ label: i.name, ok, detail: i.error ? `${parts.join(" · ")} · ${i.error}` : parts.join(" · ") });
  }
  const h = r.host;
  items.push({
    label: "Версия CS2",
    ok: r.cs2_up_to_date ?? null,
    detail:
      r.cs2_up_to_date === false
        ? `сервер ${h.cs2_patch ?? "?"}, Steam требует ${r.cs2_required ?? "новую"} — обновите CS2`
        : `${h.cs2_patch ?? "—"} (build ${h.cs2_build ?? "—"})${r.cs2_up_to_date == null ? " · Steam не ответил" : " · актуальна"}`,
  });
  items.push({
    label: "Перезагрузка Windows",
    ok: h.reboot_pending == null ? null : !h.reboot_pending,
    detail: h.reboot_pending ? "Windows ждёт перезагрузку — перезагрузите ПК до турнира, иначе он может перезапуститься сам" : h.reboot_pending == null ? "не удалось проверить" : "не требуется",
  });
  items.push({
    label: "Диск D",
    ok: h.disk_free_gb == null ? null : h.disk_free_gb >= 20,
    detail: h.disk_free_gb == null ? "не удалось проверить" : `${h.disk_free_gb} GB свободно${h.disk_free_gb < 20 ? " — мало для обновления CS2" : ""}`,
  });
  items.push({
    label: "Плагины",
    ok: !!(h.versions.matchzy && h.versions.counterstrikesharp),
    detail: `MatchZy ${h.versions.matchzy ?? "?"} · CSSharp ${h.versions.counterstrikesharp ?? "?"} · Metamod ${h.versions.metamod ?? "?"}`,
  });
  if (h.workshop.length) {
    const missing = h.workshop.filter((w) => !w.cached);
    items.push({
      label: "Workshop-карты турниров",
      ok: missing.length === 0,
      detail: missing.length ? `не скачаны: ${missing.map((w) => w.id).join(", ")} — запустится прогрев` : `${h.workshop.length} в кэше`,
    });
  }
  items.push({
    label: "Связь с сайтом",
    ok: h.site_rtt_ms == null ? null : h.site_rtt_ms < 1500,
    detail: h.site_rtt_ms == null ? "нет замеров" : `${h.site_rtt_ms} мс на синхронизацию`,
  });
  items.push({
    label: "Буфер событий",
    ok: h.relay ? h.relay.running && h.relay.failed === 0 : false,
    detail: !h.relay
      ? "агент старой версии — обновится сам"
      : !h.relay.running
        ? "не запущен — события идут на сайт напрямую и пропадут при обрыве связи"
        : `работает · в очереди ${h.relay.queued}${h.relay.failed ? ` · отложено ${h.relay.failed}${h.relay.failed_oldest_age_s ? ` (старейшему ${Math.round(h.relay.failed_oldest_age_s / 60)} мин)` : ""} — после исправления причины верните их в очередь (команда агента replay_failed_events)` : ""}`,
  });
  return items;
}

// ───────────────────────── общее

export { adminIds } from "./admins";
