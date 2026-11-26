// Чистые части агента без CS2 и без сайта:
//   RCON: разбор пакетов, пустой пакет до авторизации, маркер конца длинного ответа, тайм-аут — ошибка;
//   подсчёт игроков состава по status_json / status;
//   журнал команд: одна неудачная доставка не держит остальные, отказ 4xx откладывается;
//   самообновление: проверка бандла до установки, prev/ и откат.
// Запуск: node scripts/test-agent-units.mjs
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { onlineRosterCount, rosterIds } from "../server/agent/autostart.mjs";
import { installBundle, localBundleVersion, missingImports, rejectedBundleVersion, rollbackBundle } from "../server/agent/bundle.mjs";
import { createRecorder, demoFileName } from "../server/agent/recorder.mjs";
process.env.F16_STATE_POLL_MS = "5";
const { createRecovery, latestMatchBackup, seriesBackup } = await import("../server/agent/recovery.mjs");
import { CommandJournal } from "../server/agent/command-journal.mjs";
import { createEnforce } from "../server/agent/enforce.mjs";
import { createTechPause } from "../server/agent/techpause.mjs";
import { encodePacket, parseGet5, rcon, rconSession, steamIdsFromStatus, takePackets } from "../server/agent/lib.mjs";

let checks = 0;
const test = async (name, work) => {
  await work();
  checks++;
  console.log(`✓ ${name}`);
};
const dir = mkdtempSync(path.join(os.tmpdir(), "f16-agent-units-"));

/**
 * Поддельный RCON-сервер. flavor "cs2" — как настоящий CS2 (проверено 10/2026): пустого пакета перед ответом
 * на авторизацию нет, ответы помечены id последнего прочитанного пакета (то есть id маркера), на маркер —
 * только 00 01 00 00. flavor "srcds" — по документации Valve: пустой пакет до авторизации, ответ с id команды,
 * на маркер — пустой пакет и 00 01 00 00. echo: false — сервер, не отвечающий на маркер.
 */
function fakeRcon({ password = "pw", flavor = "cs2", echo = true, reply = () => ["ok"], silent = false }) {
  const server = net.createServer((sock) => {
    let buf = Buffer.alloc(0);
    let lastId = 0;
    const pending = [];
    let busy = false;
    const pump = async () => {
      if (busy) return;
      busy = true;
      while (pending.length) {
        const p = pending.shift();
        const id = flavor === "cs2" ? lastId : p.id;
        if (p.type === 3) {
          if (flavor === "srcds") sock.write(encodePacket(p.id, 0, ""));
          sock.write(encodePacket(p.body === password ? p.id : -1, 2, ""));
        } else if (p.type === 2) {
          if (silent) continue;
          // ответ разбит на несколько пакетов и TCP-кусков, между ними пауза больше старого «окна тишины»
          for (const part of reply(p.body)) {
            const pkt = encodePacket(id, 0, part);
            sock.write(pkt.subarray(0, 5));
            await new Promise((r) => setTimeout(r, 20));
            sock.write(pkt.subarray(5));
            await new Promise((r) => setTimeout(r, 400));
          }
        } else if (p.type === 0 && echo) {
          if (flavor === "srcds") sock.write(encodePacket(id, 0, ""));
          sock.write(encodePacket(id, 0, "\u0000\u0001\u0000\u0000"));
        }
      }
      busy = false;
    };
    sock.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      const { packets, rest } = takePackets(buf);
      buf = rest;
      for (const p of packets) {
        lastId = p.id;
        pending.push(p);
      }
      pump();
    });
  });
  return new Promise((r) => server.listen(0, "127.0.0.1", () => r({ server, port: server.address().port })));
}

try {
  await test("RCON packets: split chunks are reassembled, garbage length is rejected", async () => {
    const a = encodePacket(7, 0, "hello");
    const b = encodePacket(8, 0, "world");
    const all = Buffer.concat([a, b]);
    const first = takePackets(all.subarray(0, a.length + 3));
    assert.deepEqual(first.packets.map((p) => p.body), ["hello"]);
    const second = takePackets(Buffer.concat([first.rest, all.subarray(a.length + 3)]));
    assert.deepEqual(second.packets.map((p) => [p.id, p.body]), [[8, "world"]]);
    assert.equal(second.rest.length, 0);
    const bad = Buffer.alloc(12);
    bad.writeInt32LE(3, 0);
    assert.throws(() => takePackets(bad), /битый пакет/);
  });

  await test("RCON session ignores the pre-auth empty packet and ends on the marker reply, whatever its id", async () => {
    const s = rconSession("pw", "status", { auth: 1, cmd: 2, end: 3 });
    assert.equal(s.feed({ id: 1, type: 0, body: "" }), null); // пустой пакет до ответа на авторизацию
    const sent = s.feed({ id: 1, type: 2, body: "" });
    const packets = takePackets(sent.send).packets;
    assert.deepEqual(packets.map((p) => [p.id, p.type, p.body]), [[2, 2, "status"], [3, 0, ""]]);
    assert.equal(s.feed({ id: 3, type: 0, body: "part1 " }), null); // CS2: вывод команды приходит с id маркера
    assert.equal(s.feed({ id: 2, type: 0, body: "part2" }), null);
    assert.equal(s.feed({ id: 3, type: 0, body: "" }), null); // SRCDS: пустое эхо маркера
    assert.deepEqual(s.feed({ id: 3, type: 0, body: "\u0000\u0001\u0000\u0000" }), { done: "part1 part2" });
    assert.match(rconSession("bad", "x").feed({ id: -1, type: 2, body: "" }).error.message, /auth failed/);
  });

  await test("RCON over TCP: multi-packet reply is complete; no reply → error instead of empty string", async () => {
    for (const flavor of ["cs2", "srcds"]) {
      const long = await fakeRcon({ flavor, reply: () => ["{\"gamestate\":", "\"live\",", "\"matchid\":7}"] });
      const out = await rcon(long.port, "pw", "get5_status", { timeoutMs: 5000 });
      assert.equal(out, '{"gamestate":"live","matchid":7}', flavor);
      assert.equal(parseGet5(`L 00:00 junk ${out}`).matchid, 7);
      long.server.close();
      // команда без вывода — пустая строка (сервер ответил), а не ошибка
      const empty = await fakeRcon({ flavor, reply: () => [] });
      assert.equal(await rcon(empty.port, "pw", "sv_alltalk 0", { timeoutMs: 2000 }), "");
      empty.server.close();
    }

    const silent = await fakeRcon({ silent: true, echo: false });
    await assert.rejects(rcon(silent.port, "pw", "status", { timeoutMs: 600 }), /timeout/);
    silent.server.close();

    const wrong = await fakeRcon({ password: "other" });
    await assert.rejects(rcon(wrong.port, "pw", "status", { timeoutMs: 2000 }), /auth failed/);
    wrong.server.close();

    // сервер без эха маркера: ответ всё равно забираем после тишины, а не теряем
    const noEcho = await fakeRcon({ echo: false, reply: () => ["a", "b"] });
    assert.equal(await rcon(noEcho.port, "pw", "x", { timeoutMs: 5000, idleMs: 600 }), "ab");
    noEcho.server.close();
  });

  await test("Roster count uses SteamIDs of the match roster, not A2S (GOTV, spectating admins)", async () => {
    const cfg = {
      team1: { players: { "76561198000000001": "a", "76561198000000002": "b" } },
      team2: { players: { "76561198000000003": "c", "76561198000000004": "d" } },
    };
    assert.equal(rosterIds(cfg).length, 4);
    // форма ответа status_json настоящего CS2: клиенты в server.clients, у GOTV и самого сервера SteamID другого типа
    const statusJson = JSON.stringify({
      frametime_ms: 16.09,
      server: {
        clients_bot: 1,
        clients_human: 3,
        clients: [
          { steamid64: "90071996842377216", steamid: "[A:1:0:1]", bot: true, name: "SourceTV" },
          { steamid64: "76561198000000001", steamid: "[U:1:39734273]", bot: false, name: "a" },
          { steamid64: "76561198000000003", steamid: "[U:1:39734275]", bot: false, name: "c" },
          { steamid64: "76561198099999999", steamid: "[U:1:139734271]", bot: false, name: "admin spectator" },
        ],
        steamid64: "90294252221455363",
        steamid: "[A:1:3706412035:51748]",
      },
    }, null, "\t");
    assert.deepEqual(onlineRosterCount({ cfg, statusJson, status: null, a2sPlayers: 4 }), { count: 2, source: "status_json" });
    // status_json без игроков — ему верим (0), а не A2S, где GOTV и зрители
    const nobody = JSON.stringify({ server: { clients: [{ steamid64: "90071996842377216", bot: true, name: "SourceTV" }] } });
    assert.deepEqual(onlineRosterCount({ cfg, statusJson: nobody, status: null, a2sPlayers: 3 }), { count: 0, source: "status_json" });
    // классический status: SteamID3 и STEAM_X
    const status = [
      "---------players--------",
      "  id     time ping loss      state   rate adr name",
      "     2 00:12  20  0 active 786432 10.0.0.2:27005 'b' [U:1:39734274]",
      "# 3 \"d\" STEAM_1:0:19867138 01:00 20 0 active",
    ].join("\n");
    assert.ok(steamIdsFromStatus(status).has("76561198000000002"));
    assert.ok(steamIdsFromStatus(status).has("76561198000000004"));
    assert.deepEqual(onlineRosterCount({ cfg, statusJson: null, status, a2sPlayers: 9 }), { count: 2, source: "status" });
    // ни в одном ответе нет SteamID (неизвестный формат) — как раньше, A2S минус GOTV
    assert.deepEqual(onlineRosterCount({ cfg, statusJson: null, status: "Unknown command", a2sPlayers: 5 }), { count: 4, source: "a2s" });
  });

  await test("Command journal delivers every result past a failure and parks permanent 4xx rejections", async () => {
    const journal = new CommandJournal(path.join(dir, "journal.json"));
    journal.accept([{ id: "a" }, { id: "b" }, { id: "c" }]);
    for (const id of ["a", "b", "c"]) {
      journal.begin(id);
      journal.complete(id, { ok: true, result: id });
    }
    assert.equal(journal.inFlight, 0);
    const sent = [];
    await assert.rejects(
      journal.flush(async (r) => {
        if (r.id === "a") throw Object.assign(new Error("offline"), { status: 503 });
        if (r.id === "b") throw Object.assign(new Error("command not sent"), { status: 409 });
        sent.push(r.id);
      }),
      /offline/,
    );
    assert.deepEqual(sent, ["c"]); // a (временная ошибка) не задержала c
    assert.equal(journal.pendingResults, 1); // b отложен навсегда, a ждёт повтора
    const again = await journal.flush(async (r) => sent.push(r.id));
    assert.deepEqual(again, { sent: 1, parked: 0, failed: 0 });
    assert.equal(journal.pendingResults, 0);
    journal.accept([{ id: "d" }]);
    assert.equal(journal.inFlight, 1);
  });

  await test("Bundle: syntax or missing module rejects the version; good bundle keeps prev/; rollback restores it", async () => {
    const f16 = path.join(dir, "f16");
    const serverDir = path.join(dir, "srv");
    mkdirSync(path.join(f16, "agent"), { recursive: true });
    writeFileSync(path.join(f16, "agent", "agent.mjs"), "// v1\n");
    writeFileSync(path.join(f16, "start.ps1"), "v1");
    writeFileSync(path.join(f16, "bundle-version.txt"), "v1");
    const files = (agentSrc) => [
      { path: "agent/agent.mjs", content: agentSrc },
      { path: "agent/lib.mjs", content: "export const x = 1;\n" },
      { path: "start.ps1", content: "v2" },
      { path: "cfg/f16/instance.cfg", content: "sv_cheats 0" },
    ];
    assert.deepEqual(missingImports('import { x } from "./lib.mjs";\nimport y from "./gone.mjs";', "agent/agent.mjs", new Set(["agent/lib.mjs"])), ["./gone.mjs"]);

    const broken = await installBundle({ f16Dir: f16, serverDir, version: "v2bad", files: files("import { x } from './lib.mjs';\nconst = 1;\n") });
    assert.ok(broken.rejected?.some((p) => p.startsWith("agent/agent.mjs")));
    assert.equal(rejectedBundleVersion(f16).version, "v2bad");
    assert.equal(readFileSync(path.join(f16, "agent", "agent.mjs"), "utf8"), "// v1\n"); // ничего не тронуто
    const missing = await installBundle({ f16Dir: f16, serverDir, version: "v2miss", files: files("import { z } from './nope.mjs';\n") });
    assert.ok(missing.rejected?.some((p) => /nope\.mjs/.test(p)));

    const good = await installBundle({ f16Dir: f16, serverDir, version: "v2", files: files("import { x } from './lib.mjs';\nconsole.log(x);\n") });
    assert.equal(good.version, "v2");
    assert.equal(localBundleVersion(f16), "v2");
    assert.match(readFileSync(path.join(f16, "agent", "agent.mjs"), "utf8"), /lib\.mjs/);
    assert.equal(readFileSync(path.join(f16, "prev", "agent", "agent.mjs"), "utf8"), "// v1\n");
    assert.equal(readFileSync(path.join(serverDir, "game", "csgo", "cfg", "f16", "instance.cfg"), "utf8"), "sv_cheats 0");
    assert.equal(existsSync(path.join(f16, "bundle-staging")), false);

    const back = await rollbackBundle({ f16Dir: f16, serverDir, reason: "test" });
    assert.deepEqual(back, { from: "v2", to: "v1" });
    assert.equal(readFileSync(path.join(f16, "agent", "agent.mjs"), "utf8"), "// v1\n");
    assert.equal(readFileSync(path.join(f16, "start.ps1"), "utf8"), "v1");
    assert.equal(localBundleVersion(f16), "v1");
    assert.equal(rejectedBundleVersion(f16).version, "v2"); // агент не скачает её снова
    assert.equal(await rollbackBundle({ f16Dir: f16, serverDir }), null); // второй откат не нужен
  });
  await test("техпауза: банк 2 минуты на команду на карту, остаток переносится, по нулю пауза снимается", async () => {
    const stateDir = path.join(dir, "techpause");
    mkdirSync(stateDir, { recursive: true });
    const inst = { name: "CS2-01", port: 1 };
    const sent = [];
    let t = 1_000_000;
    const make = () => createTechPause({ stateDir, rc: async (_i, c) => (sent.push(c), ""), log: () => {}, now: () => t, find: (m, token) => (Number(m) === 5 && (token === undefined || token === "tok") ? inst : null), teamName: (_i, team) => (team === "team1" ? "Альфа" : "Бета") });
    let tp = make();
    const ev = (event, extra = {}) => tp.onMatchzyEvent({ event, matchid: 5, map_number: 0, ...extra }, "tok");
    const said = () => sent.filter((c) => c.startsWith("css_asay")).join(" | ");
    await ev("going_live");
    assert.ok(sent.some((c) => /matchzy_max_tech_pauses 0/.test(c)));
    // чужой токен — событие не наше
    await tp.onMatchzyEvent({ event: "game_paused", matchid: 5, map_number: 0, team: "team1", pause_type: "technical" }, "чужой");
    assert.equal(tp.state["CS2-01"].active, null);
    // пауза посреди раунда: время идёт только с закупки
    await tp.onCs2Log("5", 'L 11/26/2026 - 20:00:00: World triggered "Round_Start"\n');
    sent.length = 0;
    await ev("game_paused", { team: "team1", pause_type: "technical" });
    assert.ok(sent.includes("matchzy_tech_pause_time 120"));
    assert.match(said(), /Альфа.*2:00.*следующего раунда/);
    t += 40_000; // раунд доигрывают — банк не тратится
    await tp.tick([inst]);
    await tp.onCs2Log("5", "L 11/26/2026 - 20:00:40: Starting Freeze period\n");
    t += 35_000;
    await tp.tick([inst]);
    sent.length = 0;
    await ev("game_unpaused", { team: "team1", pause_type: "technical" });
    assert.equal(tp.state["CS2-01"].left.team1, 85);
    assert.match(said(), /Альфа.*1:25/);
    // тактический перерыв и пауза админа в банк не идут
    await ev("game_paused", { team: "team1", pause_type: "tactical" });
    t += 30_000;
    await ev("game_unpaused", { team: "team1", pause_type: "tactical" });
    assert.equal(tp.state["CS2-01"].left.team1, 85);
    // вторая пауза той же команды — в закупке, агент за это время перезапустился
    sent.length = 0;
    await ev("game_paused", { team: "team1", pause_type: "technical" });
    assert.ok(sent.includes("matchzy_tech_pause_time 85"));
    tp = make();
    t += 26_000;
    await tp.tick([inst]);
    assert.match(said(), /осталось 0:59/);
    t += 30_000;
    await tp.tick([inst]);
    assert.match(said(), /осталось 0:29/);
    t += 29_000;
    sent.length = 0;
    await tp.tick([inst]);
    assert.ok(sent.includes("css_forceunpause"));
    assert.equal(tp.state["CS2-01"].left.team1, 0);
    await ev("game_unpaused", { team: "none", pause_type: "technical" }); // событие от снятия — списывать нечего
    // банк пуст — .tech снимается сразу; у соперника свой банк цел
    sent.length = 0;
    await ev("game_paused", { team: "team1", pause_type: "technical" });
    assert.ok(sent.includes("css_forceunpause"));
    assert.match(said(), /израсходовано/);
    assert.equal(tp.state["CS2-01"].left.team2, 120);
    // следующая карта — банк новый
    await tp.onMatchzyEvent({ event: "going_live", matchid: 5, map_number: 1 }, "tok");
    assert.deepEqual(tp.state["CS2-01"].left, { team1: 120, team2: 120 });
  });
  await test("enforce: в ножевом раунде деньги и закупку не возвращает, в игре — возвращает", async () => {
    const stateDir = path.join(dir, "enforce");
    mkdirSync(stateDir, { recursive: true });
    const inst = { name: "CS2-01" };
    // сервер в ноже: knife.cfg поставил потолок денег 0 и фризтайм 10, голос сбит
    const server = { mp_maxmoney: 0, mp_freezetime: 10, sv_alltalk: 0 };
    const sent = [];
    const rc = async (_i, cmd) => {
      if (/ \d/.test(cmd)) { sent.push(cmd); return ""; }
      return cmd.split(";").map((n) => `${n} = ${server[n]}`).join("\n");
    };
    const enforce = createEnforce({ stateDir, instances: [inst], rc, log: () => {} });
    enforce.set(inst, { matchid: 7, cvars: { mp_maxmoney: 16000, mp_freezetime: 20, sv_alltalk: 1 } }, "t");
    await enforce.apply(inst, { matchid: 7, gamestate: "knife", map_number: 0 });
    assert.deepEqual(sent, ["sv_alltalk 1"]);
    sent.length = 0;
    await enforce.apply(inst, { matchid: 7, gamestate: "waiting_for_knife_decision", map_number: 0 });
    assert.deepEqual(sent, ["sv_alltalk 1"]);
    sent.length = 0;
    await enforce.apply(inst, { matchid: 7, gamestate: "live", map_number: 0 });
    assert.deepEqual(sent, ["mp_maxmoney 16000;mp_freezetime 20;sv_alltalk 1"]);
  });

  await test("запись демо: агент даёт tv_record с путём от game/csgo на начале карты и tv_stoprecord в конце", async () => {
    const sent = [];
    const recorder = createRecorder({ rc: async (_inst, command) => (sent.push(command), command === "tv_stoprecord" ? 'Completed SourceTV demo "x"' : ""), log: () => {} });
    const inst = { name: "CS2-01" };
    const a = { matchid: 1000057 };
    const info = { map: "de_mirage" };
    assert.match(demoFileName(1000057, 0, "de_mirage", new Date(2026, 10, 22, 18, 27, 53)), /^2026-11-22_18-27-53_1000057_map0_de_mirage\.dem$/);
    await recorder.tick(inst, a, { matchid: 1000057, gamestate: "warmup", map_number: 0 }, info);
    assert.deepEqual(sent, []);
    await recorder.tick(inst, a, { matchid: 1000057, gamestate: "knife", map_number: 0 }, info);
    assert.equal(sent.length, 1);
    assert.match(sent[0], /^tv_record MatchZy\/\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}_1000057_map0_de_mirage\.dem$/);
    // та же карта — второй tv_record не шлём (он оборвал бы запись); сервер молчит — запись не трогаем
    await recorder.tick(inst, a, { matchid: 1000057, gamestate: "live", map_number: 0 }, info);
    await recorder.tick(inst, a, null, info);
    assert.equal(sent.length, 1);
    // следующая карта: разминка — стоп, игра — новый файл с её номером
    await recorder.tick(inst, a, { matchid: 1000057, gamestate: "warmup", map_number: 1 }, { map: "de_nuke" });
    assert.equal(sent[1], "tv_stoprecord");
    await recorder.tick(inst, a, { matchid: 1000057, gamestate: "live", map_number: 1 }, { map: "de_nuke" });
    assert.match(sent[2], /_1000057_map1_de_nuke\.dem$/);
    await recorder.tick(inst, a, { matchid: null, gamestate: "none", map_number: null }, info);
    assert.equal(sent[3], "tv_stoprecord");
    // чужой матч на сервере (без назначения) не пишем
    await recorder.tick(inst, undefined, { matchid: 5, gamestate: "live", map_number: 0 }, info);
    assert.equal(sent.length, 4);
  });
  await test("подъём между картами серии: матч возвращается на свою карту со счётом серии, а не на первую при 0:0", async () => {
    const root = path.join(dir, "recovery");
    const stateDir = path.join(root, "state");
    const backups = path.join(root, "server", "game", "csgo", "MatchZyDataBackup");
    mkdirSync(path.join(stateDir, "match-configs"), { recursive: true });
    mkdirSync(backups, { recursive: true });
    writeFileSync(path.join(stateDir, "match-configs", "game-1.json"), JSON.stringify({ num_maps: 5, maplist: ["de_mirage", "de_dust2", "de_ancient", "de_anubis", "de_nuke"] }));
    const team = (name, score) => JSON.stringify({ teamName: name, teamPlayers: { 1: "a" }, seriesScore: score });
    const backup = (map, round) => ({
      matchid: "77", map_name: "de_ancient", mapnumber: String(map), round, team1: team("A", 1), team2: team("B", 1),
      team1_score: "12", team2_score: "5", team1_series_score: "1", team2_series_score: "1", bomb_stats: '{"1":[3,2]}',
      match_loaded: "True", match_config: JSON.stringify({ MatchId: 77, NumMaps: 5, CurrentMapNumber: map }), valve_backup: "",
    });
    writeFileSync(path.join(backups, "matchzy_77_1_round20.json"), JSON.stringify(backup(1, "20")));
    writeFileSync(path.join(backups, "matchzy_77_2_round17.json"), JSON.stringify(backup(2, "17")));
    writeFileSync(path.join(backups, "matchzy_78_4_round03.json"), JSON.stringify(backup(4, "03")));
    assert.equal(latestMatchBackup(backups, 77), "matchzy_77_2_round17.json");

    const made = seriesBackup(backup(2, "17"), { mapNumber: 3, mapName: "de_anubis", s1: 2, s2: 1 });
    assert.equal(made.mapnumber, "3");
    assert.equal(made.map_name, "de_anubis");
    assert.equal(JSON.parse(made.team1).seriesScore, 2);
    assert.equal(JSON.parse(made.team2).seriesScore, 1);
    assert.equal(JSON.parse(made.match_config).CurrentMapNumber, 3);
    assert.equal(made.team1_score, "0");
    assert.match(made.valve_backup, /\{\s*\}\s*$/);

    // поддельный сервер: после загрузки матча — первая карта 0:0; бэкап серии переводит его на карту из файла
    let server = { gamestate: "none", matchid: null, map_number: null, team1: { series_score: 0 }, team2: { series_score: 0 } };
    const sent = [];
    let seenFile = null;
    const rc = async (_inst, command) => {
      sent.push(command);
      if (command === "get5_status") return JSON.stringify(server);
      const m = /^matchzy_loadbackup (\S+)$/.exec(command);
      if (m) {
        const b = JSON.parse(readFileSync(path.join(backups, path.basename(m[1])), "utf8"));
        seenFile = path.basename(m[1]);
        if (!b.valve_backup) return "нет данных раунда"; // как настоящий MatchZy: без данных раунда бэкап не берёт
        server = { gamestate: "pending_restore", matchid: 77, map_number: Number(b.mapnumber), team1: { series_score: Number(b.team1_series_score) }, team2: { series_score: Number(b.team2_series_score) } };
        return "";
      }
      return "";
    };
    const events = [];
    const recovery = createRecovery({
      stateDir, serverDir: path.join(root, "server"), rc, a2sInfo: async () => null, log: () => {},
      runStart: async () => {}, inLane: (_n, fn) => fn(),
      loadMatch: async () => ((server = { gamestate: "warmup", matchid: 77, map_number: 0, team1: { series_score: 0 }, team2: { series_score: 0 } }), { ok: true, result: "" }),
    });
    const inst = { name: "CS2-01", port: 27015 };
    recovery.assign(inst, { matchzy_id: 77, match_id: "game-1" });
    // третья карта сыграна, сервер стоит в разминке четвёртой при 2:1
    recovery.track(inst, true, { gamestate: "live", matchid: 77, map_number: 2, team1: { series_score: 1 }, team2: { series_score: 1 } });
    recovery.track(inst, true, { gamestate: "warmup", matchid: 77, map_number: 3, team1: { series_score: 2 }, team2: { series_score: 1 } });
    assert.deepEqual(recovery.assignments["CS2-01"].pos, { map: 3, s1: 2, s2: 1 });
    assert.equal(recovery.holding("CS2-01"), null);

    const r = await recovery.recoverNow(inst, { reason: "maintenance" });
    assert.equal(r.ok, true, r.result);
    assert.match(r.result, /обслуживанием.*серия продолжается: карта 4, счёт серии 2:1/);
    assert.equal(seenFile, "f16_series_77_3.json");
    assert.deepEqual([server.gamestate, server.map_number, server.team1.series_score, server.team2.series_score], ["pending_restore", 3, 2, 1]);
    assert.equal(existsSync(path.join(backups, "f16_series_77_3.json")), false, "файл серии должен быть удалён до старта карты");
    assert.equal(sent.some((c) => /matchzy_loadbackup .*round17/.test(c)), false, "раунд сыгранной карты восстанавливать нельзя");
    void events;

    // падение посреди карты, а данных раунда нет: серия всё равно встаёт на свою карту
    recovery.track(inst, true, { gamestate: "live", matchid: 77, map_number: 2, team1: { series_score: 1 }, team2: { series_score: 1 } });
    sent.length = 0;
    const r2 = await recovery.recoverNow(inst, { reason: "crash" });
    assert.equal(r2.ok, true, r2.result);
    assert.match(r2.result, /карта 3, счёт серии 1:1.*Раунд восстановить не удалось/);
    assert.equal(server.map_number, 2);
  });
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\nВСЕ ПРОВЕРКИ ПРОЙДЕНЫ (${checks})`);
