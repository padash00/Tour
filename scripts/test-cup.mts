// Лобби на 20–40 игроков целиком на PGlite: капитаны и змейка на несколько команд, сетка и круговая,
// комнаты матчей, продвижение победителей, отмена и перезапуск матча, остановка всех матчей.
// supabase-js сайта ходит в мини-PostgREST (scripts/lib/pg-rest.mjs). Не читает .env и не ходит в сеть.
import assert from "node:assert/strict";
import { createPgRest } from "./lib/pg-rest.mjs";
import { migratedDatabase } from "./lib/test-db.mjs";

const sql = await migratedDatabase();
globalThis.fetch = createPgRest(sql) as typeof fetch;

const L = await import("../src/lib/lobby");
const C = await import("../src/lib/cup");
const core = await import("../src/lib/cup-core");
const { normalizeSettings, DEFAULT_SETTINGS, POT_MAPS, potBank, playersNeeded } = await import("../src/lib/lobby-settings");

let checks = 0;
const ok = (name: string) => (checks++, console.log(`✓ ${name}`));
const one = async <T,>(query: string, params: unknown[] = []) => (await sql.query<T>(query, params)).rows[0];
type Cup = import("../src/lib/cup-core").Cup;

async function makePlayers(n: number, tag: string) {
  const out: { id: string; nick: string; elo: number }[] = [];
  for (let i = 0; i < n; i++) {
    const elo = 3200 - i * 25;
    const row = await one<{ id: string }>("insert into players(steam_id, nickname, faceit_elo, faceit_level) values($1, $2, $3, 10) returning id", [
      `7656119${tag}${String(i).padStart(8, "0")}`,
      `${tag}p${i}`,
      elo,
    ]);
    out.push({ id: row.id, nick: `${tag}p${i}`, elo });
  }
  return out;
}

async function makeLobby(code: string, players: { id: string }[], settings: unknown) {
  const row = await one<{ id: string }>(
    "insert into lobbies(code, host_id, visibility, invite_token, settings) values($1, $2, 'public', 'tok', $3::jsonb) returning id",
    [code, players[0].id, JSON.stringify(settings)],
  );
  for (const p of players) await sql.query("insert into lobby_members(lobby_id, player_id, slot) values($1, $2, 'wait')", [row.id, p.id]);
  return row.id;
}

/** Капитаны по ELO, первым выбирает слабейший; каждый ход — сильнейший из оставшихся */
async function draft(lobbyId: string, players: { id: string; nick: string; elo: number }[], teams: number) {
  const elo = Object.fromEntries(players.map((p) => [p.id, p.elo]));
  let lobby = (await L.getLobby(lobbyId))!;
  const caps = players.slice(0, teams).reverse();
  await L.startDraft(lobby, caps.map((c) => c.id), { snake: true, teamNames: caps.map((c) => `team_${c.nick}`) });
  const turns: number[] = [];
  for (let i = 0; i < players.length - teams; i++) {
    lobby = (await L.getLobby(lobbyId))!;
    assert.ok(lobby.draft, `draft runs at pick ${i + 1}`);
    turns.push(lobby.draft.turn);
    const pool = (await L.getMembers(lobbyId)).filter((m) => m.slot === "wait").sort((a, b) => elo[b.player_id] - elo[a.player_id]);
    assert.equal(await L.draftPick(lobby, pool[0].player_id, true), null);
  }
  return { turns, caps };
}

/** Доигрывает игру в комнате матча: бан-пик, счёт, итог */
async function play(roomCode: string, winner: 1 | 2, score: [number, number]) {
  const room = (await L.getLobbyByCode(roomCode))!;
  assert.equal(room.status, "playing", `room ${roomCode} is playing`);
  let game = (await L.getGame(room.current_game_id!))!;
  for (let i = 0; i < 12 && game.status === "veto"; i++) {
    assert.equal(await L.lobbyVetoAct(game, L.lobbyVetoState(game).remaining[0], false), null);
    game = (await L.getGame(game.id))!;
  }
  assert.equal(game.status, "waiting");
  await sql.query("update lobby_games set status = 'live', team1_score = $2, team2_score = $3, winner = $4 where id = $1", [game.id, score[0], score[1], winner]);
  await L.finishGame(game.id);
  return game;
}

const cupNow = async (id: string) => C.cupOf((await L.getLobby(id))!) as Cup;
const room = (cup: Cup, id: string) => cup.matches.find((m) => m.id === id)!;

try {
  // ── правила
  assert.equal(core.cupTeams(20), 4);
  assert.equal(core.cupTeams(40), 8);
  assert.equal(core.cupTeams(10), 0);
  assert.equal(core.cupTeams(25), 0);
  const s20 = normalizeSettings({ ...DEFAULT_SETTINGS, players: 20, cup_format: "round", mode: "2v2", team_size: 2, player_pick: "free", allow_join_team: true, rematch: true, map_choice: "veto", maps: POT_MAPS, best_of: 3 });
  assert.equal(s20.team_size, 5);
  assert.equal(s20.player_pick, "captains");
  assert.equal(s20.rematch, false);
  assert.equal(playersNeeded(s20), 20);
  assert.equal(normalizeSettings({ ...s20, players: 30 }).cup_format, "round", "round robin for any number of teams");
  assert.equal(s20.best_of, 1, "round robin is always BO1");
  assert.equal(normalizeSettings({ ...s20, cup_format: "bracket", best_of: 3 }).best_of, 3);
  assert.equal(core.buildCup("round", Array(6).fill("x"), []).matches.length, 15);
  for (const teams of [4, 6, 8]) {
    // круговая без ожидания туров: освободившиеся команды сразу играют друг с другом, если ещё не встречались
    let c = core.buildCup("round", Array(teams).fill("x"), []);
    const playing = () => c.matches.filter((m) => m.state === "playing");
    const launch = () => {
      const ready = core.readyMatches(c);
      c = { ...c, matches: c.matches.map((m) => (ready.some((r) => r.id === m.id) ? { ...m, state: "playing" as const, code: m.id } : m)) };
      const seen = playing().flatMap((m) => [m.a, m.b]);
      assert.equal(new Set(seen).size, seen.length, "a team never plays two matches at once");
      return ready.length;
    };
    assert.equal(launch(), teams / 2, "everyone plays from the start");
    let early = 0;
    for (let step = 0; c.state !== "done"; step++) {
      assert.ok(step < 100 && playing().length > 0, "the cup never stalls");
      // матчи заканчиваются по одному, каждый раз — самый давний
      const m = playing()[0];
      c = core.recordResult(c, m.id, 1, [1, 0], [13, 7]);
      if (c.state === "done") break;
      const before = playing().length;
      if (launch() > 0 && before > 0) early++;
    }
    assert.ok(c.matches.every((m) => m.state === "done"));
    if (teams > 4) assert.ok(early > 0, "new matches start while other matches are still going");
    assert.ok(core.standings(c).every((r) => r.played === teams - 1));
  }
  {
    // равные очки: решает разница раундов
    let c = core.buildCup("round", ["a", "b", "c"], []);
    const win = (w: number, l: number, rw: number, rl: number) => {
      const m = c.matches.find((q) => (q.a === w && q.b === l) || (q.a === l && q.b === w))!;
      c = core.recordResult(c, m.id, m.a === w ? 1 : 2, m.a === w ? [1, 0] : [0, 1], m.a === w ? [rw, rl] : [rl, rw]);
    };
    win(0, 1, 13, 11);
    win(1, 2, 13, 2);
    win(2, 0, 13, 9);
    assert.deepEqual(core.standings(c).map((r) => r.team), [1, 0, 2], "one win each: +9, -2, -7 by rounds");
    // круг сыгран — чемпиона ещё нет: первое и второе место играют финал
    const final = c.matches.find((m) => m.final)!;
    assert.ok(c.state === "playing" && c.champion === null && final.state === "pending", "the final is opened after the round robin");
    assert.deepEqual([final.a, final.b], [1, 0], "the final: first place against second place");
    assert.equal(core.roundTitle(c, final.round), "Финал");
    assert.deepEqual(core.readyMatches(c).map((m) => m.id), [final.id]);
    c = core.recordResult(c, final.id, 2, [1, 2], [30, 34]);
    assert.ok(c.state === "done" && c.champion === 0, "the champion is the winner of the final");
    assert.deepEqual(core.placements(c).map((r) => r.team), [0, 1, 2], "the final decides first place");
    assert.deepEqual(core.standings(c).map((r) => [r.played, r.points]), [[2, 3], [2, 3], [2, 3]], "the final does not count in the table: a win is 3 points");
    // равны и очки, и разница раундов у двух команд — выше победитель личной встречи
    c = core.buildCup("round", ["a", "b", "c", "d"], []);
    win(1, 0, 13, 10);
    win(0, 2, 13, 10);
    win(0, 3, 13, 10);
    win(1, 2, 13, 10);
    win(3, 1, 13, 10);
    win(2, 3, 13, 10);
    assert.deepEqual(core.standings(c).slice(0, 2).map((r) => r.team), [1, 0], "a and b: two wins, +3 each; b beat a");
  }
  assert.equal(normalizeSettings({ ...s20, players: 15 }).players, 0);
  assert.equal(potBank(normalizeSettings({ ...s20, pot: true, pot_fee: 5000 })), 100000);
  assert.equal([0, 1, 2, 3, 4, 5, 6, 7].map((n) => core.snakeTurnN(n, 4)).join(""), "12344321");
  assert.equal(core.buildCup("bracket", Array(6).fill("x"), []).matches.length, 5, "six teams: two first-round matches, two semis, final");
  assert.equal(core.buildCup("bracket", Array(8).fill("x"), []).matches.length, 7);
  assert.equal(core.buildCup("round", Array(4).fill("x"), []).matches.length, 6);
  ok("Rules: 20/30/40 players make 4/6/8 teams of five, captains pick, bank counts every player, round robin is BO1 for any number of teams");

  // ── 20 игроков, сетка
  const p20 = await makePlayers(20, "a");
  const bracketId = await makeLobby("CUP020", p20, normalizeSettings({ ...s20, cup_format: "bracket", best_of: 3 }));
  let lobby = (await L.getLobby(bracketId))!;
  assert.match(C.cupStartProblem(lobby, await L.getMembers(bracketId)) ?? "", /Не все команды собраны/);
  assert.match(L.startProblem(lobby, await L.getMembers(bracketId)) ?? "", /несколько команд/);
  const d = await draft(bracketId, p20, 4);
  assert.equal(d.turns.slice(0, 8).join(""), "12344321");
  lobby = (await L.getLobby(bracketId))!;
  assert.equal(lobby.draft, null);
  const members = await L.getMembers(bracketId);
  const sums = ["team1", "team2", "team3", "team4"].map((slot) => members.filter((m) => m.slot === slot).reduce((a, m) => a + p20.find((p) => p.id === m.player_id)!.elo, 0));
  assert.ok(members.filter((m) => m.slot === "wait").length === 0 && sums.every((x) => x > 0));
  assert.ok(Math.max(...sums) - Math.min(...sums) <= 150, `teams are balanced: ${sums.join(" / ")}`);
  assert.deepEqual(L.captainsOf(lobby, members), d.caps.map((c) => c.id));
  assert.equal(C.cupStartProblem(lobby, members), null);
  ok(`Pick for four teams: snake 1-2-3-4-4-3-2-1, every team gets five, ELO sums ${sums.join(" / ")}`);

  assert.equal(await C.startCup(lobby), null);
  assert.equal(await C.startCup((await L.getLobby(bracketId))!), "Матчи уже идут");
  let cup = await cupNow(bracketId);
  assert.equal(cup.matches.length, 3);
  assert.equal(cup.names[0], `team_${d.caps[0].nick}`);
  assert.deepEqual(cup.rosters.map((r) => r[0]), d.caps.map((c) => c.id), "captain goes first in the roster");
  const semi1 = room(cup, "r1m1");
  const semi2 = room(cup, "r1m2");
  assert.ok(semi1.code && semi2.code && semi1.state === "playing");
  assert.equal(room(cup, "r2m1").code, null, "final waits for both semifinals");
  const r1 = (await L.getLobbyByCode(semi1.code!))!;
  assert.equal(r1.visibility, "private");
  assert.deepEqual(r1.settings.cup_of, { code: "CUP020", match: "r1m1" });
  assert.equal(r1.settings.players, 0);
  assert.equal(r1.team1_name, cup.names[semi1.a!]);
  const g1 = (await L.getGame(r1.current_game_id!))!;
  assert.equal(g1.team1.players.length + g1.team2.players.length, 10);
  assert.equal(g1.team1.players[0].id, cup.rosters[semi1.a!][0], "captain leads the veto in the match room");
  assert.equal(g1.best_of, 3);
  assert.equal((await L.getLobby(bracketId))!.status, "playing");
  assert.equal(C.myCupRoom(cup, cup.rosters[semi1.a!][2]), semi1.code);
  assert.equal((await L.playerLobby(cup.rosters[semi1.a!][2]))?.code, semi1.code, "a player is led to the room of the match he plays now");
  ok("Start: two semifinal rooms open as private two-team lobbies with fixed rosters; the final waits");

  // ── полуфиналы → финал → чемпион
  await play(semi1.code!, 1, [2, 0]);
  cup = await cupNow(bracketId);
  assert.equal(room(cup, "r1m1").state, "done");
  assert.equal(room(cup, "r1m1").winner, semi1.a);
  assert.equal((await L.getLobbyByCode(semi1.code!))!.status, "closed", "match room closes after the game");
  assert.equal(room(cup, "r2m1").code, null);
  await play(semi2.code!, 2, [1, 2]);
  cup = await cupNow(bracketId);
  const final = room(cup, "r2m1");
  assert.deepEqual([final.a, final.b], [semi1.a, semi2.b]);
  assert.ok(final.code && final.state === "playing", "final room opens when both semifinals are done");
  await play(final.code!, 2, [0, 2]);
  cup = await cupNow(bracketId);
  assert.equal(cup.state, "done");
  assert.equal(cup.champion, semi2.b);
  lobby = (await L.getLobby(bracketId))!;
  assert.equal(lobby.status, "waiting", "the lobby gathers again after the final");
  const last = await one<{ body: string }>("select body from lobby_messages where lobby_id = $1 order by id desc limit 1", [bracketId]);
  assert.match(last.body, new RegExp(`Победитель — ${cup.names[semi2.b!]}`));
  ok("Bracket: winners advance, the final opens after both semifinals, the champion is announced, the lobby is open again");

  // ── отмена матча и перезапуск; остановка всех матчей
  assert.equal(await C.startCup(lobby), null, "same rosters can start again");
  cup = await cupNow(bracketId);
  assert.equal(cup.names[0], `team_${d.caps[0].nick}`, "team names survive a restart");
  const again = room(cup, "r1m1");
  const againRoom = (await L.getLobbyByCode(again.code!))!;
  await L.cancelGame((await L.getGame(againRoom.current_game_id!))!, "сервер не поднялся");
  cup = await cupNow(bracketId);
  assert.equal(room(cup, "r1m1").state, "cancelled");
  assert.equal((await L.getLobbyByCode(again.code!))!.status, "closed");
  assert.equal(await C.restartCupMatch((await L.getLobby(bracketId))!, "r1m2"), "Этот матч не отменён");
  assert.equal(await C.restartCupMatch((await L.getLobby(bracketId))!, "r1m1"), null);
  cup = await cupNow(bracketId);
  assert.ok(room(cup, "r1m1").state === "playing" && room(cup, "r1m1").code !== again.code, "a new room for the restarted match");
  const openRooms = cup.matches.filter((m) => m.code).map((m) => m.code!);
  assert.equal(await C.cancelCup((await L.getLobby(bracketId))!, "организатор"), null);
  lobby = (await L.getLobby(bracketId))!;
  assert.equal(lobby.status, "waiting");
  for (const code of openRooms) assert.equal((await L.getLobbyByCode(code))!.status, "closed");
  const active = await one<{ n: number }>("select count(*)::int as n from lobby_games where status in ('veto', 'waiting', 'live')");
  assert.equal(active.n, 0, "no game is left running");
  assert.equal((await L.getMembers(bracketId)).filter((m) => m.slot === "team1").length, 5, "rosters stay after a stop");
  ok("A cancelled match is restarted in a new room; stopping closes every room, cancels games and keeps the rosters");

  // ── 20 игроков, круговая
  const p20r = await makePlayers(20, "b");
  const roundId = await makeLobby("CUP02R", p20r, s20);
  await draft(roundId, p20r, 4);
  assert.equal(await C.startCup((await L.getLobby(roundId))!), null);
  cup = await cupNow(roundId);
  assert.equal(cup.matches.length, 6);
  assert.equal(cup.matches.filter((m) => m.code).length, 2, "two matches at the start: a team plays one match at a time");
  // побеждает команда с меньшим номером: 3, 2, 1 и 0 побед
  for (let round = 1; round <= 3; round++) {
    cup = await cupNow(roundId);
    const open = cup.matches.filter((m) => m.round === round);
    assert.ok(open.every((m) => m.code && m.state === "playing"), `round ${round} is open`);
    for (const m of open) {
      const side = m.a === 0 ? 1 : m.b === 0 ? 2 : m.a! < m.b! ? 2 : 1;
      await play(m.code!, side, side === 1 ? [2, 1] : [1, 2]);
    }
  }
  cup = await cupNow(roundId);
  // круг сыгран: первое и второе место (3 и 2 победы) играют финал BO3 в своей комнате
  const rrFinal = cup.matches.find((m) => m.final)!;
  assert.ok(cup.state === "playing" && rrFinal.state === "playing" && rrFinal.code, "the final room is open");
  assert.deepEqual([rrFinal.a, rrFinal.b], [0, 3], "first place (3 wins) against second place (2 wins)");
  assert.equal((await L.getLobbyByCode(rrFinal.code!))!.settings.best_of, 3, "the final is BO3");
  await play(rrFinal.code!, 1, [2, 1]);
  cup = await cupNow(roundId);
  assert.equal(cup.state, "done");
  assert.equal(cup.champion, 0);
  const table = core.standings(cup);
  assert.deepEqual(table.map((r) => r.wins), [3, 2, 1, 0]);
  assert.ok(table.every((r) => r.played === 3));
  ok("Round robin: three rounds of two matches, the table counts wins and maps, the team with three wins is the champion");

  // ── 30 игроков: две сильнейшие команды проходят первый круг без игры
  const p30 = await makePlayers(30, "c");
  const sixId = await makeLobby("CUP030", p30, normalizeSettings({ ...s20, players: 30, cup_format: "bracket" }));
  const d6 = await draft(sixId, p30, 6);
  assert.equal(d6.turns.slice(0, 12).join(""), "123456654321");
  assert.equal(await C.startCup((await L.getLobby(sixId))!), null);
  cup = await cupNow(sixId);
  assert.equal(cup.matches.length, 5);
  assert.deepEqual(cup.matches.filter((m) => m.code).map((m) => m.id), ["r1m1", "r1m2"]);
  assert.deepEqual([room(cup, "r2m1").a, room(cup, "r2m2").a], [0, 1], "teams 1 and 2 wait in the semifinals");
  await play(room(cup, "r1m1").code!, 1, [2, 0]);
  cup = await cupNow(sixId);
  assert.ok(room(cup, "r2m1").code, "semifinal opens as soon as its opponent is known");
  assert.equal(room(cup, "r2m2").code, null);
  ok("Six teams: two first-round matches, two teams wait in the semifinals, each semifinal opens when its pair is known");

  // ── выбывшая команда: лобби её больше не держит, остальных держит
  const lost = room(cup, "r1m1").b!;
  const loser = cup.rosters[lost][1];
  assert.equal(core.teamOut(cup, lost), true);
  assert.equal(core.teamOut(cup, room(cup, "r1m1").a!), false, "the winner plays on");
  assert.equal(core.teamOut(cup, room(cup, "r1m2").a!), false, "a team that has not played yet is not out");
  assert.equal(core.teamOut(cup, 0), false, "a team waiting in the semifinal is not out");
  const held = await L.playerLobby(loser);
  assert.deepEqual([held?.code, held?.released], ["CUP030", true], "a knocked-out player is still shown his lobby, but is free to open another");
  assert.equal((await L.playerLobby(cup.rosters[room(cup, "r1m2").a!][1]))?.released, false, "a player of a live match is held");
  assert.equal((await L.playerLobby(cup.rosters[1][1]))?.released, false, "a player waiting for the semifinal is held");
  await L.leaveReleased(sixId, { id: loser, nickname: "loser" });
  assert.equal(await L.playerLobby(loser), null);
  const after = await cupNow(sixId);
  assert.deepEqual(after.rosters, cup.rosters, "the bracket keeps the roster of the team that left");
  assert.equal((await L.getLobby(sixId))!.status, "playing");
  await play(room(after, "r1m2").code!, 2, [0, 2]);
  assert.ok(room(await cupNow(sixId), "r2m2").code, "the cup goes on after a knocked-out player left");
  // круговая: до конца никто не выбывает
  assert.equal(core.teamOut({ ...cup, format: "round" }, lost), false);
  ok("Knocked-out team: its players may leave or open another lobby, everyone else is held, the cup goes on");

  console.log(`\n${checks} cup checks passed`);
} finally {
  await sql.close();
}
