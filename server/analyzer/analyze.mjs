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
    rounds[ri].shots.push([f.tick, pid(f.user_steamid, f.user_name), String(f.weapon ?? "").replace(/^weapon_/, "")]);
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
  // номер сущности гранаты игра переиспользует — одна группа может быть несколькими гранатами:
  // режем по разрыву во времени или смене бросившего
  const pieces = [];
  for (const all of groups.values()) {
    all.sort((a, b) => a.tick - b.tick);
    let cur = [];
    for (const g of all) {
      const prev = cur[cur.length - 1];
      if (prev && (g.tick - prev.tick > 16 || g.steamid !== prev.steamid || g.name !== prev.name)) { pieces.push(cur); cur = []; }
      cur.push(g);
    }
    if (cur.length) pieces.push(cur);
  }
  for (const pts of pieces) {
    const first = pts[0], last = pts[pts.length - 1];
    const ri = roundAt(first.tick);
    if (ri < 0) continue;
    // тип: «CSmokeGrenadeProjectile», «smokegrenade», «weapon_molotov» → smoke / flash / he / molotov / decoy
    const raw = String(first.grenade_type ?? "").toLowerCase().replace(/^weapon_/, "").replace(/^c/, "").replace(/projectile$/, "");
    const type = NADE[raw] ?? (/smoke/.test(raw) ? "smoke" : /flash/.test(raw) ? "flash" : /hegrenade|he_grenade/.test(raw) ? "he" : /molotov|incend|inferno/.test(raw) ? "molotov" : /decoy/.test(raw) ? "decoy" : raw || "?");
    const pathPts = pts.filter((_, i) => i % 4 === 0 || i === pts.length - 1).map((p) => [p.tick, r1(p.x), r1(p.y)]);
    rounds[ri].nades.push({ type, p: first.name ? pid(first.steamid, first.name) : null, t0: first.tick, t1: last.tick, x: r1(last.x), y: r1(last.y), path: pathPts });
  }

  // ── ослепления: в демках турниров нет события «ослепил», но у каждого игрока есть flash_duration —
  // через 6 тиков после вспышки смотрим, кто ослеплён и на сколько (врагов и своих)
  const flashes = P.parseEvent(file, "flashbang_detonate", [], []).filter((e) => roundAt(e.tick) >= 0);
  if (flashes.length) {
    // два замера: до вспышки и сразу после — flash_duration не сбрасывается, ослепила именно эта вспышка, если значение изменилось
    const fr = P.parseTicks(file, ["flash_duration", "team_num", "is_alive"], flashes.flatMap((e) => [e.tick - 2, e.tick + 6]));
    const byTick = new Map();
    for (const row of fr) {
      if (!byTick.has(row.tick)) byTick.set(row.tick, []);
      byTick.get(row.tick).push(row);
    }
    for (const e of flashes) {
      const r = rounds[roundAt(e.tick)];
      const thrower = e.user_name ? pid(e.user_steamid, e.user_name) : null;
      // граната этой вспышки: тот же бросивший, сработала в пределах 16 тиков
      const nade = r.nades.find((n) => n.type === "flash" && n.p === thrower && Math.abs(n.t1 - e.tick) <= 16) ?? r.nades.find((n) => n.type === "flash" && Math.abs(n.t1 - e.tick) <= 8);
      if (!nade) continue;
      const rows = byTick.get(e.tick + 6) ?? [];
      const before = new Map((byTick.get(e.tick - 2) ?? []).map((x) => [pid(x.steamid, x.name), x.flash_duration ?? 0]));
      const me = rows.find((x) => pid(x.steamid, x.name) === thrower);
      const blinded = rows
        .filter((x) => x.is_alive && (x.flash_duration ?? 0) > 0.7 && Math.abs((x.flash_duration ?? 0) - (before.get(pid(x.steamid, x.name)) ?? 0)) > 0.01)
        .map((x) => [pid(x.steamid, x.name), Math.round(x.flash_duration * 10) / 10, me && x.team_num === me.team_num ? 1 : 0]);
      nade.blind = blinded; // [игрок, секунд, 1 — свой]
    }
  }

  // ── то, что считает Leetify: кого игрок видел при выстреле, скорость и присед в момент выстрела,
  // время до урона и довод прицела в дуэли, гранаты на руках при смерти, кто из своих видел убийцу (размены).
  // «Видит» — approximate_spotted_by игры (список steamid, кто видит этого игрока).
  {
    const firstHits = [];
    for (const r of rounds) {
      const seen = new Set();
      for (const h of r.hurts) {
        const [t, a, v, , , w] = h;
        if (a == null || a === v || !w || NOT_GUN.test(String(w)) || /world|inferno|hegrenade/.test(String(w))) continue;
        const key = `${a}-${v}`;
        if (seen.has(key)) continue;
        seen.add(key);
        firstHits.push({ r, t, a, v });
      }
    }
    const need = new Set();
    for (const r of rounds) for (const [t] of r.shots) { need.add(t); need.add(t - 1); }
    for (const h of firstHits) for (let t = h.t - 64; t <= h.t; t += 2) need.add(t);
    for (const r of rounds) for (const k of r.kills) for (let t = k.t; t <= k.t + 5 * 64; t += 16) need.add(t);
    const look = new Map(); // tick → Map(pid → строка)
    if (need.size) {
      for (const row of P.parseTicks(file, ["X", "Y", "pitch", "yaw", "is_alive", "team_num", "ducking", "approximate_spotted_by"], [...need])) {
        if (row.team_num !== 2 && row.team_num !== 3) continue;
        if (!look.has(row.tick)) look.set(row.tick, new Map());
        look.get(row.tick).set(pid(row.steamid, row.name), row);
      }
    }
    // видит ли a игрока v на тике t
    const sees = (t, a, v) => {
      const row = look.get(t)?.get(v);
      const sid = players[a]?.steamid;
      return !!(row && row.is_alive && sid && (row.approximate_spotted_by ?? []).includes(sid));
    };
    // видит ли a хоть одного живого врага
    const seesEnemy = (t, a) => {
      const m = look.get(t);
      const me = m?.get(a);
      if (!me) return false;
      for (const [q, row] of m) if (q !== a && row.is_alive && row.team_num !== me.team_num && sees(t, a, q)) return true;
      return false;
    };
    // выстрелы: [тик, игрок, скорость ед/с, видел врага 0/1, присед 0/1, оружие]
    for (const r of rounds) {
      r.shots = r.shots.map(([t, p, w]) => {
        const now = look.get(t)?.get(p), prev = look.get(t - 1)?.get(p);
        const speed = now && prev && now.X != null && prev.X != null ? Math.round(Math.hypot(now.X - prev.X, now.Y - prev.Y) * 64) : null;
        return [t, p, speed, seesEnemy(t, p) ? 1 : 0, now?.ducking ? 1 : 0, w];
      });
    }
    // дуэли: [атакующий, жертва, тик первого попадания, тик, с которого видел (null — видел дольше 1 с), довод прицела в градусах]
    for (const r of rounds) r.duels = [];
    const ang = (x, y) => {
      if (!x || !y) return null;
      let dy = Math.abs((x.yaw ?? 0) - (y.yaw ?? 0)) % 360;
      if (dy > 180) dy = 360 - dy;
      return Math.round(Math.hypot(dy, (x.pitch ?? 0) - (y.pitch ?? 0)) * 10) / 10;
    };
    for (const h of firstHits) {
      if (!sees(h.t, h.a, h.v) && !sees(h.t - 2, h.a, h.v)) continue; // попал не глядя (прострел, смок)
      let s = h.t - (sees(h.t, h.a, h.v) ? 0 : 2);
      while (s - 2 >= h.t - 64 && sees(s - 2, h.a, h.v)) s -= 2;
      const long = s - 2 < h.t - 64; // видел весь замеренный отрезок — дольше секунды
      h.r.duels.push([h.a, h.v, h.t, long ? null : s, long ? null : ang(look.get(s)?.get(h.a), look.get(h.t)?.get(h.a) ?? look.get(h.t - 2)?.get(h.a))]);
    }
    // убийства: кто из своих жертвы видел убийцу в следующие 5 с
    for (const r of rounds) {
      for (const k of r.kills) {
        if (k.a == null || k.a === k.v) continue;
        const vic = look.get(k.t)?.get(k.v);
        const saw = new Set();
        for (let t = k.t; t <= k.t + 5 * 64; t += 16) {
          const m = look.get(t);
          if (!m) continue;
          for (const [q, row] of m) if (q !== k.v && row.is_alive && vic && row.team_num === vic.team_num && sees(t, q, k.a)) saw.add(q);
        }
        k.seen = [...saw];
      }
    }
    // гранаты на руках при смерти — стоимость
    const PRICE = { Flashbang: 200, "Smoke Grenade": 300, "High Explosive Grenade": 300, Molotov: 400, "Incendiary Grenade": 500, "Decoy Grenade": 50 };
    const deathTicks = rounds.flatMap((r) => r.kills.map((k) => k.t - 1));
    if (deathTicks.length) {
      const inv = new Map();
      for (const row of P.parseTicks(file, ["inventory"], deathTicks)) inv.set(`${row.tick}-${pid(row.steamid, row.name)}`, row.inventory ?? []);
      for (const r of rounds) for (const k of r.kills) {
        const items = inv.get(`${k.t - 1}-${k.v}`);
        if (items) k.util = items.reduce((s, it) => s + (PRICE[it] ?? 0), 0);
      }
    }
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

  const callouts = [...placeSum.entries()].filter(([, v]) => v.n >= 40).map(([name, v]) => ({ name, x: r1(v.x / v.n), y: r1(v.y / v.n), z: r1(v.z / v.n) }));

  // гранаты для библиотеки раскидок: сторона бросившего, откуда (место) и куда легла (ближайшее место), секунда раунда
  const nearestPlace = (x, y) => {
    let best = null, bd = Infinity;
    for (const c of callouts) {
      const d = (c.x - x) ** 2 + (c.y - y) ** 2;
      if (d < bd) { bd = d; best = c.name; }
    }
    return best;
  };
  for (const r of rounds) {
    for (const n of r.nades) {
      const fr = r.frames.reduce((b, f) => (Math.abs(f[0] - n.t0) < Math.abs(b[0] - n.t0) ? f : b), r.frames[0] ?? [0, []]);
      const me = fr[1].find((q) => q[0] === n.p);
      n.side = me ? (me[1] === 0 ? "T" : "CT") : null;
      n.from = me && me[9] >= 0 ? places[me[9]] : null;
      n.fx = me ? me[2] : n.path[0]?.[1] ?? null; // где стоял бросивший
      n.fy = me ? me[3] : n.path[0]?.[2] ?? null;
      n.to = nearestPlace(n.x, n.y);
      n.rt = Math.round(((n.t0 - r.freezeEnd) / 64) * 10) / 10; // секунда раунда после закупки
    }
  }

  return {
    v: 5,
    map,
    server: header.server_name ?? null,
    tickrate: 64,
    places,
    callouts,
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
