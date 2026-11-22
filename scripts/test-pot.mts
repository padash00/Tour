// «Десятка» целиком на PGlite: допуск по тирам, выбор игроков змейкой, капитаны по ELO, вето BO3, итог и банк.
// supabase-js сайта ходит в мини-PostgREST (scripts/lib/pg-rest.mjs). Не читает .env и не ходит в сеть.
import assert from "node:assert/strict";
import { createPgRest } from "./lib/pg-rest.mjs";
import { migratedDatabase } from "./lib/test-db.mjs";

const sql = await migratedDatabase();
globalThis.fetch = createPgRest(sql) as typeof fetch;

const L = await import("../src/lib/lobby");
const { normalizeSettings, DEFAULT_SETTINGS, POT_MAPS, potBank } = await import("../src/lib/lobby-settings");
const { snakeTurn } = await import("../src/lib/tiers");

let checks = 0;
const ok = (name: string) => (checks++, console.log(`✓ ${name}`));
const one = async <T,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows[0];

// десять игроков: ELO от 3150 до 2250 шагом 100 — тиры S, A, B, C
const elos = [3150, 3050, 2950, 2850, 2750, 2650, 2550, 2450, 2350, 2250];
const players: { id: string; nick: string; elo: number }[] = [];
for (const [i, elo] of elos.entries()) {
  const row = await one<{ id: string }>(
    "insert into players(steam_id, nickname, faceit_elo, faceit_level) values($1, $2, $3, 10) returning id",
    [`765611994${String(i).padStart(8, "0")}`, `pot${i}`, elo],
  );
  players.push({ id: row.id, nick: `pot${i}`, elo });
}
const host = players[4]; // организатор — не самый сильный: капитаном он стать не должен

try {
  // ── допуск
  const settings = normalizeSettings({ ...DEFAULT_SETTINGS, pot: true, pot_tiers: ["S", "A", "B", "C"], pot_fee: 5000, best_of: 3, map_choice: "veto", maps: POT_MAPS, rematch: false });
  assert.equal(L.potProblem(settings, { faceit_elo: 3000, faceit_level: 10 }), null);
  assert.match(L.potProblem(settings, { faceit_elo: null, faceit_level: null }) ?? "", /без рейтинга FACEIT/);
  // нижней границы ELO нет: 900 — тир D, а он в этой игре не допущен; в игре с тиром D такой игрок проходит
  assert.match(L.potProblem(settings, { faceit_elo: 900, faceit_level: 3 }) ?? "", /тир D/);
  assert.equal(L.potProblem({ ...settings, pot_tiers: ["D"] }, { faceit_elo: 1, faceit_level: 1 }), null);
  assert.match(L.potProblem(settings, { faceit_elo: 1500, faceit_level: 7 }) ?? "", /тир D/);
  assert.match(L.potProblem(settings, { faceit_elo: 2100, faceit_level: 10 }) ?? "", /тир D/);
  assert.match(L.potProblem({ ...settings, pot_tiers: ["S"] }, { faceit_elo: 2900, faceit_level: 10 }) ?? "", /тир A/);
  assert.equal(L.potProblem({ ...settings, pot: false }, { faceit_elo: null, faceit_level: null }), null);
  ok("Entry: needs a tier the organizer allowed (no lower ELO bound); a plain lobby has no such rule");

  // ── комната: все десять в ожидании, отметки взносов у восьми
  const lobbyRow = await one<{ id: string }>(
    "insert into lobbies(code, host_id, visibility, invite_token, settings, team1_name, team2_name) values('POT001', $1, 'public', 'tok', $2::jsonb, 'Команда A', 'Команда B') returning id",
    [host.id, JSON.stringify({ ...settings, pot_paid: players.slice(0, 8).map((p) => p.id) })],
  );
  for (const p of players) await sql.query("insert into lobby_members(lobby_id, player_id, slot) values($1, $2, 'wait')", [lobbyRow.id, p.id]);
  let lobby = (await L.getLobby(lobbyRow.id))!;
  assert.equal(lobby.settings.pot, true);
  assert.equal(potBank(lobby.settings), 50000);
  assert.match(L.startProblem(lobby, await L.getMembers(lobby.id)) ?? "", /никого нет|5 на 5/);
  ok("Room: ten players wait, bank is 50 000, the match cannot start before the pick");

  // ── выбор: капитаны — двое с самым высоким ELO, первым выбирает тот, у кого ELO ниже
  const [high, low] = [players[0], players[1]];
  const fixed = Object.fromEntries(players.map((p) => [p.id, p.elo]));
  await L.startDraft(lobby, [low.id, high.id], { snake: true, settings: { ...lobby.settings, pot_elo: fixed }, teamNames: [`team_${low.nick}`, `team_${high.nick}`] });
  lobby = (await L.getLobby(lobby.id))!;
  assert.deepEqual(lobby.draft?.captains, [low.id, high.id]);
  assert.equal(lobby.draft?.turn, 1);
  assert.equal(lobby.draft?.snake, true);
  assert.equal(Object.keys(lobby.settings.pot_elo).length, 10);
  assert.equal(lobby.settings.pot_paid.length, 8, "paid marks survive the start of the pick");
  assert.equal(lobby.team1_name, "team_pot1");
  let members = await L.getMembers(lobby.id);
  assert.equal(members.filter((m) => m.slot === "wait").length, 8);
  ok("Pick starts: captains are the two highest ELO, the lower one picks first, ELO is fixed, paid marks kept");

  // восемь ходов змейкой: каждый раз берём сильнейшего из оставшихся
  const turns: number[] = [];
  for (let i = 0; i < 8; i++) {
    lobby = (await L.getLobby(lobby.id))!;
    assert.ok(lobby.draft, `draft is running at pick ${i + 1}`);
    assert.equal(lobby.draft.turn, snakeTurn(i), `turn at pick ${i + 1}`);
    turns.push(lobby.draft.turn);
    const pool = (await L.getMembers(lobby.id)).filter((m) => m.slot === "wait").sort((a, b) => fixed[b.player_id] - fixed[a.player_id]);
    // auto = true: без «забора хода» по draft->>deadline — мини-PostgREST тестов не умеет фильтр по полю jsonb
    assert.equal(await L.draftPick(lobby, pool[0].player_id, true), null);
  }
  assert.equal(turns.join(""), "12211221");
  lobby = (await L.getLobby(lobby.id))!;
  assert.equal(lobby.draft, null, "draft ends when both teams are full");
  members = await L.getMembers(lobby.id);
  const t1 = members.filter((m) => m.slot === "team1").map((m) => fixed[m.player_id]);
  const t2 = members.filter((m) => m.slot === "team2").map((m) => fixed[m.player_id]);
  assert.equal(t1.length, 5);
  assert.equal(t2.length, 5);
  const sum = (l: number[]) => l.reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum(t1) - sum(t2)) <= 200, `teams are balanced: ${sum(t1)} vs ${sum(t2)}`);
  ok(`Snake pick 1-2-2-1-1-2-2-1 fills both teams: ${sum(t1)} vs ${sum(t2)} ELO`);

  // ── капитаны после выбора — по ELO, а не по времени входа; матч можно начинать
  assert.deepEqual(L.captainsOf(lobby, members), [low.id, high.id]);
  assert.equal(L.startProblem(lobby, members), null);
  // организатор убрал игрока — неполной командой «Десятку» не начать
  await L.setSlot(lobby.id, players[9].id, "spec");
  assert.match(L.startProblem(lobby, await L.getMembers(lobby.id)) ?? "", /5 на 5|неравные/);
  const back = (await L.getMembers(lobby.id)).filter((m) => m.slot === "team1").length < 5 ? "team1" : "team2";
  await L.setSlot(lobby.id, players[9].id, back);
  ok("After the pick the captains are the top ELO of each team; an incomplete team cannot start");

  // ── игра: вето BO3 ведут капитаны, остаются три карты
  let game = await L.createGame(lobby);
  assert.equal(game.status, "veto");
  assert.equal(game.best_of, 3);
  assert.equal(game.team1.players[0].id, low.id, "captain goes first in the roster — he acts in the veto");
  assert.equal(game.team2.players[0].id, high.id);
  assert.equal(game.team1.players.length + game.team2.players.length, 10);
  for (let i = 0; i < 12 && game.status === "veto"; i++) {
    const st = L.lobbyVetoState(game);
    assert.equal(await L.lobbyVetoAct(game, st.remaining[0], false), null);
    game = (await L.getGame(game.id))!;
  }
  assert.equal(game.status, "waiting");
  assert.equal(game.maps.length, 3);
  const config = await L.buildLobbyConfig(game.id, []);
  assert.equal(config?.num_maps, 3);
  assert.equal(Object.keys(config!.team1.players).length, 5);
  assert.equal(config?.players_per_team, 5);
  assert.equal(config?.cvars.bot_quota, 0);
  ok("Game: BO3 veto by the captains leaves three maps; server config has 5 vs 5 Steam IDs and no bots");

  // ── итог: 2:0 — банк победителям, отметки и зафиксированное ELO сбрасываются, лобби остаётся
  await sql.query("update lobby_games set status = 'live', team1_score = 2, team2_score = 0, winner = 1 where id = $1", [game.id]);
  await L.finishGame(game.id);
  lobby = (await L.getLobby(lobby.id))!;
  assert.equal(lobby.status, "waiting");
  assert.equal(lobby.settings.pot, true);
  assert.deepEqual(lobby.settings.pot_paid, []);
  assert.deepEqual(lobby.settings.pot_elo, {});
  const last = await one<{ body: string }>("select body from lobby_messages where lobby_id = $1 order by id desc limit 1", [lobby.id]);
  assert.match(last.body, /«Десятка» сыграна: team_pot1 2:0 team_pot0/);
  assert.match(last.body, /Банк 50.000 тг — команде team_pot1/);
  ok("Result: the chat names the winner and the 50 000 bank; paid marks and fixed ELO reset for the next game");

  console.log(`\n${checks} pot checks passed`);
} finally {
  await sql.close();
}
