"use server";

import { revalidatePath } from "next/cache";
import { requirePlayer } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { applyVetoTimeouts, getMatch, insertVetoAction } from "@/lib/matches";
import { VETO_STEP_SECONDS, vetoState } from "@/lib/veto";
import type { ActionResult } from "@/components/forms";

export async function vetoAct(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const matchId = String(formData.get("matchId"));
  const map = String(formData.get("map"));
  const player = await requirePlayer(`/matches/${matchId}`);

  await applyVetoTimeouts(matchId);
  const m = await getMatch(matchId);
  if (!m) return { error: "Матч не найден" };
  if (m.status !== "veto") return { error: "Вето сейчас не идёт" };

  const team = m.team1?.captain_id === player.id ? m.team1 : m.team2?.captain_id === player.id ? m.team2 : null;
  if (!team) return { error: "Действовать в вето может только капитан команды" };

  const state = vetoState(m.best_of, m.tournament.map_pool, m.veto);
  if (!state.current || state.current.action === "decider") return { error: "Вето уже завершено" };
  const turnTeam = state.current.team === 1 ? m.team1_id : m.team2_id;
  if (turnTeam !== team.id) return { error: "Сейчас ход соперника" };
  if (!state.remaining.includes(map)) return { error: "Эта карта уже выбрана" };

  const ok = await insertVetoAction(m, map, team.id, player.id, false, new Date(Date.now() + VETO_STEP_SECONDS * 1000));
  if (!ok) return { error: "Не удалось — обновите страницу" };

  await audit(player.id, `veto.${state.current.action}`, { type: "match", id: m.id }, { map, team: team.tag });
  revalidatePath(`/matches/${matchId}`);
  return null;
}
