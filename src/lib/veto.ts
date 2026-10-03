/**
 * Вето карт. Команда 1 (выше по посеву) начинает.
 * BO1: баны по очереди, пока не останется одна карта.
 * BO3: бан, бан, пик, пик, дальше баны по очереди, последняя карта — decider.
 * BO5: баны, пока не останется 5 карт (из 7 — бан, бан), дальше пики по очереди, последняя карта — decider.
 */

export type VetoStepKind = "ban" | "pick" | "decider";
export type VetoStep = { step: number; team: 1 | 2 | null; action: VetoStepKind };
export type VetoAction = { step: number; team_id: string | null; action: VetoStepKind; map_name: string; auto?: boolean };

export const VETO_STEP_SECONDS = 60;

export function vetoPlan(bestOf: number, poolSize: number): VetoStep[] {
  const steps: VetoStep[] = [];
  let left = poolSize;
  let turn: 1 | 2 = 1;
  const push = (action: "ban" | "pick") => {
    steps.push({ step: steps.length + 1, team: turn, action });
    turn = turn === 1 ? 2 : 1;
    left--;
  };

  if (bestOf === 1) {
    while (left > 1) push("ban");
  } else if (bestOf === 3) {
    if (left >= 5) {
      push("ban");
      push("ban");
    }
    push("pick");
    push("pick");
    while (left > 1) push("ban");
  } else {
    // баны, пока не останется 5 карт (из 7 — ровно два бана), дальше пики, последняя — decider
    while (left > 5) push("ban");
    while (left > 1) push("pick");
  }
  steps.push({ step: steps.length + 1, team: null, action: "decider" });
  return steps;
}

export function vetoState(bestOf: number, pool: string[], actions: VetoAction[]) {
  const plan = vetoPlan(bestOf, pool.length);
  const used = new Set(actions.map((a) => a.map_name));
  const remaining = pool.filter((m) => !used.has(m));
  const current = plan[actions.length] ?? null;
  const complete = actions.length >= plan.length;
  return { plan, remaining, current, complete };
}

/** Итоговые карты серии: пики по порядку, затем decider */
export function seriesMaps(actions: VetoAction[]) {
  return actions
    .filter((a) => a.action === "pick" || a.action === "decider")
    .sort((a, b) => a.step - b.step)
    .map((a) => ({ map_name: a.map_name, picked_by: a.action === "pick" ? a.team_id : null }));
}
