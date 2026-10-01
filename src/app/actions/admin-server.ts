"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { getMatch } from "@/lib/matches";
import { assignServer, enqueueCommand, getServerState, pickFreeInstance } from "@/lib/server-control";
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

  // если матч переезжает (резерв) — снимаем его со старого инстанса
  if (m.server_instance && m.server_instance !== target.name) {
    await enqueueCommand(m.server_instance, "end_match", {}, admin.id);
  }
  await assignServer(m, target.name, admin.id);
  await audit(admin.id, "server.assign", { type: "match", id: m.id }, { instance: target.name, from: m.server_instance });
  revalidatePath(`/admin/matches/${m.id}`);
  revalidatePath("/admin/servers");
  return { success: `Матч отправлен на ${target.name}. Адрес появится у игроков после проверки сервера.` };
}

export async function serverCommand(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const instance = String(formData.get("instance"));
  const type = String(formData.get("type")) as (typeof TYPES)[number];
  if (!TYPES.includes(type)) return { error: "Неизвестная команда" };
  const { data } = await db().from("server_instances").select("name").eq("name", instance).maybeSingle();
  if (!data) return { error: "Инстанс не найден" };

  await enqueueCommand(instance, type, {}, admin.id);
  if (type === "stop" || type === "restart" || type === "end_match") {
    // матч, закреплённый за сервером, снова ждёт назначения
    await db()
      .from("matches")
      .update({ server_state: null, server_instance: null, server_address: null })
      .eq("server_instance", instance)
      .in("status", ["ready"]);
  }
  await audit(admin.id, `server.${type}`, undefined, { instance });
  revalidatePath("/admin/servers");
  return { success: `${instance}: ${type} отправлено агенту` };
}

export async function serverRcon(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const instance = String(formData.get("instance"));
  const command = String(formData.get("command") ?? "").trim();
  if (!command) return { error: "Введите команду" };
  if (command.length > 200) return { error: "Слишком длинная команда" };
  await enqueueCommand(instance, "rcon", { command }, admin.id);
  await audit(admin.id, "server.rcon", undefined, { instance, command });
  revalidatePath("/admin/servers");
  return { success: "Команда отправлена — ответ появится в журнале команд" };
}
