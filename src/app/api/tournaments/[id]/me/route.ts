import { NextResponse } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTeamMembers, getTournamentById } from "@/lib/data";

/**
 * Участие зрителя в турнире: страница турнира кэшируется CDN одинаковой для всех,
 * а панель участия и кнопки («Подать заявку / Пройти check-in / Управлять заявкой») уточняются отсюда.
 * mains — сколько игроков в основе команды (капитан + игроки), чтобы показать «состав неполный / готов».
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/tournaments/[id]/me">) {
  const { id } = await ctx.params;
  const headers = { "Cache-Control": "private, no-store" };
  const player = await getCurrentPlayer();
  if (!player) return NextResponse.json({ loggedIn: false, isAdmin: false, team: null, isCaptain: false, reg: null }, { headers });
  const t = await getTournamentById(id);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404, headers });
  const team = await getEntrantTeam(player, t);
  const [reg, members] = team ? await Promise.all([getRegistration(t.id, team.id), getTeamMembers(team.id)]) : [null, []];
  return NextResponse.json(
    {
      loggedIn: true,
      isAdmin: isAdmin(player),
      team: team ? { id: team.id, name: team.name, captain_id: team.captain_id, mains: members.filter((m) => m.role !== "substitute").length, solo: !!team.is_solo } : null,
      isCaptain: !!team && team.captain_id === player.id,
      reg: reg ? { status: reg.status, checked_in_at: reg.checked_in_at, note: reg.note, created_at: reg.created_at } : null,
    },
    { headers },
  );
}
