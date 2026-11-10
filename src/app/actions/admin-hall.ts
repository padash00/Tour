"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import type { ActionResult } from "@/components/forms";
import { blockById, blockLabel, pairKey, serializeForbidden, serializeOff } from "@/lib/hall-core";
import { callMatch, hallConfig, hallSnapshot, startHallVeto, updateBoard } from "@/lib/hall";
import { db } from "@/lib/supabase";
import { setAppSettings } from "@/lib/telegram";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Вызвать матч на места: сайт сам выбирает блоки, либо админ указывает их */
export async function adminCallMatch(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const matchId = String(formData.get("matchId") ?? "");
  if (!UUID.test(matchId)) return { error: "Матч не найден" };
  const s1 = String(formData.get("seat1") ?? "");
  const s2 = String(formData.get("seat2") ?? "");
  if (!!s1 !== !!s2) return { error: "Выберите оба блока — или оставьте «авто» у обоих" };
  const seats = s1 && s2 ? ([s1, s2] as [string, string]) : undefined;
  const r = await callMatch(matchId, { actorId: admin.id, seats });
  if (typeof r === "string") return { error: r };
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}`);
  revalidatePath("/admin/hall");
  return { success: `Вызван: ${r.team1.name} — ${blockLabel(r.plan.seat1)}, ${r.team2.name} — ${blockLabel(r.plan.seat2)}` };
}

/** Начать бан-пик, не дожидаясь «Готов» */
export async function adminHallVetoNow(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const matchId = String(formData.get("matchId") ?? "");
  if (!UUID.test(matchId)) return { error: "Матч не найден" };
  if (!(await startHallVeto(matchId, "admin"))) return { error: "Бан-пик уже идёт или матч не готов" };
  await audit(admin.id, "match.veto_start", { type: "match", id: matchId }, { hall: true });
  revalidatePath(`/admin/matches/${matchId}`);
  revalidatePath(`/matches/${matchId}`);
  return { success: "Бан-пик начался" };
}

export async function adminHallToggle(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const on = formData.get("on") === "1";
  await setAppSettings({ HALL_SEATING: on ? "1" : "0" });
  await audit(admin.id, "hall.toggle", undefined, { on });
  if (on) await updateBoard().catch(() => {});
  revalidatePath("/admin/hall");
  return { success: on ? "Рассадка включена" : "Рассадка выключена — бан-пик снова начинается как раньше" };
}

/** Переключить запрет пары блоков (соперники не могут сидеть) */
export async function adminHallForbid(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const a = String(formData.get("a") ?? "");
  const b = String(formData.get("b") ?? "");
  if (!blockById(a) || !blockById(b) || a === b) return { error: "Не те блоки" };
  const cfg = await hallConfig();
  const set = new Set(cfg.forbidden);
  const key = pairKey(a, b);
  if (set.has(key)) set.delete(key);
  else set.add(key);
  await setAppSettings({ HALL_FORBIDDEN: serializeForbidden(set) });
  await audit(admin.id, "hall.forbidden", undefined, { pair: key, forbidden: set.has(key) });
  revalidatePath("/admin/hall");
  return null;
}

/** Блок в игре / не используется на турнире (HALL_OFF) */
export async function adminHallBlockOff(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const id = String(formData.get("block") ?? "");
  if (!blockById(id)) return { error: "Нет такого блока" };
  const cfg = await hallConfig();
  const set = new Set(cfg.off);
  if (set.has(id)) set.delete(id);
  else set.add(id);
  await setAppSettings({ HALL_OFF: serializeOff(set) });
  await audit(admin.id, "hall.block_off", undefined, { block: id, off: set.has(id) });
  revalidatePath("/admin/hall");
  return null;
}

export async function adminHallResetForbidden(): Promise<ActionResult> {
  const admin = await requireAdmin();
  await setAppSettings({ HALL_FORBIDDEN: "" });
  await audit(admin.id, "hall.forbidden_reset");
  revalidatePath("/admin/hall");
  return { success: "Запреты — по умолчанию" };
}

/** «Блок свободен»: команды закончившегося матча ушли раньше 5 минут / ждущая команда освободила место */
export async function adminHallFree(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdmin();
  const block = String(formData.get("block") ?? "");
  if (!blockById(block)) return { error: "Нет такого блока" };
  const cfg = await hallConfig();
  const { data: ts } = await db().from("tournaments").select("id").eq("is_lan", true).in("status", ["checkin", "live"]);
  for (const t of ts ?? []) {
    const snap = await hallSnapshot(t.id, cfg);
    const busy = snap.occupiedBy.get(block);
    if (busy && busy.match.status !== "finished") return { error: `${blockLabel(block)} занят идущим матчем #${busy.match.number} — освободится после матча` };
  }
  await setAppSettings({ HALL_FREED: JSON.stringify({ ...cfg.freed, [block]: new Date().toISOString() }) });
  await audit(admin.id, "hall.free", undefined, { block });
  await updateBoard().catch(() => {});
  revalidatePath("/admin/hall");
  return { success: `${blockLabel(block)} свободен` };
}
