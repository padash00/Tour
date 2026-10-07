"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { getMatch } from "@/lib/matches";
import { assignServer, enqueueCommand, enqueuePrefetch, getServerState, pickFreeInstance } from "@/lib/server-control";
import { adminIds } from "@/lib/server/admins";
import { db } from "@/lib/supabase";
import type { ActionResult } from "@/components/forms";

const TYPES = ["start", "stop", "restart", "end_match"] as const;

export async function sendMatchToServer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const m = await getMatch(String(formData.get("matchId")));
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "ready" && m.status !== "live") return { error: "Сначала завершите вето" };

  const wanted = String(formData.get("instance") ?? "");
  const { online, instances } = await getServerState();
  if (!online) return { error: "Server Agent не на связи — проверьте серверный ПК" };

  const target = wanted ? instances.find((i) => i.name === wanted) : await pickFreeInstance();
  if (!target) return { error: "Нет свободного запущенного сервера" };
  if (!target.running) return { error: `${target.name} не запущен` };
  if ((target.gamestate ?? "none") !== "none") return { error: `На ${target.name} уже загружен матч` };

  if (!(await assignServer(m, target.name, admin.id))) {
    return { error: "Состояние сервера изменилось: он занят, уже назначен или потерял связь. Обновите страницу." };
  }
  await audit(admin.id, "server.assign", { type: "match", id: m.id }, { instance: target.name, from: m.server_instance });
  revalidatePath(`/admin/matches/${m.id}`);
  revalidatePath("/admin/servers");
  return { success: `Матч отправлен на ${target.name}. Адрес появится у игроков после проверки сервера.` };
}

/**
 * Пуск / остановка / перезапуск / снятие матча с сервера.
 * На сервере идёт матч (status live):
 *  - перезапуск сохраняет матч за сервером: агент поднимает CS2, загружает матч заново и восстанавливает
 *    последний раунд из бэкапа MatchZy (как при падении);
 *  - остановка возможна только с подтверждением (поле confirm=1): матч переходит в «ошибку сервера»,
 *    админам — уведомление, дальше матч переносят на другой сервер.
 */
export async function serverCommand(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const instance = String(formData.get("instance"));
  const type = String(formData.get("type")) as (typeof TYPES)[number];
  if (!TYPES.includes(type)) return { error: "Неизвестная команда" };
  const { data } = await db().from("server_instances").select("name").eq("name", instance).maybeSingle();
  if (!data) return { error: "Инстанс не найден" };

  const { data: liveMatch } = await db().from("matches").select("id, number")
    .eq("server_instance", instance).eq("status", "live").maybeSingle();
  if (liveMatch && type === "stop" && formData.get("confirm") !== "1") {
    return { error: `На ${instance} идёт матч #${liveMatch.number}. Остановка прервёт игру — подтвердите её или используйте перезапуск (матч восстановится из бэкапа).` };
  }

  await enqueueCommand(instance, type, liveMatch && type === "restart" ? { keep_match: true } : {}, admin.id);
  if (type === "stop" || type === "restart" || type === "end_match") {
    // матч, закреплённый за сервером, снова ждёт назначения
    await db()
      .from("matches")
      .update({ server_state: null, server_instance: null, server_address: null })
      .eq("server_instance", instance)
      .in("status", ["ready"]);
  }
  if (liveMatch && type === "stop") {
    await db().from("matches").update({ server_state: "error" }).eq("id", liveMatch.id).eq("status", "live");
    await notify(
      await adminIds(),
      `Матч #${liveMatch.number}: сервер ${instance} остановлен админом`,
      "Матч шёл на этом сервере. Перенесите его на свободный сервер или запустите сервер и загрузите матч заново.",
      `/admin/matches/${liveMatch.id}`,
    );
  }
  await audit(admin.id, `server.${type}`, liveMatch ? { type: "match", id: liveMatch.id } : undefined, { instance, live_match: liveMatch?.number ?? null });
  revalidatePath("/admin/servers");
  if (liveMatch) revalidatePath(`/admin/matches/${liveMatch.id}`);
  if (liveMatch && type === "restart") return { success: `${instance}: перезапуск отправлен. Матч #${liveMatch.number} загрузится заново с последнего раунда.` };
  return { success: `${instance}: ${type} отправлено агенту` };
}

/** Отложенные буфером агента события (сайт раз за разом не смог их обработать) — снова в очередь досылки */
export async function replayRelayEvents(): Promise<ActionResult> {
  const admin = await requireAdmin();
  const { online, host } = await getServerState();
  if (!online) return { error: "Server Agent не на связи" };
  const failed = Number((host?.info as { relay?: { failed?: number } } | undefined)?.relay?.failed ?? 0);
  if (!failed) return { error: "Отложенных событий нет" };
  await enqueueCommand(null, "replay_failed_events", {}, admin.id);
  await audit(admin.id, "server.replay_failed_events", undefined, { failed });
  revalidatePath("/admin/servers");
  return { success: `Агент вернёт в очередь ${failed} отложенных событий` };
}

export async function serverRcon(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const instance = String(formData.get("instance"));
  const command = String(formData.get("command") ?? "").trim();
  if (!command) return { error: "Введите команду" };
  if (command.length > 200) return { error: "Слишком длинная команда" };
  if (/[\u0000-\u001f\u007f]/.test(command)) return { error: "Команда — одной строкой, без переносов" };
  const { data: inst } = await db().from("server_instances").select("name").eq("name", instance).maybeSingle();
  if (!inst) return { error: "Инстанс не найден" };
  await enqueueCommand(instance, "rcon", { command }, admin.id);
  await audit(admin.id, "server.rcon", undefined, { instance, command });
  revalidatePath("/admin/servers");
  return { success: "Команда отправлена — ответ появится в журнале команд" };
}

const HOST_TYPES = ["update_cs2", "update_plugins", "restart_all"] as const;

export async function setAutopilot(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("tournamentId"));
  const onValue = formData.get("on");
  if (onValue !== "0" && onValue !== "1") return { error: "Не удалось определить состояние автопилота" };
  const on = onValue === "1";
  const { data, error } = await db().from("tournaments").update({ autopilot: on }).eq("id", id).select("id");
  if (error) return { error: "Не удалось сохранить автопилот" };
  if (!data?.length) return { error: "Турнир не найден" };
  await audit(admin.id, on ? "tournament.autopilot_on" : "tournament.autopilot_off", { type: "tournament", id });
  revalidatePath(`/admin/tournaments/${id}`);
  return { success: on ? "Автопилот включён" : "Автопилот выключен" };
}

export async function setAutoApprove(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("tournamentId"));
  const onValue = formData.get("on");
  if (onValue !== "0" && onValue !== "1") return { error: "Не удалось определить состояние автоодобрения" };
  const on = onValue === "1";
  const { data, error } = await db().from("tournaments").update({ auto_approve: on }).eq("id", id).select("id");
  if (error) return { error: "Не удалось сохранить автоодобрение заявок" };
  if (!data?.length) return { error: "Турнир не найден" };
  await audit(admin.id, on ? "tournament.auto_approve_on" : "tournament.auto_approve_off", { type: "tournament", id });
  revalidatePath(`/admin/tournaments/${id}`);
  return { success: on ? "Заявки будут одобряться автоматически" : "Заявки снова одобряете вы" };
}

export async function prefetchMaps(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("tournamentId"));
  const { online } = await getServerState();
  if (!online) return { error: "Server Agent не на связи" };
  const n = await enqueuePrefetch(id, admin.id);
  if (!n) return { error: "В маппуле турнира нет карт из Workshop — прогревать нечего" };
  await audit(admin.id, "server.prefetch_maps", { type: "tournament", id }, { maps: n });
  revalidatePath("/admin/servers");
  return { success: `Агент скачивает ${n} карт(ы) на свободном сервере. Прогресс — в журнале команд на странице «Серверы».` };
}

/**
 * Обновления по сценарию из документа: есть LIVE/назначенные матчи → ждём;
 * нет → агент останавливает инстансы, обновляет, ставит плагины, запускает и проверяет.
 */
export async function hostCommand(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const type = String(formData.get("type")) as (typeof HOST_TYPES)[number];
  if (!HOST_TYPES.includes(type)) return { error: "Неизвестная команда" };

  const { online, host, instances } = await getServerState();
  if (!online) return { error: "Server Agent не на связи" };
  const info = host?.info as { busy?: string; busy_instances?: Record<string, string> } | undefined;
  if (info?.busy) return { error: "Агент уже выполняет обновление" };
  if (Object.keys(info?.busy_instances ?? {}).length) return { error: "Агент прогревает карты — обновление после прогрева" };

  const busy = instances.filter((i) => i.running && (i.gamestate ?? "none") !== "none");
  const { count } = await db()
    .from("matches")
    .select("id", { count: "exact", head: true })
    .not("server_instance", "is", null)
    .in("status", ["ready", "live"]);
  if (busy.length || (count ?? 0) > 0) {
    return { error: `Есть активные матчи (${busy.map((b) => b.name).join(", ") || `${count} назначено`}). Обновление — после их окончания.` };
  }

  await enqueueCommand(null, type, {}, admin.id);
  await audit(admin.id, `server.${type}`);
  revalidatePath("/admin/servers");
  return { success: "Команда отправлена агенту. Прогресс — в журнале команд." };
}

/**
 * Откат раунда: MatchZy восстанавливает бэкап «начало раунда K» (файл round{K-1}) и ставит паузу.
 * Работает только на идущей карте; во время перерыва между половинами и после карты MatchZy откажет.
 */
export async function restoreRound(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const matchId = String(formData.get("matchId"));
  const round = Number(formData.get("round"));
  if (!Number.isInteger(round) || round < 1 || round > 60) return { error: "Укажите номер раунда" };
  const m = await getMatch(matchId);
  if (!m || m.status !== "live" || !m.server_instance) return { error: "Откат возможен только во время игры на сервере" };
  const { instances } = await getServerState();
  const inst = instances.find((i) => i.name === m.server_instance);
  if (!inst?.running || inst.match_id !== m.id) return { error: `На ${m.server_instance} сейчас не этот матч` };
  await enqueueCommand(m.server_instance, "rcon", { command: `css_restore ${round - 1}` }, admin.id);
  await audit(admin.id, "match.restore_round", { type: "match", id: m.id }, { instance: m.server_instance, round });
  revalidatePath(`/admin/matches/${m.id}`);
  return { success: `Откат к началу раунда ${round} отправлен. MatchZy поставит паузу — снимите её, когда игроки готовы.` };
}

/**
 * Сообщение в чат игры от имени админа (css_asay → «[F16 ADMIN] текст» у всех на сервере).
 * instance = "all" — на все запущенные серверы.
 */
export async function sendChat(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const instance = String(formData.get("instance") ?? "");
  // консоль CS2 режет команду на ; и кавычках — убираем их и управляющие символы
  const text = String(formData.get("text") ?? "")
    .replace(/["\;\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
  if (!text) return { error: "Напишите сообщение" };
  const { online, instances } = await getServerState();
  if (!online) return { error: "Агент не на связи" };
  const targets = instance === "all" ? instances.filter((i) => i.running).map((i) => i.name) : [instance];
  if (!targets.length || targets.some((t) => !instances.some((i) => i.name === t && i.running))) {
    return { error: instance === "all" ? "Нет запущенных серверов" : `${instance} не запущен` };
  }
  for (const t of targets) await enqueueCommand(t, "rcon", { command: `css_asay ${text}` }, admin.id);
  await audit(admin.id, "server.chat", undefined, { instance, text });
  return { success: targets.length > 1 ? `Отправлено на ${targets.length} сервера` : `Отправлено на ${targets[0]}` };
}

/** Отдать сервер под лобби игроков (турниры его не берут) или вернуть турнирам */
export async function toggleLobbyServer(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin("/admin/servers");
  const instance = String(formData.get("instance"));
  const onValue = formData.get("on");
  if (onValue !== "0" && onValue !== "1") return { error: "Не удалось определить назначение сервера" };
  const on = onValue === "1";
  const { data, error } = await db().from("server_instances").update({ for_lobby: on }).eq("name", instance).select("name");
  if (error) return { error: "Не удалось сохранить назначение сервера" };
  if (!data?.length) return { error: "Инстанс не найден" };
  await audit(admin.id, "server.for_lobby", undefined, { instance, on });
  revalidatePath("/admin/servers");
  return { success: on ? `${instance} отдан под лобби` : `${instance} снова для турниров` };
}
