// «Обучение»: из всех разобранных про-демок (cache/, kind = pro) собирает библиотеку по каждой карте и загружает на сайт.
//   node learn.mjs [--dry]
// Сейчас: раскидки — похожие броски одной гранаты (откуда стоял, куда легла) объединяются в одну раскидку,
// считается, как часто её кидают (в % раундов за сторону), на какой секунде, кто из про и примеры моментов.
// Каждая новая про-демка пополняет библиотеку: запустите learn.mjs снова.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";
import { situations } from "./situations.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const CACHE = path.join(HERE, "cache");
const INDEX = path.join(CACHE, "index.json");
const dry = process.argv.includes("--dry");
const cfg = JSON.parse(readFileSync(process.env.F16_AGENT_JSON ?? "D:/cs2server/f16/agent.json", "utf8").replace(/^\uFEFF/, ""));

const LAND = 170; // граната легла в пределах ~1.7 м — та же точка
const STAND = 260; // бросали с одного места (±2.6 м)
const TYPES = ["smoke", "flash", "molotov", "he"];

if (!existsSync(INDEX)) {
  console.error("Нет разборов в cache/. Сначала: node upload.mjs <папка с демками>");
  process.exit(1);
}
const index = JSON.parse(readFileSync(INDEX, "utf8"));
const byMap = new Map();
for (const [id, meta] of Object.entries(index)) {
  if (meta.kind !== "pro") continue;
  const file = path.join(CACHE, `${id}.json.gz`);
  if (!existsSync(file)) continue;
  const a = JSON.parse(zlib.gunzipSync(readFileSync(file)).toString());
  if ((a.v ?? 1) < 3) {
    console.log(`пропуск ${meta.title}: старый разбор (без мест у гранат) — перезапустите upload.mjs`);
    continue;
  }
  if (!byMap.has(a.map)) byMap.set(a.map, []);
  byMap.get(a.map).push({ id, a });
}

const median = (xs) => { const s = [...xs].sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : null; };
const d2 = (ax, ay, bx, by) => (ax - bx) ** 2 + (ay - by) ** 2;

for (const [map, list] of byMap) {
  // раунды за каждую сторону — знаменатель для «как часто»
  const roundsBySide = { T: 0, CT: 0 };
  const throws = [];
  for (const { id, a } of list) {
    roundsBySide.T += a.rounds.length; // в каждом раунде обе стороны есть: каждая команда играет и T, и CT
    roundsBySide.CT += a.rounds.length;
    for (const r of a.rounds) {
      for (const n of r.nades) {
        if (!TYPES.includes(n.type) || !n.side || n.fx == null || n.x == null) continue;
        if (n.rt < -2) continue; // брошена в закупку — случайность
        throws.push({ ...n, analysis: id, round: r.n, who: n.p != null ? a.players[n.p]?.name : null, team: n.p != null ? a.teams[a.players[n.p]?.team] : null });
      }
    }
  }
  // кластеры: сначала по стороне и типу, затем жадно — по точке падения и месту броска
  const lineups = [];
  for (const side of ["T", "CT"]) {
    for (const type of TYPES) {
      const pool = throws.filter((t) => t.side === side && t.type === type);
      const clusters = [];
      for (const t of pool) {
        const c = clusters.find((c) => d2(c.x, c.y, t.x, t.y) < LAND ** 2 && d2(c.fx, c.fy, t.fx, t.fy) < STAND ** 2);
        if (c) {
          c.items.push(t);
          const k = c.items.length;
          c.x += (t.x - c.x) / k; c.y += (t.y - c.y) / k; c.fx += (t.fx - c.fx) / k; c.fy += (t.fy - c.fy) / k;
        } else clusters.push({ x: t.x, y: t.y, fx: t.fx, fy: t.fy, items: [t] });
      }
      for (const c of clusters) {
        if (c.items.length < 2) continue; // одиночный бросок — не раскидка
        const most = (key) => { const m = new Map(); for (const t of c.items) if (t[key]) m.set(t[key], (m.get(t[key]) ?? 0) + 1); return [...m.entries()].sort((a, b) => b[1] - a[1]); };
        const pros = most("who").slice(0, 5).map(([name, n]) => ({ name, n }));
        // примеры: лучший бросок — ближе всего к центру раскидки; разные игроки
        const ex = [...c.items].sort((p, q) => d2(p.x, p.y, c.x, c.y) - d2(q.x, q.y, c.x, c.y));
        const seen = new Set();
        const examples = [];
        for (const t of ex) {
          if (examples.length >= 6) break;
          if (seen.has(t.who) && examples.length < 3) continue;
          seen.add(t.who);
          examples.push({ analysis: t.analysis, round: t.round, t0: t.t0, t1: t.t1, rt: t.rt, who: t.who, team: t.team, fx: t.fx, fy: t.fy, path: t.path });
        }
        lineups.push({
          id: `${side}-${type}-${lineups.length}`,
          side, type,
          from: most("from")[0]?.[0] ?? null,
          to: most("to")[0]?.[0] ?? null,
          x: Math.round(c.x), y: Math.round(c.y), fx: Math.round(c.fx), fy: Math.round(c.fy),
          count: c.items.length,
          rate: Math.round((c.items.length / roundsBySide[side]) * 1000) / 10, // % раундов за сторону
          rt: median(c.items.map((t) => t.rt)),
          pros,
          examples,
        });
      }
    }
  }
  lineups.sort((a, b) => b.count - a.count);

  // ── ситуации: первые дуэли, размены, клатчи, второй тайминг, позиции на 0:20/0:40
  const sit = { openings: [], trades: [], clutches: [], repeeks: [], setups: [] };
  for (const { id, a } of list) {
    const s = situations(a);
    const who = (i) => (i != null ? a.players[i]?.name ?? null : null);
    const team = (i) => (i != null ? a.teams[a.players[i]?.team] ?? null : null);
    for (const o of s.openings) sit.openings.push({ ...o, analysis: id, killerName: who(o.killer), victimName: who(o.victim), team: team(o.killer) });
    for (const t of s.trades) sit.trades.push({ side: t.victimSide, place: t.victimPlace, traded: t.traded, tradeS: t.tradeS });
    for (const c of s.clutches) sit.clutches.push({ ...c, analysis: id, heroName: who(c.hero), team: team(c.hero) });
    for (const r of s.repeeks) sit.repeeks.push({ ...r, analysis: id, playerName: who(r.player) });
    for (const p of s.setups) sit.setups.push({ at: p.at, side: p.side, place: p.place, x: p.x, y: p.y });
  }
  const groupBy = (xs, key) => { const m = new Map(); for (const x of xs) { const k = key(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);
  const ex = (xs, n = 5) => xs.slice(0, n);

  // первые дуэли: где открывают раунд (место стрелявшего → место жертвы), как часто и сколько раундов потом выигрывают
  const openings = [...groupBy(sit.openings.filter((o) => o.killerSide && o.killerPlace && o.victimPlace), (o) => `${o.killerSide}|${o.killerPlace}|${o.victimPlace}`).values()]
    .map((g) => ({
      side: g[0].killerSide, from: g[0].killerPlace, to: g[0].victimPlace, count: g.length,
      roundWin: pct(g.filter((o) => o.roundWonByKiller).length, g.length), rt: median(g.map((o) => o.rt)),
      pros: [...groupBy(g, (o) => o.killerName).entries()].map(([name, xs]) => ({ name, n: xs.length })).sort((x, y) => y.n - x.n).slice(0, 4),
      examples: ex(g.map((o) => ({ analysis: o.analysis, round: o.round, t: o.t, who: o.killerName, victim: o.victimName, weapon: o.weapon }))),
    }))
    .filter((g) => g.count >= 2)
    .sort((x, y) => y.count - x.count);

  // размены: доля смертей, за которые отомстили за 3 с — по стороне и месту смерти
  const trades = { T: pct(sit.trades.filter((t) => t.side === "T" && t.traded).length, sit.trades.filter((t) => t.side === "T").length), CT: pct(sit.trades.filter((t) => t.side === "CT" && t.traded).length, sit.trades.filter((t) => t.side === "CT").length) };
  const tradeByPlace = [...groupBy(sit.trades.filter((t) => t.place && t.side), (t) => `${t.side}|${t.place}`).values()]
    .filter((g) => g.length >= 4)
    .map((g) => ({ side: g[0].side, place: g[0].place, deaths: g.length, traded: pct(g.filter((t) => t.traded).length, g.length) }))
    .sort((x, y) => y.deaths - x.deaths);

  // клатчи: итог по 1v1…1v5 и сами клатчи (выигранные — примеры, как играют)
  const clutchStats = [1, 2, 3, 4, 5].map((vs) => { const g = sit.clutches.filter((c) => c.vs === vs); return { vs, count: g.length, won: g.filter((c) => c.won).length }; });
  const clutches = sit.clutches
    .filter((c) => c.vs <= 3)
    .sort((x, y) => Number(y.won) - Number(x.won) || y.vs - x.vs)
    .slice(0, 60)
    .map((c) => ({ analysis: c.analysis, round: c.round, t: c.t, end: c.end, side: c.side, vs: c.vs, won: c.won, kills: c.kills, hero: c.heroName, team: c.team, route: c.route, nades: c.nades, bombPlanted: c.bombPlanted, startPlace: c.startPlace }));

  // второй тайминг: повторный выход в тот же угол — где, как часто это кончается смертью и как часто убийством
  const repeeks = [...groupBy(sit.repeeks.filter((r) => r.place && r.side), (r) => `${r.side}|${r.place}`).values()]
    .filter((g) => g.length >= 3)
    .map((g) => ({
      side: g[0].side, place: g[0].place, count: g.length, died: pct(g.filter((r) => r.died).length, g.length), killed: pct(g.filter((r) => r.gotKill).length, g.length),
      gap: median(g.map((r) => r.gap)),
      examples: ex(g.filter((r) => r.gotKill).map((r) => ({ analysis: r.analysis, round: r.round, t: r.t, who: r.playerName }))),
    }))
    .sort((x, y) => y.count - x.count);

  // позиции: где стоят игроки на 0:20 и 0:40 (доля игроко-раундов за сторону)
  const setups = [];
  for (const at of [20, 40]) {
    for (const side of ["T", "CT"]) {
      const g = sit.setups.filter((p) => p.at === at && p.side === side && p.place);
      const byPlace = [...groupBy(g, (p) => p.place).entries()].map(([place, xs]) => ({ place, share: pct(xs.length, g.length) })).sort((x, y) => y.share - x.share);
      setups.push({ at, side, total: g.length, places: byPlace, dots: g.filter((_, i) => i % 3 === 0).map((p) => [p.x, p.y]) });
    }
  }

  const knowledge = {
    v: 2, map, at: new Date().toISOString(), demos: list.length, rounds: roundsBySide, throws: throws.length, callouts: list[0].a.callouts,
    lineups, openings, trades, tradeByPlace, clutchStats, clutches, repeeks, setups,
  };
  const gz = zlib.gzipSync(JSON.stringify(knowledge), { level: 9 });
  const top = lineups.slice(0, 5).map((l) => `${l.side} ${l.type} ${l.from}→${l.to} ×${l.count}`).join("; ");
  console.log(`${map}: демок ${list.length}, бросков ${throws.length}, раскидок ${lineups.length}, первых дуэлей ${openings.length}, клатчей ${sit.clutches.length}, выходов в тот же угол ${sit.repeeks.length}, размены T ${trades.T}% CT ${trades.CT}% (${(gz.length / 1e3).toFixed(0)} КБ). Раскидки: ${top}`);
  // локальная копия — для разбора игроков (coach.mjs) на этом ПК
  writeFileSync(path.join(CACHE, `knowledge-${map}.json`), JSON.stringify(knowledge));
  if (dry) continue;
  const site = (process.env.F16_SITE_URL ?? cfg.siteUrl ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
  const r = await fetch(`${site}/api/agent/analysis/knowledge?map=${map}`, { method: "PUT", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/gzip" }, body: gz });
  if (!r.ok) console.error(`  ✗ загрузка: HTTP ${r.status} ${await r.text()}`);
  else console.log("  ✓ загружено на сайт");
}
