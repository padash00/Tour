// «Обучение»: из всех разобранных про-демок (cache/, kind = pro) собирает библиотеку по каждой карте и загружает на сайт.
//   node learn.mjs [--dry]
// Сейчас: раскидки — похожие броски одной гранаты (откуда стоял, куда легла) объединяются в одну раскидку,
// считается, как часто её кидают (в % раундов за сторону), на какой секунде, кто из про и примеры моментов.
// Каждая новая про-демка пополняет библиотеку: запустите learn.mjs снова.
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import zlib from "node:zlib";

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
  const knowledge = { v: 1, map, at: new Date().toISOString(), demos: list.length, rounds: roundsBySide, throws: throws.length, callouts: list[0].a.callouts, lineups };
  const gz = zlib.gzipSync(JSON.stringify(knowledge), { level: 9 });
  const top = lineups.slice(0, 5).map((l) => `${l.side} ${l.type} ${l.from}→${l.to} ×${l.count}`).join("; ");
  console.log(`${map}: демок ${list.length}, бросков ${throws.length}, раскидок ${lineups.length} (${(gz.length / 1e3).toFixed(0)} КБ). Чаще всего: ${top}`);
  if (dry) {
    writeFileSync(path.join(CACHE, `knowledge-${map}.json`), JSON.stringify(knowledge, null, 1));
    continue;
  }
  const site = (process.env.F16_SITE_URL ?? cfg.siteUrl ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
  const r = await fetch(`${site}/api/agent/analysis/knowledge?map=${map}`, { method: "PUT", headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/gzip" }, body: gz });
  if (!r.ok) console.error(`  ✗ загрузка: HTTP ${r.status} ${await r.text()}`);
  else console.log("  ✓ загружено на сайт");
}
