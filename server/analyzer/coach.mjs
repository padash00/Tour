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
  const base = { rounds: 0, kills: 0, deaths: 0, damage: 0, openingDeaths: 0, openingKills: 0, nades: Object.fromEntries(NADES.map((t) => [t, 0])), traded: { T: [0, 0], CT: [0, 0] } };
  const proRepeek = new Map(); // место → [выходов, смертей]
  const proClutch = new Map(); // vs → [клатчей, побед]
  const proSetup = new Map(); // side|place → доля
  const proSetupTotal = { T: 0, CT: 0 };
  for (const { a } of pros) {
    const s = situations(a);
    for (let p = 0; p < a.players.length; p++) {
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
  findings.push({
    topic: "trades",
    title: `Твои смерти разменяли в ${stats.traded[0]}% случаев, у топов — ${stats.traded[1]}%`,
    moments: untraded.slice(0, 8).map((t) => ({ ...ref(t.round, t.t), place: t.victimPlace, rt: t.rt })),
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

  return { v: 1, map: me.map, player: { name, steamid, index: i }, analysis: myId, proMaps: pros.length, stats, findings };
}

if (process.argv[1]?.endsWith("coach.mjs")) {
  const [, , id, steamid] = process.argv;
  const out = coach(id, steamid);
  if (process.argv.includes("--upload")) {
    const cfg = JSON.parse(readFileSync(process.env.F16_AGENT_JSON ?? "D:/cs2server/f16/agent.json", "utf8").replace(/^\uFEFF/, ""));
    const site = (process.env.F16_SITE_URL ?? cfg.siteUrl ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
    const r = await fetch(`${site}/api/agent/analysis/coach?analysis=${id}&steamid=${steamid}`, { method: "PUT", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/gzip" }, body: zlib.gzipSync(JSON.stringify(out)) });
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
