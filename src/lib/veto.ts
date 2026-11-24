/**
 * Вето карт. Команда 1 (выше по посеву) начинает.
 * BO1: баны по очереди, пока не останется одна карта.
 * BO3: бан, бан, пик, пик, дальше баны по очереди, последняя карта — decider.
 * BO5: баны, пока не останется 5 карт (из 7 — бан, бан), дальше пики по очереди, последняя карта — decider.
 */

export type VetoStepKind = "ban" | "pick" | "decider";
export type VetoStep = { step: number; team: 1 | 2 | null; action: VetoStepKind };
/** side — сторона, которую на пикнутой карте выбрал соперник пикнувшего (стороны «по пикам») */
export type VetoAction = { step: number; team_id: string | null; action: VetoStepKind; map_name: string; auto?: boolean; side?: string | null };

export const VETO_STEP_SECONDS = 60;
/** На выбор стороны после пика; время вышло — CT */
export const SIDE_STEP_SECONDS = 30;

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

// ───────────────────────── стороны «по пикам»
// Как на крупных турнирах: на карте, которую пикнула команда, сторону выбирает соперник; решающая карта — ножевой.

/** Последний пик, на котором соперник ещё не выбрал сторону (бан-пик ждёт этого выбора); null — такого нет */
export function sidePending<A extends VetoAction>(actions: A[], sideChoice: boolean): A | null {
  if (!sideChoice || !actions.length) return null;
  const last = actions.reduce((a, b) => (b.step > a.step ? b : a));
  return last.action === "pick" && last.team_id && !last.side ? last : null;
}

/** Чей сейчас ход: бан, пик или выбор стороны на только что пикнутой карте */
export function vetoTurn(
  bestOf: number,
  pool: string[],
  actions: VetoAction[],
  o: { sideChoice: boolean; team1: string | null; team2: string | null },
): { teamId: string | null; action: "ban" | "pick" | "side"; map: string | null } | null {
  const pending = sidePending(actions, o.sideChoice);
  if (pending) return { teamId: pending.team_id === o.team1 ? o.team2 : o.team1, action: "side", map: pending.map_name };
  const cur = vetoState(bestOf, pool, actions).current;
  if (!cur || cur.action === "decider") return null;
  return { teamId: cur.team === 1 ? o.team1 : o.team2, action: cur.action, map: null };
}

/** Команда, которая начинает карту за CT: сторону выбирал соперник пикнувшего. null — выбора не было */
export function ctTeamOf(a: VetoAction | undefined, o: { team1: string | null; team2: string | null }): string | null {
  if (!a || a.action !== "pick" || !a.team_id || (a.side !== "ct" && a.side !== "t")) return null;
  const chooser = a.team_id === o.team1 ? o.team2 : o.team1;
  return a.side === "ct" ? chooser : a.team_id;
}

/** Стороны карт серии для MatchZy (map_sides) */
export function seriesSides(
  maps: string[],
  actions: VetoAction[],
  o: { sideChoice: boolean; knife: boolean; team1: string | null; team2: string | null },
): ("knife" | "team1_ct" | "team2_ct")[] {
  return maps.map((map, i) => {
    if (o.sideChoice) {
      const ct = ctTeamOf(actions.find((a) => a.map_name === map), o);
      return ct ? (ct === o.team1 ? "team1_ct" : "team2_ct") : "knife";
    }
    return o.knife ? "knife" : i % 2 === 0 ? "team1_ct" : "team2_ct";
  });
}
