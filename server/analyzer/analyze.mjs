// Разбор демки CS2 → компактный JSON для страницы «Разбор» (2D-повтор, тепловые карты, гранаты, экономика).
//   node analyze.mjs <файл.dem> [выход.json]
// Работает отдельно от агента: на матчи и лобби не влияет.
import { createRequire } from "node:module";
import { writeFileSync } from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);
const P = require("@laihoe/demoparser2");

const EVERY = 8; // шаг выборки позиций, тиков (64 тика/с → 8 кадров в секунду; на странице — плавная интерполяция)
const TAIL = 3 * 64; // показываем ещё 3 секунды после конца раунда
const r1 = (v) => (v == null || Number.isNaN(v) ? null : Math.round(v));
const sideOf = (team) => (team === 2 ? "T" : team === 3 ? "CT" : null);

export function analyze(file) {
  const header = P.parseHeader(file);
  const map = header.map_name;

  // ── раунды
  const evs = P.parseEvents(file, ["round_start", "round_freeze_end", "round_end", "round_announce_match_start", "bomb_planted", "bomb_defused", "bomb_exploded"], ["X", "Y"], ["total_rounds_played"]);
  const byName = (n) => evs.filter((e) => e.event_name === n).sort((a, b) => a.tick - b.tick);
  const starts = byName("round_start");
  const freezes = byName("round_freeze_end");
  const matchStart = Math.max(0, ...byName("round_announce_match_start").map((e) => e.tick));
  // победитель раунда: "T"/"CT" (так отдаёт demoparser2) или номер команды 2/3
  const winnerOf = (w) => (w === "T" || w === "CT" ? w : sideOf(Number(w)));
  const ends = byName("round_end").filter((e) => e.tick > matchStart && winnerOf(e.winner));

  const rounds = [];
  for (const e of ends) {
    const prevEnd = rounds.length ? rounds[rounds.length - 1].end : matchStart;
    const start = [...starts].reverse().find((s) => s.tick <= e.tick && s.tick >= prevEnd)?.tick ?? prevEnd;
    const freezeEnd = freezes.find((f) => f.tick >= start && f.tick <= e.tick)?.tick ?? start;
    rounds.push({ n: rounds.length + 1, start, freezeEnd, end: e.tick, winner: winnerOf(e.winner), reason: e.reason ?? null, bomb: null, frames: [], kills: [], nades: [], econ: [] });
  }
  const roundAt = (tick) => rounds.findIndex((r) => tick >= r.start && tick <= r.end + TAIL);

  // ── позиции игроков (выборка)
  const ticks = [];
  for (const r of rounds) for (let t = r.start; t <= r.end + TAIL; t += EVERY) ticks.push(t);
  const rows = ticks.length
    ? P.parseTicks(file, ["X", "Y", "Z", "yaw", "is_alive", "health", "armor_value", "team_num", "active_weapon_name", "balance", "current_equip_value", "has_defuser", "has_helmet", "team_clan_name", "last_place_name", "is_scoped", "is_defusing"], ticks)
    : [];

  // игроки: steamid, у ботов его нет — тогда по имени
  const players = [];
  const idOf = new Map();
  const pid = (steamid, name) => {
    const key = steamid && steamid !== "0" ? `s${steamid}` : `n${name}`;
    if (!idOf.has(key)) {
      idOf.set(key, players.length);
      players.push({ name: name ?? "?", steamid: steamid && steamid !== "0" ? String(steamid) : null, team: null });
    }
    return idOf.get(key);
  };
  const teamNames = { T: new Map(), CT: new Map() };

  // названия мест на карте (Palace, BombsiteA…) — список, в кадрах только номер; центр места — для подписей на радаре
  const places = [];
  const placeIdx = new Map();
  const placeSum = new Map();
  const place = (name, x, y, z) => {
    if (!name) return -1;
    if (!placeIdx.has(name)) {
      placeIdx.set(name, places.length);
      places.push(name);
    }
    if (x != null && y != null) {
      const s = placeSum.get(name) ?? { x: 0, y: 0, z: 0, n: 0 };
      s.x += x; s.y += y; s.z += z ?? 0; s.n++;
      placeSum.set(name, s);
    }
    return placeIdx.get(name);
  };

  const frameMap = new Map(); // tick → [player rows]
  for (const row of rows) {
    if (row.team_num !== 2 && row.team_num !== 3) continue;
    const i = pid(row.steamid, row.name);
    const side = sideOf(row.team_num);
    if (row.team_clan_name) teamNames[side].set(row.team_clan_name, (teamNames[side].get(row.team_clan_name) ?? 0) + 1);
    if (!frameMap.has(row.tick)) frameMap.set(row.tick, []);
    // флаги: 1 — шлем, 2 — дефузер, 4 — в прицеле, 8 — разминирует
    const flags = (row.has_helmet ? 1 : 0) | (row.has_defuser ? 2 : 0) | (row.is_scoped ? 4 : 0) | (row.is_defusing ? 8 : 0);
    const pl = row.is_alive ? place(row.last_place_name, row.X, row.Y, row.Z) : -1;
    frameMap.get(row.tick).push([i, side === "T" ? 0 : 1, r1(row.X), r1(row.Y), r1(row.Z), r1(row.yaw), row.is_alive ? r1(row.health) : 0, r1(row.armor_value), row.active_weapon_name ?? null, pl, row.balance ?? null, flags]);
  }
  for (const [tick, list] of [...frameMap.entries()].sort((a, b) => a[0] - b[0])) {
    const k = roundAt(tick);
    if (k >= 0) rounds[k].frames.push([tick, list]);
  }

  // экономика: закупка на конец фризтайма
  for (const r of rounds) {
    const at = r.frames.find(([t]) => t >= r.freezeEnd) ?? r.frames[0];
    if (!at) continue;
    const near = rows.filter((row) => row.tick === at[0] && (row.team_num === 2 || row.team_num === 3));
    r.econ = near.map((row) => ({ p: pid(row.steamid, row.name), side: sideOf(row.team_num), money: row.balance ?? null, equip: row.current_equip_value ?? null, kit: !!row.has_defuser, helmet: !!row.has_helmet }));
    for (const side of ["T", "CT"]) {
      const eq = r.econ.filter((e) => e.side === side).map((e) => e.equip ?? 0);
      const avg = eq.length ? eq.reduce((a, b) => a + b, 0) / eq.length : 0;
      // пистолетные раунды — начало каждой половины основного времени (MR12: 1-й и 13-й)
      r[`buy${side}`] = r.n === 1 || r.n === 13 ? "pistol" : avg >= 3900 ? "full" : avg >= 2000 ? "force" : avg >= 1000 ? "semi" : "eco";
    }
  }

  // ── убийства
  for (const k of P.parseEvent(file, "player_death", ["X", "Y", "team_num"], ["total_rounds_played"])) {
    const ri = roundAt(k.tick);
    if (ri < 0 || !k.user_name) continue;
    rounds[ri].kills.push({
      t: k.tick,
      a: k.attacker_name ? pid(k.attacker_steamid, k.attacker_name) : null,
      v: pid(k.user_steamid, k.user_name),
      as: k.assister_name ? pid(k.assister_steamid, k.assister_name) : null,
      w: k.weapon,
      hs: !!k.headshot,
      ax: r1(k.attacker_X), ay: r1(k.attacker_Y),
      vx: r1(k.user_X), vy: r1(k.user_Y),
      vs: sideOf(k.user_team_num),
      smoke: !!k.thrusmoke, blind: !!k.attackerblind, wall: (k.penetrated ?? 0) > 0, flash: !!k.assistedflash,
    });
  }

  // ── выстрелы (огнестрел) и попадания
  const NOT_GUN = /knife|bayonet|grenade|flashbang|smoke|molotov|incendiary|decoy|c4|taser/;
  for (const r of rounds) { r.shots = []; r.hurts = []; }
  for (const f of P.parseEvent(file, "weapon_fire", [], [])) {
    const ri = roundAt(f.tick);
    if (ri < 0 || !f.user_name || NOT_GUN.test(String(f.weapon ?? ""))) continue;
    rounds[ri].shots.push([f.tick, pid(f.user_steamid, f.user_name)]);
  }
  for (const h of P.parseEvent(file, "player_hurt", [], [])) {
    const ri = roundAt(h.tick);
    if (ri < 0 || !h.user_name) continue;
    rounds[ri].hurts.push([h.tick, h.attacker_name ? pid(h.attacker_steamid, h.attacker_name) : null, pid(h.user_steamid, h.user_name), h.dmg_health ?? 0, h.hitgroup ?? null, h.weapon ?? null]);
  }

  // ── бомба
  for (const e of [...byName("bomb_planted"), ...byName("bomb_defused"), ...byName("bomb_exploded")]) {
    const ri = roundAt(e.tick);
    if (ri < 0) continue;
    const b = (rounds[ri].bomb ??= {});
    const kind = e.event_name.replace("bomb_", "");
    b[kind] = { t: e.tick, x: r1(e.user_X), y: r1(e.user_Y), site: e.site ?? null, p: e.user_name ? pid(e.user_steamid, e.user_name) : null };
  }

  // ── гранаты: траектория полёта (каждая 4-я точка) и точка срабатывания
  const NADE = { smoke: "smoke", smokegrenade: "smoke", flashbang: "flash", flash: "flash", he_grenade: "he", hegrenade: "he", molotov: "molotov", incendiary: "molotov", incgrenade: "molotov", decoy: "decoy" };
  const groups = new Map();
  for (const g of P.parseGrenades(file)) {
    if (g.x == null) continue;
    const key = g.grenade_entity_id ?? g.entity_id;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(g);
  }
  for (const pts of groups.values()) {
    pts.sort((a, b) => a.tick - b.tick);
    const first = pts[0], last = pts[pts.length - 1];
    const ri = roundAt(first.tick);
    if (ri < 0) continue;
    // тип: «CSmokeGrenadeProjectile», «smokegrenade», «weapon_molotov» → smoke / flash / he / molotov / decoy
    const raw = String(first.grenade_type ?? "").toLowerCase().replace(/^weapon_/, "").replace(/^c/, "").replace(/projectile$/, "");
    const type = NADE[raw] ?? (/smoke/.test(raw) ? "smoke" : /flash/.test(raw) ? "flash" : /hegrenade|he_grenade/.test(raw) ? "he" : /molotov|incend|inferno/.test(raw) ? "molotov" : /decoy/.test(raw) ? "decoy" : raw || "?");
    const pathPts = pts.filter((_, i) => i % 4 === 0 || i === pts.length - 1).map((p) => [p.tick, r1(p.x), r1(p.y)]);
    rounds[ri].nades.push({ type, p: first.name ? pid(first.steamid, first.name) : null, t0: first.tick, t1: last.tick, x: r1(last.x), y: r1(last.y), path: pathPts });
  }

  // стороны и названия команд: игрок → сторона в первом раунде
  for (const r of rounds.slice(0, 1)) for (const [, list] of r.frames.slice(0, 1)) for (const [i, s] of list) players[i].team = s === 0 ? "A" : "B";
  const top = (m) => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // счёт: в каждом раунде — на какой стороне команда A (стартовавшая за T)
  let scoreA = 0, scoreB = 0;
  const aNames = new Map(), bNames = new Map();
  for (const r of rounds) {
    const a = r.frames[0]?.[1].find(([i]) => players[i]?.team === "A");
    r.aSide = a ? (a[1] === 0 ? "T" : "CT") : null;
    if (r.winner && r.aSide) {
      if (r.winner === r.aSide) scoreA++;
      else scoreB++;
    }
  }
  // названия команд по сторонам с учётом смены сторон: имя клана игроков команды
  for (const row of rows) {
    if (!row.team_clan_name || (row.team_num !== 2 && row.team_num !== 3)) continue;
    const i = idOf.get(row.steamid && row.steamid !== "0" ? `s${row.steamid}` : `n${row.name}`);
    const m = players[i]?.team === "A" ? aNames : bNames;
    m.set(row.team_clan_name, (m.get(row.team_clan_name) ?? 0) + 1);
  }

  return {
    v: 2,
    map,
    server: header.server_name ?? null,
    tickrate: 64,
    places,
    callouts: [...placeSum.entries()].filter(([, v]) => v.n >= 40).map(([name, v]) => ({ name, x: r1(v.x / v.n), y: r1(v.y / v.n), z: r1(v.z / v.n) })),
    every: EVERY,
    teams: { A: top(aNames) ?? top(teamNames.T) ?? "Команда A", B: top(bNames) ?? top(teamNames.CT) ?? "Команда B" },
    score: { A: scoreA, B: scoreB },
    players,
    rounds,
  };
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("analyze.mjs")) {
  const [, , input, output] = process.argv;
  if (!input) {
    console.error("node analyze.mjs <файл.dem> [выход.json]");
    process.exit(1);
  }
  const t0 = Date.now();
  const res = analyze(input);
  const out = output ?? path.join(path.dirname(input), path.basename(input, ".dem") + ".analysis.json");
  const json = JSON.stringify(res);
  writeFileSync(out, json);
  const kills = res.rounds.reduce((n, r) => n + r.kills.length, 0);
  const nades = res.rounds.reduce((n, r) => n + r.nades.length, 0);
  console.log(`${res.map}: раундов ${res.rounds.length}, игроков ${res.players.length}, убийств ${kills}, гранат ${nades}, ${(json.length / 1e6).toFixed(1)} МБ, ${((Date.now() - t0) / 1000).toFixed(1)} с → ${out}`);
}
