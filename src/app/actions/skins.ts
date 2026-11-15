"use server";

import { revalidatePath } from "next/cache";
import catalogJson from "../../../public/skins/catalog.json";
import { requirePlayer } from "@/lib/auth";
import { isRateLimited } from "@/lib/data";
import { getT } from "@/lib/i18n/server";
import { queueOps } from "@/lib/skins";
import { DEFAULT_KNIFE, parseOp, type SkinCatalog, type SkinOp } from "@/lib/skins-core";

const catalog = catalogJson as unknown as SkinCatalog;
const weaponPaints = new Map(catalog.weapons.map((w) => [w.d, new Set(w.paints.map((p) => p[0]))]));
const glovePaints = new Map(catalog.gloves.map((g) => [g.d, new Set(g.paints.map((p) => p[0]))]));
const knives = new Set(catalog.weapons.filter((w) => w.g === "knife").map((w) => w.w));

/** Правка ссылается на то, что есть в каталоге (оружие, раскраска, нож, перчатки) */
function known(op: SkinOp) {
  if (op.k === "skin") return weaponPaints.get(op.d)?.has(op.p) === true;
  if (op.k === "reset") return weaponPaints.has(op.d);
  if (op.k === "knife") return op.v === DEFAULT_KNIFE || knives.has(op.v);
  return op.d === 0 || glovePaints.get(op.d)?.has(op.p) === true;
}

/**
 * Игрок меняет свои скины: правки уходят в очередь серверному ПК, тот пишет их в базу плагина.
 * За один вызов — до 8 правок (одно оружие на обе стороны, нож с раскраской и т. п.).
 */
export async function saveSkins(raw: unknown[]): Promise<{ ok?: true; error?: string }> {
  const t = await getT();
  const player = await requirePlayer("/me/skins");
  if (!Array.isArray(raw) || raw.length < 1 || raw.length > 8) return { error: t("Не удалось сохранить — обновите страницу") };
  const ops: SkinOp[] = [];
  for (const item of raw) {
    const op = parseOp(item);
    if (!op || !known(op)) return { error: t("Такого скина нет в каталоге — обновите страницу") };
    ops.push(op);
  }
  if (await isRateLimited(player.id, "skins.save", 1)) return { error: t("Слишком часто — попробуйте через пару секунд") };
  if (!(await queueOps(player.steam_id, ops))) return { error: t("Слишком много изменений ждёт отправки на сервер — попробуйте через минуту") };
  revalidatePath("/me/skins");
  return { ok: true };
}

/** Убрать все скины, нож и перчатки на обеих сторонах */
export async function resetAllSkins(): Promise<{ ok?: true; error?: string }> {
  const t = await getT();
  const player = await requirePlayer("/me/skins");
  if (await isRateLimited(player.id, "skins.reset", 5)) return { error: t("Слишком часто — попробуйте через пару секунд") };
  const { getLoadout } = await import("@/lib/skins");
  const { loadout } = await getLoadout(player.steam_id);
  const ops: SkinOp[] = [];
  for (const team of [2, 3] as const) {
    if (loadout.gloves[team]) ops.push({ k: "glove", t: team, d: 0, p: 0, w: 0, s: 0 });
    if (loadout.knife[team]) ops.push({ k: "knife", t: team, v: DEFAULT_KNIFE });
  }
  const gloveIds = new Set(Object.values(loadout.gloves));
  for (const s of loadout.skins) if (!gloveIds.has(s.d)) ops.push({ k: "reset", t: s.t, d: s.d });
  if (!ops.length) return { ok: true };
  if (!(await queueOps(player.steam_id, ops))) return { error: t("Слишком много изменений ждёт отправки на сервер — попробуйте через минуту") };
  revalidatePath("/me/skins");
  return { ok: true };
}
