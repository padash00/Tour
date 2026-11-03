import "server-only";
import { audit } from "./audit";
import { db } from "./supabase";
import { telegramConfig, telegramGroup, tgCall } from "./telegram";

/**
 * Вступление игроков в общий Telegram-чат.
 *  - нажатие «Вступить в чат» на сайте — audit_logs: tg.chat_click (actor_id = игрок);
 *  - у кого Telegram подтверждён, бот проверяет участие в группе (getChatMember);
 *  - окно на сайте показываем, пока игрок не нажал; если Telegram подтверждён, но в группе его нет
 *    больше суток после нажатия — показываем снова.
 */

const MEMBER = new Set(["creator", "administrator", "member", "restricted"]);
const memberCache = new Map<number, { member: boolean; at: number }>();

/** Состоит ли пользователь Telegram в группе; null — не удалось проверить */
export async function isGroupMember(tgUserId: number): Promise<boolean | null> {
  const hit = memberCache.get(tgUserId);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.member;
  const [cfg, group] = await Promise.all([telegramConfig(), telegramGroup()]);
  if (!cfg.token || !group.id) return null;
  const r = await tgCall<{ status: string; is_member?: boolean }>(cfg.token, "getChatMember", { chat_id: group.id, user_id: tgUserId });
  if (!r.ok || !r.result) return null;
  const member = MEMBER.has(r.result.status) && (r.result.status !== "restricted" || r.result.is_member !== false);
  memberCache.set(tgUserId, { member, at: Date.now() });
  return member;
}

/** Нужно ли показать игроку окно «Вступите в Telegram-чат» */
export async function shouldAskToJoin(playerId: string): Promise<boolean> {
  const [{ data: click }, { data: prof }] = await Promise.all([
    db().from("audit_logs").select("created_at").eq("action", "tg.chat_click").eq("actor_id", playerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    db().from("player_profiles").select("telegram_chat_id").eq("player_id", playerId).maybeSingle(),
  ]);
  const tg = prof?.telegram_chat_id ?? null;
  if (tg) {
    const member = await isGroupMember(tg);
    if (member === true) return false;
    // Telegram подтверждён, а в группе нет — спрашиваем снова, если со дня нажатия прошли сутки
    if (member === false) return !click || Date.now() - new Date(click.created_at).getTime() > 86_400_000;
  }
  return !click;
}

export async function markJoinClick(playerId: string) {
  await audit(playerId, "tg.chat_click", undefined, {});
}

export type JoinStats = {
  players: number;
  clicked: number;
  linked: number;
  linkedMembers: number;
  memberIds: string[];
  linkedNotMembers: { player_id: string; chat: number }[];
  notClicked: string[];
};

/** Статистика для пульта: сколько нажали, сколько реально в группе (у кого Telegram подтверждён) */
export async function joinStats(): Promise<JoinStats> {
  const [{ data: players }, { data: clicks }, { data: profs }] = await Promise.all([
    db().from("players").select("id").eq("is_banned", false),
    db().from("audit_logs").select("actor_id").eq("action", "tg.chat_click"),
    db().from("player_profiles").select("player_id, telegram_chat_id").not("telegram_chat_id", "is", null),
  ]);
  const clicked = new Set((clicks ?? []).map((c) => c.actor_id).filter(Boolean) as string[]);
  const all = (players ?? []).map((p) => p.id);
  const linked = (profs ?? []) as { player_id: string; telegram_chat_id: number }[];
  let linkedMembers = 0;
  const memberIds: string[] = [];
  const linkedNotMembers: JoinStats["linkedNotMembers"] = [];
  for (let i = 0; i < linked.length; i += 10) {
    const part = linked.slice(i, i + 10);
    const res = await Promise.all(part.map((p) => isGroupMember(p.telegram_chat_id)));
    part.forEach((p, k) => {
      if (res[k] === true) {
        linkedMembers++;
        memberIds.push(p.player_id);
      }
      else if (res[k] === false) linkedNotMembers.push({ player_id: p.player_id, chat: p.telegram_chat_id });
    });
  }
  return {
    players: all.length,
    clicked: all.filter((id) => clicked.has(id)).length,
    linked: linked.length,
    linkedMembers,
    memberIds,
    linkedNotMembers,
    notClicked: all.filter((id) => !clicked.has(id)),
  };
}
