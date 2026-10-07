import "server-only";
import { cache } from "react";
import { bestRifler, bestSniper, bestSupport, NOMINATIONS, type NominationDef, type NominationKey, type NominationLine } from "./nominations-core";
import { displayFullNames } from "./person-name";
import { getPlayerLeaderboard, getTournamentWeaponKills, mvpOf } from "./stats";
import { db } from "./supabase";
import type { Team } from "./types";

/*
 * Номинации турнира: кандидат по статистике (nominations-core) и решение судей (tournament_nominations).
 * Решение судей всегда главнее; без него действует кандидат по статистике.
 */

export type NominationTeam = Pick<Team, "id" | "name" | "tag" | "logo_url">;

export type NominationPerson = {
  playerId: string | null;
  /** имя для документов: displayFullName игрока или введённое судьями (тренер) */
  name: string;
  team: NominationTeam | null;
};

export type Nomination = NominationDef & {
  computed: (NominationPerson & { value: string }) | null;
  decision: (NominationPerson & { note: string | null; decidedAt: string }) | null;
  /** итог: решение судей или кандидат по статистике */
  winner: (NominationPerson & { value: string | null; source: "judges" | "stats" }) | null;
};

/** Строки статистики игроков турнира для расчёта номинаций */
async function nominationLines(tournamentId: string) {
  const [board, weapons] = await Promise.all([getPlayerLeaderboard(tournamentId), getTournamentWeaponKills(tournamentId)]);
  const teamMaps = new Map<string, number>();
  for (const p of board) if (p.team_id) teamMaps.set(p.team_id, Math.max(teamMaps.get(p.team_id) ?? 0, p.maps));
  const hasWeapons = weapons.size > 0;
  const lines: NominationLine[] = board
    .filter((p) => p.player_id)
    .map((p) => {
      const w = weapons.get(p.steam_id);
      return {
        key: p.player_id!,
        teamId: p.team_id,
        maps: p.maps,
        teamMaps: teamMaps.get(p.team_id ?? "") ?? p.maps,
        rounds: p.rounds,
        assists: p.assists,
        flashAssists: p.flashAssists,
        utilityDamage: p.utilityDamage,
        kast: p.kast,
        adr: p.adr,
        rating: p.rating,
        sniperKills: hasWeapons ? (w?.sniper ?? 0) : null,
        loggedKills: hasWeapons ? (w?.total ?? 0) : null,
      };
    });
  return { board, lines };
}

export const getTournamentNominations = cache(async (tournamentId: string): Promise<Nomination[]> => {
  const [{ board, lines }, { data: rows }] = await Promise.all([
    nominationLines(tournamentId),
    db().from("tournament_nominations").select("*").eq("tournament_id", tournamentId),
  ]);

  const computed = new Map<NominationKey, { playerId: string; teamId: string | null; value: string }>();
  const mvp = mvpOf(board);
  if (mvp?.player_id) {
    computed.set("mvp", {
      playerId: mvp.player_id,
      teamId: mvp.team_id,
      value: mvp.by === "swing" && mvp.swing != null ? `Swing ${mvp.swing >= 0 ? "+" : ""}${mvp.swing.toFixed(1)}` : `Rating ${mvp.rating.toFixed(2)}`,
    });
  }
  for (const [key, pick] of [
    ["sniper", bestSniper(lines)],
    ["rifler", bestRifler(lines)],
    ["support", bestSupport(lines)],
  ] as const) {
    if (pick) computed.set(key, { playerId: pick.line.key, teamId: pick.line.teamId, value: pick.value });
  }

  const decisions = new Map((rows ?? []).map((r) => [r.key, r]));
  const playerIds = [...[...computed.values()].map((c) => c.playerId), ...(rows ?? []).map((r) => r.player_id).filter((x): x is string => !!x)];
  const teamIds = [...new Set([...[...computed.values()].map((c) => c.teamId), ...(rows ?? []).map((r) => r.team_id)].filter((x): x is string => !!x))];
  const [names, { data: teams }] = await Promise.all([
    displayFullNames(playerIds),
    teamIds.length ? db().from("teams").select("id, name, tag, logo_url").in("id", teamIds) : Promise.resolve({ data: [] as NominationTeam[] }),
  ]);
  const teamById = new Map((teams ?? []).map((t) => [t.id, t as NominationTeam]));
  const team = (id: string | null) => (id ? (teamById.get(id) ?? null) : null);

  return NOMINATIONS.map((def) => {
    const c = computed.get(def.key);
    const d = decisions.get(def.key);
    const computedPerson = c ? { playerId: c.playerId, name: names.get(c.playerId) ?? "—", team: team(c.teamId), value: c.value } : null;
    const decision = d
      ? {
          playerId: d.player_id,
          name: d.name ?? (d.player_id ? (names.get(d.player_id) ?? "—") : "—"),
          team: team(d.team_id),
          note: d.note,
          decidedAt: d.decided_at,
        }
      : null;
    const winner = decision
      ? { ...decision, value: decision.note, source: "judges" as const }
      : computedPerson
        ? { ...computedPerson, source: "stats" as const }
        : null;
    return { ...def, computed: computedPerson, decision, winner };
  });
});
