import "server-only";
import { db } from "@/lib/supabase";
import { applyOp, parseLoadout, parseOp, type Loadout, type SkinOp } from "@/lib/skins-core";

/** Сколько неприменённых изменений одного игрока держим в очереди (защита от накрутки) */
export const PENDING_LIMIT = 300;
/** Изменение, которое агент не забрал за это время, считается зависшим — на странице показываем предупреждение */
export const STALE_MS = 2 * 60_000;

export type LoadoutView = {
  loadout: Loadout;
  /** изменений ждёт переноса на сервер */
  pending: number;
  /** самое старое ждёт дольше STALE_MS — серверный ПК не на связи */
  stale: boolean;
  /** когда набор последний раз пришёл с сервера; null — на сервере набора ещё нет */
  syncedAt: string | null;
};

/** Набор игрока: зеркало с сервера + изменения с сайта, которые агент ещё не перенёс */
export async function getLoadout(steamId: string): Promise<LoadoutView> {
  const [mirror, ops] = await Promise.all([
    db().from("player_skins").select("data, synced_at").eq("steam_id", steamId).maybeSingle(),
    db().from("skin_ops").select("op, created_at").eq("steam_id", steamId).is("applied_at", null).order("id").limit(PENDING_LIMIT),
  ]);
  let loadout = parseLoadout(mirror.data?.data);
  const pending = ops.data ?? [];
  for (const row of pending) {
    const op = parseOp(row.op);
    if (op) loadout = applyOp(loadout, op);
  }
  return {
    loadout,
    pending: pending.length,
    stale: pending.length > 0 && Date.now() - Date.parse(pending[0].created_at) > STALE_MS,
    syncedAt: mirror.data?.synced_at ?? null,
  };
}

/** Ставит изменения в очередь агенту. Возвращает false, если очередь игрока переполнена */
export async function queueOps(steamId: string, ops: SkinOp[]): Promise<boolean> {
  const { count } = await db().from("skin_ops").select("id", { count: "exact", head: true }).eq("steam_id", steamId).is("applied_at", null);
  if ((count ?? 0) + ops.length > PENDING_LIMIT) return false;
  await db().from("skin_ops").insert(ops.map((op) => ({ steam_id: steamId, op }))).throwOnError();
  return true;
}

export type AgentSkinState = { steam_id: string; data: unknown };
export type AgentSkinAck = { id: number; error?: string | null };

/**
 * Обмен с агентом: он присылает подтверждения применённых изменений и наборы игроков, которые изменились
 * в базе плагина; получает следующую пачку изменений с сайта.
 * Порядок важен: сначала зеркало, потом подтверждения — иначе на миг показался бы старый набор без правки.
 */
export async function exchangeWithAgent(state: AgentSkinState[], acks: AgentSkinAck[]) {
  const now = new Date().toISOString();
  if (state.length) {
    const rows = state.map((s) => ({ steam_id: s.steam_id, data: parseLoadout(s.data), synced_at: now }));
    await db().from("player_skins").upsert(rows).throwOnError();
  }
  for (const ack of acks) {
    await db().from("skin_ops").update({ applied_at: now, error: ack.error ? String(ack.error).slice(0, 300) : null }).eq("id", ack.id).is("applied_at", null).throwOnError();
  }
  const { data } = await db().from("skin_ops").select("id, steam_id, op").is("applied_at", null).order("id").limit(200).throwOnError();
  // применённые давно — не нужны: история правок скинов нигде не показывается
  await db().from("skin_ops").delete().not("applied_at", "is", null).lt("applied_at", new Date(Date.now() - 24 * 3600_000).toISOString());
  return (data ?? []).map((r) => ({ id: r.id, steam_id: r.steam_id, op: r.op }));
}
