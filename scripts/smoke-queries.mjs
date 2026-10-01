// Проверяет на живой базе select-запросы с вложенными связями (только чтение).
// Запуск: node scripts/smoke-queries.mjs
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const MATCH = "*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)";

const checks = {
  matches: () => db.from("matches").select(MATCH).limit(1),
  matchFull: () =>
    db.from("matches").select(`${MATCH}, tournament:tournaments(*), maps:match_maps(*), veto:veto_actions(*)`).limit(1),
  teamMatches: () =>
    db
      .from("matches")
      .select(`${MATCH}, tournament:tournaments(*)`)
      .or("team1_id.eq.00000000-0000-0000-0000-000000000000,team2_id.eq.00000000-0000-0000-0000-000000000000")
      .limit(1),
  adminMatches: () =>
    db.from("matches").select(`${MATCH}, tournament:tournaments(name, slug, status)`).in("status", ["live"]).limit(1),
  rosters: () =>
    db
      .from("tournament_roster_players")
      .select("role, player:players(*), registration:tournament_registrations!inner(team_id)")
      .in("registration.team_id", ["00000000-0000-0000-0000-000000000000"])
      .limit(1),
  registrations: () =>
    db.from("tournament_registrations").select("*, team:teams(*), roster:tournament_roster_players(*, player:players(*))").limit(1),
  teamMembers: () => db.from("team_members").select("*, team:teams(*)").limit(1),
  teamsList: () => db.from("teams").select("*, team_members(left_at, player:players(faceit_elo))").limit(1),
  playersList: () => db.from("players").select("*, team_members(left_at, team:teams(name, tag))").limit(1),
  audit: () => db.from("audit_logs").select("*, actor:players(nickname, steam_id)").limit(1),
  tournamentsBracketCol: () => db.from("tournaments").select("id, bracket_published_at").limit(1),
  statRows: () =>
    db
      .from("player_map_stats")
      .select("*, match:matches!inner(id, tournament_id, status, tournament:tournaments!inner(status))")
      .neq("match.tournament.status", "draft")
      .gt("rounds_played", 0)
      .limit(1),
  teamTable: () =>
    db
      .from("matches")
      .select("id, maps:match_maps(team1_score, team2_score, winner_id, status), team1:teams!matches_team1_id_fkey(id, name, tag, logo_url), team2:teams!matches_team2_id_fkey(id, name, tag, logo_url), tournament:tournaments!inner(status)")
      .eq("status", "finished")
      .neq("tournament.status", "draft")
      .limit(1),
  mapTable: () =>
    db
      .from("match_maps")
      .select("map_name, match:matches!inner(tournament_id, tournament:tournaments!inner(status))")
      .neq("match.tournament.status", "draft")
      .limit(1),
  vetoTable: () =>
    db.from("veto_actions").select("map_name, action, match:matches!inner(tournament_id, tournament:tournaments!inner(status))").neq("match.tournament.status", "draft").limit(1),
  history: () =>
    db
      .from("player_map_stats")
      .select("*, match:matches!inner(id, number, tournament:tournaments!inner(name, slug, status), team1:teams!matches_team1_id_fkey(name, tag), team2:teams!matches_team2_id_fkey(name, tag), maps:match_maps(map_number, map_name, team1_score, team2_score))")
      .neq("match.tournament.status", "draft")
      .limit(1),
  rosterTournaments: () =>
    db
      .from("tournament_roster_players")
      .select("tournament_id, registration:tournament_registrations!inner(status), tournament:tournaments!inner(status)")
      .eq("registration.status", "approved")
      .neq("tournament.status", "draft")
      .limit(1),
  serverPage: () =>
    db.from("matches").select("id, number, server_instance, server_state, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag)").not("server_instance", "is", null).limit(1),
};

let failed = 0;
for (const [name, run] of Object.entries(checks)) {
  const { error } = await run();
  if (error) {
    failed++;
    console.log(`✕ ${name}: ${error.message}`);
  } else console.log(`✓ ${name}`);
}
process.exit(failed ? 1 : 0);
