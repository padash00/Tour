// Разбор игрока: сравнение с топами на той же карте (этап 3).
//   node coach.mjs <id разбора> <steamid игрока> [--json выход.json]
// Берёт разбор игрока (cache/<id>.json.gz) и все про-разборы этой карты (kind = pro), считает базу топов
// «на игрока за раунд» и по каждой теме — выводы с моментами игрока и примерами про (для клипов «ты / про»).
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { situations } from "./situations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, "cache");
const load = (id) => JSON.parse(zlib.gunzipSync(readFileSync(path.join(CACHE, `${id}.json.gz`))).toString());
const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const r2 = (x) => Math.round(x * 100) / 100;
const TR = 64;
const NADES = ["smoke", "flash", "molotov", "he"];

/** Цифры одного игрока в одном разборе (по стороне и в целом) */
function playerNumbers(a, i, sit) {
  const rounds = a.rounds.filter((r) => r.frames.some(([, l]) => l.some((p) => p[0] === i)));
  const sideIn = (r) => { const f = r.frames.find(([t]) => t >= r.freezeEnd) ?? r.frames[0]; const p = f?.[1].find((q) => q[0] === i); return p ? (p[1] === 0 ? "T" : "CT") : null; };
  const out = { rounds: rounds.length, kills: 0, deaths: 0, damage: 0, nades: Object.fromEntries(NADES.map((t) => [t, 0])), bySide: { T: 0, CT: 0 } };
  for (const r of rounds) {
    const s = sideIn(r);
    if (s) out.bySide[s]++;
    for (const k of r.kills) {
      if (k.a === i && k.v !== i) out.kills++;
      if (k.v === i) out.deaths++;
    }
    for (const h of r.hurts ?? []) if (h[1] === i && h[2] !== i) out.damage += Math.min(100, h[3]);
    for (const n of r.nades) if (n.p === i && NADES.includes(n.type)) out.nades[n.type]++;
  }
  out.openingKills = sit.openings.filter((o) => o.killer === i).length;
  out.openingDeaths = sit.openings.filter((o) => o.victim === i).length;
  const myDeaths = sit.trades.filter((t) => t.victim === i);
  out.tradedDeaths = myDeaths.filter((t) => t.traded).length;
  out.deathsCounted = myDeaths.length;
  return out;
}

const GUN = (w) => !!w && !/knife|bayonet|hegrenade|inferno|molotov|incgrenade|flashbang|smokegrenade|decoy|world|c4|taser/i.test(String(w));
// Определения — как у Leetify (leetify.com/blog/leetify-stats-glossary)
const BLIND_S = 1.1; // ослеплён дольше 1.1 с — засчитываем (полуослеплённых не считаем)
const RIFLE_MAX = { ak47: 215, m4a1: 225, m4a1_silencer: 225, galilar: 215, famas: 220, aug: 220, sg556: 210 }; // макс. скорость, ед/с
const COMBAT = 96; // выстрел «в бою»: видел врага или в пределах 1.5 с наносил/получал урон от огнестрела
const TRADE_WIN = 5 * 64; // окно размена — 5 с
const TRADE_DIST = 1000; // мог разменять: был в 1000 ед. от убийцы (или видел его)
const SMOKE_DIST = 800; // CT-смок остановил выход: враг подходил ближе 800 ед. к месту смока
const median = (xs) => { if (!xs.length) return null; const v = [...xs].sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2; };

function frameAt(r, tick) {
  let lo = 0, hi = r.frames.length - 1;
  if (hi < 0) return null;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (r.frames[mid][0] <= tick) lo = mid; else hi = mid - 1; }
  return r.frames[lo];
}
const posAt = (r, tick, i) => frameAt(r, tick)?.[1].find((q) => q[0] === i) ?? null;

/** Стрельба, флешки, урон гранатами, экономика, размены одного игрока в разборе */
function skillNumbers(a, i) {
  const o = { shots: 0, hits: 0, headHits: 0, bodyHits: 0, gunKills: 0, firstShots: 0, firstHits: 0, sprayShots: 0, sprayHits: 0,
    strafeShots: 0, strafeGood: 0, ttd: [], xhair: [],
    flashes: 0, flashEnemies: 0, flashEnemySec: 0, flashBlinding: 0, flashTeam: 0, flashSelf: 0, flashKills: 0,
    he: 0, heDmg: 0, molly: 0, mollyDmg: 0, deaths: 0, utilOnDeath: 0, ctSmokes: 0, ctSmokesGood: 0,
    tradeOpp: 0, tradeTry: 0, tradeWin: 0, tradedOpp: 0, tradedTry: 0, tradedWin: 0,
    missDeaths: [], badFlashes: [], econ: [], missedTrades: [] };
  for (const r of a.rounds) {
    const mine = (r.shots ?? []).filter((s) => s[1] === i).sort((x, y) => x[0] - y[0]);
    const hurtsOut = (r.hurts ?? []).filter((h) => h[1] === i && h[2] !== i && GUN(h[5]));
    const hurtsIn = (r.hurts ?? []).filter((h) => h[2] === i && h[1] != null && h[1] !== i && GUN(h[5]));
    const fighting = (t) => hurtsOut.some((h) => Math.abs(h[0] - t) <= COMBAT) || hurtsIn.some((h) => Math.abs(h[0] - t) <= COMBAT);
    const hitAt = (t) => hurtsOut.some((h) => h[0] >= t && h[0] - t <= 10);
    const combat = mine.filter((s) => s[3] === 1 || fighting(s[0]));
    // точность — по выстрелам в бою (не по прострелам наугад и не по стрельбе «в никуда»)
    o.shots += combat.length;
    o.hits += combat.filter((s) => hitAt(s[0])).length;
    // хедшоты — от попаданий, без AWP
    const noAwp = hurtsOut.filter((h) => !/awp/i.test(String(h[5])));
    o.headHits += noAwp.filter((h) => h[4] === "head").length;
    o.bodyHits += noAwp.length;
    o.gunKills += r.kills.filter((k) => k.a === i && k.v !== i && GUN(k.w)).length;
    // очереди: разрыв больше 0.4 с — новая очередь. Первая пуля; спрей — очередь из винтовки от 3 выстрелов
    const bursts = [];
    for (const s of combat) {
      const b = bursts[bursts.length - 1];
      if (b && s[0] - b[b.length - 1][0] <= 26) b.push(s);
      else bursts.push([s]);
    }
    for (const b of bursts) {
      o.firstShots++;
      if (hitAt(b[0][0])) o.firstHits++;
      const rifle = b.every((s) => s[5] == null || RIFLE_MAX[s[5]]);
      if (b.length >= 3 && rifle) for (const s of b) { o.sprayShots++; if (hitAt(s[0])) o.sprayHits++; }
    }
    // контрстрейф: выстрел из винтовки в бою, не в приседе, скорость ниже 34% от максимальной для оружия
    for (const s of combat) {
      const max = RIFLE_MAX[s[5]];
      if (!max || s[2] == null || s[4]) continue;
      o.strafeShots++;
      if (s[2] < max * 0.34) o.strafeGood++;
    }
    // время до урона и довод прицела (дуэли, где игра записала, что видел врага; дольше 1 с — не считаем)
    for (const d of r.duels ?? []) {
      if (d[0] !== i || d[3] == null) continue;
      o.ttd.push(((d[2] - d[3]) / 64) * 1000);
      if (d[4] != null) o.xhair.push(d[4]);
    }
    // смерть после очереди мимо: стрелял 4+ раза за 3 с до смерти и ни разу не попал
    const death = r.kills.find((k) => k.v === i);
    if (death) {
      o.deaths++;
      if (death.util != null) o.utilOnDeath += death.util;
      const before = mine.filter((s) => s[0] <= death.t && death.t - s[0] <= 3 * 64);
      const hitBefore = hurtsOut.some((h) => h[0] <= death.t && death.t - h[0] <= 3 * 64);
      if (before.length >= 4 && !hitBefore) o.missDeaths.push({ round: r.n, t: death.t, shots: before.length, by: death.a });
    }
    for (const n of r.nades) {
      if (n.p !== i) continue;
      if (n.type === "flash") {
        o.flashes++;
        const bl = (n.blind ?? []).filter(([, d]) => d > BLIND_S);
        const enemies = bl.filter(([p, , own]) => !own && p !== i);
        o.flashEnemies += Math.min(5, enemies.length);
        // длительность — по самому ослеплённому врагу, среди флешек, ослепивших хоть кого-то
        if (enemies.length) { o.flashBlinding++; o.flashEnemySec += Math.max(...enemies.map(([, d]) => d)); }
        const team = bl.filter(([p, , own]) => own && p !== i).length;
        o.flashTeam += team;
        if (bl.some(([p]) => p === i)) o.flashSelf++;
        // флешка привела к убийству: ослеплённого врага убили (ты или напарник) за 3 с
        if (enemies.some(([p]) => r.kills.some((k) => k.v === p && k.t >= n.t1 && k.t - n.t1 <= 3 * 64))) o.flashKills++;
        if (n.blind && (team > 0 || enemies.length === 0)) o.badFlashes.push({ round: r.n, t: n.t0, t1: n.t1, from: n.from, to: n.to, side: n.side, team, self: bl.some(([p]) => p === i), enemies: enemies.length });
      }
      if (n.type === "he") o.he++;
      if (n.type === "molotov") o.molly++;
      // смок защиты остановил выход: враг подходил к месту смока ближе 800 ед. в первые 15 с
      if (n.type === "smoke" && n.side === "CT" && n.x != null) {
        o.ctSmokes++;
        const near = r.frames.some(([t, l]) => t >= n.t1 && t - n.t1 <= 15 * 64 && l.some((q) => q[1] === 0 && q[6] > 0 && Math.hypot(q[2] - n.x, q[3] - n.y) < SMOKE_DIST));
        if (near) o.ctSmokesGood++;
      }
    }
    for (const h of r.hurts ?? []) {
      if (h[1] !== i || h[2] === i) continue;
      if (/hegrenade/i.test(String(h[5]))) o.heDmg += Math.min(100, h[3]);
      if (/inferno|molotov|incgrenade/i.test(String(h[5]))) o.mollyDmg += Math.min(100, h[3]);
    }
    // размены (как у Leetify): мог ли разменять, пытался ли, разменял ли
    const kills = [...r.kills].sort((x, y) => x.t - y.t);
    const fought = (p, k, t) => (r.hurts ?? []).some((h) => h[0] >= t && h[0] - t <= TRADE_WIN && ((h[1] === p && h[2] === k) || (h[1] === k && h[2] === p)));
    const avenged = (p, k, t) => kills.some((x) => x.t > t && x.t - t <= TRADE_WIN && x.a === p && x.v === k);
    const couldTrade = (p, k, t) => {
      const me = posAt(r, t, p), killer = posAt(r, t, k);
      if (!me || me[6] <= 0 || kills.some((x) => x.v === p && x.t <= t)) return false;
      return (k != null && (r.kills.find((x) => x.t === t && x.a === k)?.seen ?? []).includes(p)) || (!!killer && Math.hypot(me[2] - killer[2], me[3] - killer[3]) < TRADE_DIST);
    };
    for (const k of kills) {
      if (k.a == null || k.a === k.v) continue;
      const vp = posAt(r, k.t - 8, k.v), ip = posAt(r, k.t - 8, i);
      if (!vp || !ip) continue;
      const mate = vp[1] === ip[1];
      if (k.v !== i && mate && couldTrade(i, k.a, k.t)) {
        // напарника убили рядом с тобой
        o.tradeOpp++;
        const tried = fought(i, k.a, k.t);
        if (tried) o.tradeTry++;
        if (avenged(i, k.a, k.t)) o.tradeWin++;
        else if (!tried) o.missedTrades.push({ round: r.n, t: k.t, mate: k.v, killer: k.a, dist: Math.round(Math.hypot(ip[2] - (posAt(r, k.t, k.a)?.[2] ?? ip[2]), ip[3] - (posAt(r, k.t, k.a)?.[3] ?? ip[3]))) });
      }
      if (k.v === i) {
        // тебя убили: был ли рядом напарник, пытался ли, разменял ли
        const mates = (frameAt(r, k.t)?.[1] ?? []).filter((q) => q[0] !== i && q[1] === ip[1] && q[6] > 0).map((q) => q[0]);
        const could = mates.filter((m) => couldTrade(m, k.a, k.t));
        if (could.length) {
          o.tradedOpp++;
          if (could.some((m) => fought(m, k.a, k.t))) o.tradedTry++;
          if (could.some((m) => avenged(m, k.a, k.t))) o.tradedWin++;
        }
      }
    }
    // экономика: закупка игрока против команды на начало раунда
    const me = r.econ.find((e) => e.p === i);
    if (me && r.n !== 1 && r.n !== 13) {
      const team = r.econ.filter((e) => e.side === me.side && e.p !== i);
      const avg = team.length ? team.reduce((x, e) => x + (e.equip ?? 0), 0) / team.length : 0;
      const won = r.winner === me.side;
      if ((me.equip ?? 0) >= 2700 && avg < 1500) o.econ.push({ round: r.n, kind: "force_alone", equip: me.equip, teamAvg: Math.round(avg), won, side: me.side });
      else if ((me.equip ?? 0) < 1500 && avg >= 3800) o.econ.push({ round: r.n, kind: "save_alone", equip: me.equip, teamAvg: Math.round(avg), won, side: me.side });
      else if ((me.money ?? 0) >= 3500 && (me.equip ?? 0) < 3000 && avg >= 3800) o.econ.push({ round: r.n, kind: "underbuy", equip: me.equip, money: me.money, teamAvg: Math.round(avg), won, side: me.side });
    }
  }
  return o;
}

export function coach(myId, steamid) {
  const me = load(myId);
  const i = me.players.findIndex((p) => p.steamid === steamid);
  if (i < 0) throw new Error("игрока нет в этой демке");
  const name = me.players[i].name;
  const index = JSON.parse(readFileSync(path.join(CACHE, "index.json"), "utf8"));
  const pros = Object.entries(index).filter(([, m]) => m.kind === "pro" && m.map === me.map).map(([id]) => ({ id, a: load(id) })).filter(({ a }) => (a.v ?? 1) >= 3);
  if (!pros.length) throw new Error(`нет про-демок на ${me.map}`);
  const kfile = path.join(CACHE, `knowledge-${me.map}.json`);
  const knowledge = existsSync(kfile) ? JSON.parse(readFileSync(kfile, "utf8")) : null;

  // ── база топов «на игрока за раунд»
  const proSkill = { econ: 0, ttd: [], xhair: [] };
  const base = { rounds: 0, kills: 0, deaths: 0, damage: 0, openingDeaths: 0, openingKills: 0, nades: Object.fromEntries(NADES.map((t) => [t, 0])), traded: { T: [0, 0], CT: [0, 0] } };
  const proRepeek = new Map(); // место → [выходов, смертей]
  const proClutch = new Map(); // vs → [клатчей, побед]
  const proSetup = new Map(); // side|place → доля
  const proSetupTotal = { T: 0, CT: 0 };
  for (const { a } of pros) {
    const s = situations(a);
    for (let p = 0; p < a.players.length; p++) {
      const k = skillNumbers(a, p);
      for (const [key, v] of Object.entries(k)) {
        if (key === "econ") proSkill.econ += v.length;
        else if (key === "ttd" || key === "xhair") proSkill[key].push(...v);
        else if (typeof v === "number") proSkill[key] = (proSkill[key] ?? 0) + v;
      }
      const n = playerNumbers(a, p, s);
      base.rounds += n.rounds; base.kills += n.kills; base.deaths += n.deaths; base.damage += n.damage;
      base.openingDeaths += n.openingDeaths; base.openingKills += n.openingKills;
      for (const t of NADES) base.nades[t] += n.nades[t];
    }
    for (const t of s.trades) if (t.victimSide) { base.traded[t.victimSide][1]++; if (t.traded) base.traded[t.victimSide][0]++; }
    for (const r of s.repeeks) { const k = `${r.side}|${r.place}`; const v = proRepeek.get(k) ?? [0, 0]; v[0]++; if (r.died) v[1]++; proRepeek.set(k, v); }
    for (const c of s.clutches) { const v = proClutch.get(c.vs) ?? [0, 0]; v[0]++; if (c.won) v[1]++; proClutch.set(c.vs, v); }
    for (const p of s.setups) if (p.at === 20 && p.place) { proSetup.set(`${p.side}|${p.place}`, (proSetup.get(`${p.side}|${p.place}`) ?? 0) + 1); proSetupTotal[p.side]++; }
  }
  const per = (x) => r2(x / base.rounds);

  // ── игрок
  const sit = situations(me);
  const mine = playerNumbers(me, i, sit);
  const myPer = (x) => r2(x / Math.max(1, mine.rounds));
  const findings = [];
  const ref = (round, t, who = name) => ({ analysis: myId, round, t, who });

  // 1. общие цифры
  const stats = {
    rounds: mine.rounds,
    kpr: [myPer(mine.kills), per(base.kills)],
    dpr: [myPer(mine.deaths), per(base.deaths)],
    adr: [Math.round(mine.damage / Math.max(1, mine.rounds)), Math.round(base.damage / base.rounds)],
    openingDeathRate: [pct(mine.openingDeaths, mine.rounds), pct(base.openingDeaths, base.rounds)],
    openingKillRate: [pct(mine.openingKills, mine.rounds), pct(base.openingKills, base.rounds)],
    traded: [pct(mine.tradedDeaths, mine.deathsCounted), pct(base.traded.T[0] + base.traded.CT[0], base.traded.T[1] + base.traded.CT[1])],
    nadesPerRound: Object.fromEntries(NADES.map((t) => [t, [myPer(mine.nades[t]), per(base.nades[t])]])),
  };

  // 2. первые смерти: где и разменяли ли
  const myOpenDeaths = sit.openings.filter((o) => o.victim === i);
  if (myOpenDeaths.length) {
    findings.push({
      topic: "opening_deaths",
      title: `Умираешь первым в раунде: ${myOpenDeaths.length} из ${mine.rounds} раундов (${stats.openingDeathRate[0]}%), у топов — ${stats.openingDeathRate[1]}% на игрока`,
      moments: myOpenDeaths.map((o) => {
        const win = knowledge?.openings?.find((x) => x.side === o.victimSide && x.from === o.victimPlace) ?? knowledge?.openings?.find((x) => x.side === o.victimSide);
        const ex = win?.examples?.[0];
        return { ...ref(o.round, o.t), place: o.victimPlace, side: o.victimSide, by: me.players[o.killer]?.name, weapon: o.weapon, rt: o.rt, pro: ex ? { analysis: ex.analysis, round: ex.round, t: ex.t, who: ex.who, from: win.from, to: win.to } : null };
      }),
      pro: knowledge?.openings?.filter((x) => myOpenDeaths.some((o) => o.victimPlace === x.to && o.victimSide !== x.side)).slice(0, 3) ?? [],
    });
  }

  // 3. неразменянные смерти
  const untraded = sit.trades.filter((t) => t.victim === i && !t.traded);
  const skMe = skillNumbers(me, i);
  findings.push({
    topic: "trades",
    title: `Твои смерти разменяли в ${stats.traded[0]}% случаев, у топов — ${stats.traded[1]}%`,
    moments: [
      ...untraded.slice(0, 8).map((t) => ({ ...ref(t.round, t.t), place: t.victimPlace, rt: t.rt })),
      // напарника убили рядом с тобой, а ты не вступил в бой с убийцей
      ...skMe.missedTrades.slice(0, 6).map((m) => {
        const r = me.rounds.find((x) => x.n === m.round);
        const p = r ? posAt(r, m.t, m.mate) : null;
        return { ...ref(m.round, m.t), kind: "missed", mate: me.players[m.mate]?.name, by: me.players[m.killer]?.name, dist: m.dist, place: p && p[9] >= 0 ? me.places[p[9]] : null, rt: r ? Math.round(((m.t - r.freezeEnd) / TR) * 10) / 10 : null };
      }),
    ],
  });

  // 4. гранаты: сколько и насколько «стандартно» (совпадает с раскидками топов)
  const lineups = knowledge?.lineups ?? [];
  const myNades = me.rounds.flatMap((r) => r.nades.filter((n) => n.p === i && NADES.includes(n.type)).map((n) => ({ ...n, round: r.n })));
  const nadeCheck = myNades.map((n) => {
    const same = lineups.filter((l) => l.side === n.side && l.type === n.type);
    const match = same.find((l) => (l.x - n.x) ** 2 + (l.y - n.y) ** 2 < 170 ** 2 && (l.fx - n.fx) ** 2 + (l.fy - n.fy) ** 2 < 300 ** 2);
    // нестандартная: ближайшая раскидка топов в то же место (куда ложится)
    const sameTarget = same.filter((l) => l.to === n.to).sort((p, q) => (p.x - n.x) ** 2 + (p.y - n.y) ** 2 - ((q.x - n.x) ** 2 + (q.y - n.y) ** 2));
    return { round: n.round, t: n.t0, type: n.type, side: n.side, from: n.from, to: n.to, rt: n.rt, standard: !!match, lineup: match?.id ?? sameTarget[0]?.id ?? null, proExample: (match ?? sameTarget[0])?.examples?.[0] ?? null };
  });
  findings.push({
    topic: "utility",
    title: `Гранаты: ${myNades.length} за ${mine.rounds} раундов (у топов ~${r2(NADES.reduce((n, t) => n + base.nades[t], 0) / base.rounds * mine.rounds)}); совпадают с раскидками топов ${nadeCheck.filter((n) => n.standard).length} из ${myNades.length}`,
    perRound: stats.nadesPerRound,
    moments: nadeCheck.map((n) => ({
      ...ref(n.round, n.t), t1: myNades.find((x) => x.round === n.round && x.t0 === n.t)?.t1, type: n.type, side: n.side, from: n.from, to: n.to, rt: n.rt, standard: n.standard, lineup: n.lineup,
      pro: n.proExample ? { analysis: n.proExample.analysis, round: n.proExample.round, t: n.proExample.t0, t1: n.proExample.t1, who: n.proExample.who } : null,
    })),
  });

  // 5. второй тайминг
  const myRe = sit.repeeks.filter((r) => r.player === i);
  if (myRe.length) {
    findings.push({
      topic: "repeeks",
      title: `Повторно выходишь в тот же угол: ${myRe.length} раз, умер в ${myRe.filter((r) => r.died).length}`,
      moments: myRe.map((r) => {
        const pr = proRepeek.get(`${r.side}|${r.place}`);
        const kr = knowledge?.repeeks?.find((x) => x.side === r.side && x.place === r.place);
        const ex = kr?.examples?.[0];
        return { ...ref(r.round, r.t), place: r.place, side: r.side, died: r.died, gotKill: r.gotKill, gap: r.gap, proDied: pr ? pct(pr[1], pr[0]) : null, proCount: pr?.[0] ?? 0, pro: ex ? { analysis: ex.analysis, round: ex.round, t: ex.t, who: ex.who } : null };
      }),
    });
  }

  // 6. клатчи
  const myCl = sit.clutches.filter((c) => c.hero === i);
  if (myCl.length) {
    findings.push({
      topic: "clutches",
      title: `Клатчи: ${myCl.filter((c) => c.won).length} из ${myCl.length}`,
      moments: myCl.map((c) => {
        const p = proClutch.get(c.vs);
        const ex = knowledge?.clutches?.find((x) => x.won && x.side === c.side && x.vs === c.vs && (x.startPlace === c.startPlace || x.route?.includes(c.startPlace))) ?? knowledge?.clutches?.find((x) => x.won && x.side === c.side && x.vs === c.vs);
        return { ...ref(c.round, c.t), end: c.end, side: c.side, vs: c.vs, won: c.won, kills: c.kills, route: c.route, nades: c.nades, proWin: p ? pct(p[1], p[0]) : null, pro: ex ? { analysis: ex.analysis, round: ex.round, t: ex.t, end: ex.end, who: ex.hero, route: ex.route, nades: ex.nades } : null };
      }),
    });
  }

  // 7. позиции на 0:20: редкие для топов места
  const mySetups = sit.setups.filter((p) => p.player === i && p.at === 20 && p.place);
  findings.push({
    topic: "positions",
    title: "Где ты стоишь на 0:20 и как часто там стоят топы",
    moments: mySetups.map((p) => {
      const r = me.rounds.find((x) => x.n === p.round);
      return { ...ref(p.round, r ? r.freezeEnd + 20 * TR : 0), side: p.side, place: p.place, proShare: pct(proSetup.get(`${p.side}|${p.place}`) ?? 0, proSetupTotal[p.side]) };
    }),
  });

  // 9. стрельба, флешки, гранаты, экономика
  const sk = skMe;
  const acc = (h, s) => pct(h, s);
  const both = (f) => [f(sk), f(proSkill)];
  const div = (n, d, k = 100) => (d ? Math.round((n / d) * k * 10) / 10 : null);
  const skill = {
    accuracy: both((x) => div(x.hits, x.shots)),
    hs: both((x) => div(x.headHits, x.bodyHits)),
    firstBullet: both((x) => div(x.firstHits, x.firstShots)),
    spray: both((x) => div(x.sprayHits, x.sprayShots)),
    counterStrafe: both((x) => div(x.strafeGood, x.strafeShots)),
    ttd: both((x) => (x.ttd.length >= 3 ? Math.round(median(x.ttd)) : null)),
    crosshair: both((x) => (x.xhair.length >= 3 ? Math.round(median(x.xhair) * 10) / 10 : null)),
    shotsPerKill: both((x) => (x.gunKills ? r2(x.shots / x.gunKills) : null)),
    enemiesPerFlash: both((x) => (x.flashes ? r2(x.flashEnemies / x.flashes) : null)),
    blindSecPerFlash: both((x) => (x.flashBlinding ? r2(x.flashEnemySec / x.flashBlinding) : null)),
    teamFlashPct: both((x) => div(x.flashTeam, x.flashes)),
    flashKillPct: both((x) => div(x.flashKills, x.flashes)),
    heDmg: both((x) => (x.he ? Math.round(x.heDmg / x.he) : null)),
    mollyDmg: both((x) => (x.molly ? Math.round(x.mollyDmg / x.molly) : null)),
    utilOnDeath: both((x) => (x.deaths ? Math.round(x.utilOnDeath / x.deaths) : null)),
    ctSmokeStop: both((x) => div(x.ctSmokesGood, x.ctSmokes)),
    tradeAttempt: both((x) => div(x.tradeTry, x.tradeOpp)),
    tradeSuccess: both((x) => div(x.tradeWin, x.tradeOpp)),
    tradedAttempt: both((x) => div(x.tradedTry, x.tradedOpp)),
    tradedSuccess: both((x) => div(x.tradedWin, x.tradedOpp)),
    samples: { ttd: sk.ttd.length, strafe: sk.strafeShots, tradeOpp: sk.tradeOpp, ctSmokes: sk.ctSmokes },
  };
  findings.push({
    topic: "aim",
    title: `Стрельба: точность в бою ${skill.accuracy[0]}% (у топов ${skill.accuracy[1]}%), в голову ${skill.hs[0]}% (${skill.hs[1]}%), контрстрейф ${skill.counterStrafe[0] ?? "—"}% (${skill.counterStrafe[1] ?? "—"}%), время до урона ${skill.ttd[0] ?? "—"} мс (${skill.ttd[1] ?? "—"} мс)`,
    skill,
    moments: sk.missDeaths.map((d) => ({ ...ref(d.round, d.t), shots: d.shots, by: me.players[d.by]?.name })),
  });
  if (sk.flashes) {
    findings.push({
      topic: "flashes",
      title: `Флешки: ${sk.flashes} шт., ослепляют в среднем ${skill.enemiesPerFlash[0]} врага (у топов ${skill.enemiesPerFlash[1]}), своих — в ${skill.teamFlashPct[0]}% флешек (${skill.teamFlashPct[1]}%)`,
      skill,
      moments: sk.badFlashes.map((f) => {
        const ln = (knowledge?.lineups ?? []).find((l) => l.type === "flash" && l.side === f.side && l.to === f.to) ?? (knowledge?.lineups ?? []).find((l) => l.type === "flash" && l.side === f.side && l.from === f.from);
        const ex = ln?.examples?.[0];
        return { ...ref(f.round, f.t), t1: f.t1, side: f.side, from: f.from, to: f.to, team: f.team, self: f.self, enemies: f.enemies, pro: ex ? { analysis: ex.analysis, round: ex.round, t: ex.t0, t1: ex.t1, who: ex.who } : null };
      }),
    });
  }
  findings.push({
    topic: "economy",
    title: sk.econ.length ? `Экономика: ${sk.econ.length} раз(а) закупка не совпала с командой` : "Экономика: закупаешься вместе с командой",
    moments: sk.econ.map((e) => {
      const r = me.rounds.find((x) => x.n === e.round);
      return { ...ref(e.round, r ? r.freezeEnd : 0), side: e.side, kind: e.kind, equip: e.equip, money: e.money, teamAvg: e.teamAvg, won: e.won };
    }),
  });

  // 10. история каждого раунда: закупка, маршрут по карте, контакт, гранаты, убийства и смерть, кто был рядом,
  // где стояли топы на этой стороне в это время — то, из чего тренер пишет «как ты играл карту»
  const NADE_RU = { smoke: "смок", flash: "флешка", molotov: "молотов", he: "HE" };
  const BUY_RU = { pistol: "пистолетный", full: "полная закупка", force: "форс", semi: "полуэко", eco: "эко" };
  const proTop = (side) => [...proSetup.entries()].filter(([k]) => k.startsWith(`${side}|`)).sort((x, y) => y[1] - x[1]).slice(0, 6).map(([k, n]) => ({ place: k.split("|")[1], share: pct(n, proSetupTotal[side]) }));
  const tagsOf = new Map();
  const tag = (round, text) => { if (!tagsOf.has(round)) tagsOf.set(round, []); if (!tagsOf.get(round).includes(text)) tagsOf.get(round).push(text); };
  for (const o of sit.openings) { if (o.victim === i) tag(o.round, "умер первым"); if (o.killer === i) tag(o.round, "первое убийство"); }
  for (const t of untraded) tag(t.round, "смерть без размена");
  for (const m of sk.missedTrades) tag(m.round, "упустил размен");
  for (const d of sk.missDeaths) tag(d.round, "умер после очереди мимо");
  for (const f of sk.badFlashes) tag(f.round, f.team || f.self ? "флешка по своим" : "флешка в никуда");
  for (const e of sk.econ) tag(e.round, e.kind === "force_alone" ? "форс в одного" : e.kind === "save_alone" ? "сейв в одного" : "недокуп");
  for (const c of sit.clutches.filter((c) => c.hero === i)) tag(c.round, `клатч 1v${c.vs} — ${c.won ? "вытащил" : "проиграл"}`);
  for (const r of myRe) tag(r.round, r.died ? "повторный выход — умер" : "повторный выход");
  const rt = (r, tick) => Math.round(((tick - r.freezeEnd) / TR) * 10) / 10;
  const roundsStory = [];
  for (const r of me.rounds) {
    const start = frameAt(r, r.freezeEnd);
    const meStart = start?.[1].find((q) => q[0] === i);
    if (!meStart) continue;
    const side = meStart[1] === 0 ? "T" : "CT";
    const death = r.kills.find((k) => k.v === i);
    const until = death ? death.t : r.end;
    // маршрут: места, где пробыл от 1.5 с (или последнее), со временем входа
    const route = [];
    let cur = null;
    for (const [t, l] of r.frames) {
      if (t < r.freezeEnd || t > until) continue;
      const q = l.find((x) => x[0] === i);
      if (!q || q[6] <= 0 || q[9] == null || q[9] < 0) continue;
      const place = me.places[q[9]];
      if (!cur || cur.place !== place) { cur = { place, from: t, to: t }; route.push(cur); }
      else cur.to = t;
    }
    const steps = route.filter((x, k) => x.to - x.from >= 1.5 * TR || k === route.length - 1 || k === 0).reduce((acc, x) => (acc.length && acc[acc.length - 1].place === x.place ? acc : [...acc, x]), []).slice(0, 10).map((x) => ({ place: x.place, at: rt(r, x.from) }));
    // первый контакт: первый урон от огнестрела — нанёс или получил
    const contact = (r.hurts ?? []).filter((h) => (h[1] === i || h[2] === i) && h[1] != null && h[1] !== h[2] && GUN(h[5])).sort((x, y) => x[0] - y[0])[0];
    const contactPos = contact ? posAt(r, contact[0], i) : null;
    const dealt = (r.hurts ?? []).filter((h) => h[1] === i && h[2] !== i).reduce((x, h) => x + Math.min(100, h[3]), 0);
    const kills = r.kills.filter((k) => k.a === i && k.v !== i).map((k) => ({ at: rt(r, k.t), victim: me.players[k.v]?.name, weapon: k.w, hs: k.hs }));
    let deathInfo = null;
    if (death) {
      const dp = posAt(r, death.t - 8, i);
      const mates = (frameAt(r, death.t)?.[1] ?? []).filter((q) => q[0] !== i && q[1] === meStart[1] && q[6] > 0);
      const nearest = dp && mates.length ? Math.min(...mates.map((q) => Math.hypot(q[2] - dp[2], q[3] - dp[3]))) : null;
      deathInfo = {
        at: rt(r, death.t), place: dp && dp[9] >= 0 ? me.places[dp[9]] : null, by: me.players[death.a]?.name ?? null, weapon: death.w,
        traded: !untraded.some((u) => u.round === r.n && u.t === death.t), nearestMate: nearest != null ? Math.round(nearest / 100) : null, util: death.util ?? null, alive: mates.length,
      };
    }
    const nades = r.nades.filter((n) => n.p === i && NADE_RU[n.type]).map((n) => ({ type: NADE_RU[n.type], from: n.from, to: n.to, at: n.rt, enemies: n.type === "flash" ? (n.blind ?? []).filter(([p, d, own]) => !own && p !== i && d > 1.1).length : undefined }));
    const fights = [];
    const foes = new Set((r.hurts ?? []).filter((h) => GUN(h[5]) && h[1] != null && h[1] !== h[2] && (h[1] === i || h[2] === i)).map((h) => (h[1] === i ? h[2] : h[1])));
    for (const e of foes) {
      const hs = (r.hurts ?? []).filter((h) => GUN(h[5]) && ((h[1] === i && h[2] === e) || (h[1] === e && h[2] === i))).sort((x, y) => x[0] - y[0]);
      const from = hs[0][0] - TR, to = hs[hs.length - 1][0];
      const myShots = (r.shots ?? []).filter((x) => x[1] === i && x[0] >= from && x[0] <= to + 8);
      const myHits = hs.filter((h) => h[1] === i);
      const theirHits = hs.filter((h) => h[1] === e);
      const iKilled = r.kills.some((k) => k.a === i && k.v === e && k.t >= from && k.t <= to + 16);
      const iDied = r.kills.some((k) => k.a === e && k.v === i && k.t >= from && k.t <= to + 16);
      const rifle = myShots.filter((x) => x[2] != null && RIFLE_MAX[x[5]] && !x[4]);
      const duel = (r.duels ?? []).find((d) => d[0] === i && d[1] === e);
      const fp = posAt(r, hs[0][0], i);
      fights.push({
        at: rt(r, hs[0][0]), enemy: me.players[e]?.name ?? "?", place: fp && fp[9] >= 0 ? me.places[fp[9]] : null,
        shots: myShots.length, hits: myHits.length, head: myHits.filter((h) => h[4] === "head").length, dmg: myHits.reduce((x, h) => x + Math.min(100, h[3]), 0),
        took: theirHits.reduce((x, h) => x + Math.min(100, h[3]), 0), firstHit: hs[0][1] === i ? "ты" : "враг",
        result: iKilled ? "убил" : iDied ? "умер" : "разошлись",
        moving: rifle.length ? rifle.filter((x) => x[2] >= RIFLE_MAX[x[5]] * 0.34).length : null, rifleShots: rifle.length,
        ttd: duel && duel[3] != null ? Math.round(((duel[2] - duel[3]) / TR) * 1000) : null, aimDeg: duel?.[4] ?? null,
      });
    }
    fights.sort((x, y) => x.at - y.at);
    const pos20 = sit.setups.find((x) => x.player === i && x.round === r.n && x.at === 20);
    const econ = r.econ.find((e) => e.p === i);
    roundsStory.push({
      n: r.n, side, won: r.winner === side, buy: BUY_RU[r[`buy${side}`]] ?? null, equip: econ?.equip ?? null,
      route: steps, at20: pos20?.place ?? null, at20Pro: pos20?.place ? pct(proSetup.get(`${side}|${pos20.place}`) ?? 0, proSetupTotal[side]) : null,
      contact: contact ? { at: rt(r, contact[0]), place: contactPos && contactPos[9] >= 0 ? me.places[contactPos[9]] : null, first: contact[1] === i ? "нанёс урон" : "получил урон" } : null,
      kills, damage: dealt, nades, fights, death: deathInfo, survived: !death,
      bomb: r.bomb?.planted?.p === i ? "заложил бомбу" : r.bomb?.defused?.p === i ? "разминировал" : null,
      tags: tagsOf.get(r.n) ?? [],
      start: r.freezeEnd, end: Math.min(r.end + 2 * TR, (death?.t ?? r.end) + 3 * TR),
    });
  }
  const proSetups = { T: proTop("T"), CT: proTop("CT") };
  const mm = (x) => { const v = Math.max(0, Math.round(x)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
  for (const x of roundsStory) {
    const parts = [];
    parts.push(`${x.side === "T" ? "Атака" : "Защита"}${x.buy ? `, ${x.buy}` : ""}${x.equip ? ` ($${x.equip})` : ""}.`);
    if (x.route.length) parts.push(`Путь: ${x.route.map((s) => `${s.place} (${mm(s.at)})`).join(" → ")}.`);
    if (x.at20 && x.at20Pro != null) parts.push(x.at20Pro < 3 ? `На 0:20 стоял на ${x.at20} — топы на этой стороне там почти не стоят (${x.at20Pro}%).` : `На 0:20 — ${x.at20}, обычная позиция для топов (${x.at20Pro}%).`);
    if (x.nades.length) parts.push(`Гранаты: ${x.nades.map((n) => `${n.type} ${n.from ?? "?"} → ${n.to ?? "?"}${n.enemies != null ? ` (ослепил ${n.enemies})` : ""}`).join(", ")}.`);
    else if (x.buy && x.buy !== "эко" && x.buy !== "пистолетный") parts.push("Гранат не бросал.");
    for (const f of x.fights) {
      let t = `${mm(f.at)} перестрелка с ${f.enemy}${f.place ? ` на ${f.place}` : ""}: ${f.shots} выстр., попал ${f.hits}${f.head ? ` (в голову ${f.head})` : ""}, урон ${f.dmg}, получил ${f.took} — ${f.result}.`;
      if (f.firstHit === "враг" && f.result === "умер") t += " Враг попал первым.";
      if (f.moving != null && f.rifleShots >= 3 && f.moving / f.rifleShots > 0.5) t += ` Стрелял на ходу (${f.moving} из ${f.rifleShots} выстрелов).`;
      if (f.ttd != null) t += ` От появления врага до попадания — ${f.ttd} мс.`;
      if (f.shots >= 6 && f.hits === 0) t += " Ни одного попадания — зажим вместо коротких очередей.";
      parts.push(t);
    }
    if (x.kills.length) parts.push(`Убил: ${x.kills.map((k) => `${k.victim}${k.hs ? " в голову" : ""}`).join(", ")}.`);
    if (x.death) {
      let d = `Умер на ${mm(x.death.at)}${x.death.place ? ` на ${x.death.place}` : ""} от ${x.death.by ?? "?"}`;
      if (x.death.nearestMate != null) d += x.death.nearestMate >= 15 ? ` — ближайший свой в ${x.death.nearestMate} м, разменять было некому` : ` — свой был в ${x.death.nearestMate} м`;
      d += x.death.traded ? ", тебя разменяли." : ", без размена.";
      if (x.death.util) d += ` Не использовал гранат на $${x.death.util}.`;
      parts.push(d);
    } else parts.push("Выжил.");
    if (x.bomb) parts.push(`${x.bomb[0].toUpperCase()}${x.bomb.slice(1)}.`);
    parts.push(x.won ? "Раунд выигран." : "Раунд проигран.");
    x.text = parts.join(" ");
  }

  // 8. хайлайты: мультикиллы, выигранные клатчи, первые убийства, хедшоты — лучшие моменты игрока
  const highlights = [];
  for (const r of me.rounds) {
    const ks = r.kills.filter((k) => k.a === i && k.v !== i).sort((x, y) => x.t - y.t);
    if (ks.length >= 3) {
      const hs = ks.filter((k) => k.hs).length;
      highlights.push({ kind: ks.length >= 5 ? "ace" : `${ks.length}k`, score: ks.length * 10 + hs * 2, round: r.n, t: ks[0].t, end: ks[ks.length - 1].t, kills: ks.length, hs, weapons: [...new Set(ks.map((k) => k.w))], title: `${ks.length >= 5 ? "ЭЙС" : `${ks.length}K`} в раунде ${r.n}${hs ? ` · ${hs} в голову` : ""}` });
    }
  }
  for (const c of sit.clutches.filter((c) => c.hero === i && c.won && c.vs >= 1)) {
    highlights.push({ kind: "clutch", score: 15 + c.vs * 8, round: c.round, t: c.t, end: c.end, kills: c.kills, title: `Клатч 1 против ${c.vs} — вытащил (раунд ${c.round})` });
  }
  for (const o of sit.openings.filter((o) => o.killer === i)) {
    if (highlights.some((h) => h.round === o.round)) continue;
    highlights.push({ kind: "entry", score: 6 + (o.hs ? 2 : 0), round: o.round, t: o.t, end: o.t, kills: 1, title: `Первое убийство раунда ${o.round}: ${o.victimPlace ? o.victimPlace : ""} ${o.hs ? "· в голову" : ""}`.trim() });
  }
  highlights.sort((x, y) => y.score - x.score);
  const top = highlights.slice(0, 8).map((h) => ({ ...h, ...ref(h.round, h.t) }));

  return { v: 3, skill, rounds: roundsStory, proSetups, map: me.map, player: { name, steamid, index: i }, analysis: myId, proMaps: pros.length, stats, findings, highlights: top };
}

if (process.argv[1]?.endsWith("coach.mjs")) {
  const [, , id, steamid] = process.argv;
  const out = coach(id, steamid);
  if (process.argv.includes("--upload")) {
    const cfg = JSON.parse(readFileSync(process.env.F16_AGENT_JSON ?? "D:/cs2server/f16/agent.json", "utf8").replace(/^\uFEFF/, ""));
    const site = (process.env.F16_SITE_URL ?? cfg.siteUrl ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
    const r = await fetch(`${site}/api/agent/analysis/coach?analysis=${id}&steamid=${steamid}${process.argv.includes("--no-notify") ? "&notify=0" : ""}`, { method: "PUT", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/gzip" }, body: zlib.gzipSync(JSON.stringify(out)) });
    console.log(r.ok ? "✓ разбор игрока загружен на сайт" : `✗ загрузка: HTTP ${r.status} ${await r.text()}`);
  }
  const j = process.argv.indexOf("--json");
  if (j > 0) writeFileSync(process.argv[j + 1], JSON.stringify(out, null, 1));
  const s = out.stats;
  console.log(`${out.player.name} · ${out.map} · ${s.rounds} раундов · сравнение с ${out.proMaps} картами топов`);
  console.log(`убийств/раунд ${s.kpr[0]} (топы ${s.kpr[1]}) · смертей/раунд ${s.dpr[0]} (${s.dpr[1]}) · ADR ${s.adr[0]} (${s.adr[1]}) · первый убил ${s.openingKillRate[0]}% (${s.openingKillRate[1]}%) · первым умер ${s.openingDeathRate[0]}% (${s.openingDeathRate[1]}%) · размены ${s.traded[0]}% (${s.traded[1]}%)`);
  console.log("гранаты за раунд (ты / топы):", Object.entries(s.nadesPerRound).map(([t, [a, b]]) => `${t} ${a}/${b}`).join(", "));
  for (const f of out.findings) {
    console.log(`\n• ${f.title}`);
    for (const m of f.moments.slice(0, 12)) console.log("   ", JSON.stringify({ ...m, analysis: undefined, who: undefined, pro: m.pro ? `${m.pro.who} р${m.pro.round}` : undefined }));
  }
}
