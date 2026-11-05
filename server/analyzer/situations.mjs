// Поиск игровых ситуаций в разборе демки (analyze.mjs, v3): первые дуэли, размены, клатчи 1vX,
// второй тайминг (повторный выход в тот же угол), позиции на 0:20 и 0:40. Чистые функции — без файлов и сети.
// Одинаково работает для про-демок (библиотека «как играют про») и для демок наших игроков (сравнение).

const TR = 64;
const TRADE_S = 3; // напарник отомстил за 3 с — размен
const REPEEK_GAP_S = [0.6, 6]; // пауза между выходами: от 0.6 до 6 с
const REPEEK_SPOT = 220; // выглянул снова с того же места (±2.2 м)
const REPEEK_DEATH_S = 2.5; // умер в первые 2.5 с после повторного выхода

/** Кадр на тик (ближайший не позже) */
function frameAt(r, tick) {
  let lo = 0, hi = r.frames.length - 1;
  if (hi < 0) return null;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (r.frames[mid][0] <= tick) lo = mid;
    else hi = mid - 1;
  }
  return r.frames[lo];
}
const posOf = (r, tick, i) => frameAt(r, tick)?.[1].find((p) => p[0] === i) ?? null;
const sideOfP = (p) => (p ? (p[1] === 0 ? "T" : "CT") : null);
const placeName = (a, p) => (p && p[9] != null && p[9] >= 0 ? a.places[p[9]] : null);
const sec = (r, tick) => Math.round(((tick - r.freezeEnd) / TR) * 10) / 10;

export function situations(a) {
  const out = { openings: [], trades: [], clutches: [], repeeks: [], setups: [] };
  for (const r of a.rounds) {
    if (!r.frames.length) continue;
    const kills = [...r.kills].sort((x, y) => x.t - y.t);
    const winnerSide = r.winner;

    // ── первая дуэль раунда
    const first = kills.find((k) => k.a != null && k.a !== k.v);
    if (first) {
      const pa = posOf(r, first.t, first.a), pv = posOf(r, first.t, first.v);
      out.openings.push({
        round: r.n, t: first.t, rt: sec(r, first.t),
        killer: first.a, victim: first.v, killerSide: sideOfP(pa), victimSide: first.vs ?? sideOfP(pv),
        killerPlace: placeName(a, pa), victimPlace: placeName(a, pv), weapon: first.w, hs: first.hs,
        roundWonByKiller: winnerSide && sideOfP(pa) ? winnerSide === sideOfP(pa) : null,
      });
    }

    // ── размены: за смерть отомстили за 3 с
    for (const k of kills) {
      if (k.a == null || k.a === k.v) continue;
      const victimSide = k.vs ?? sideOfP(posOf(r, k.t - 8, k.v));
      const revenge = kills.find((x) => x.t > k.t && x.t - k.t <= TRADE_S * TR && x.v === k.a && x.a != null && x.a !== k.v);
      out.trades.push({
        round: r.n, t: k.t, rt: sec(r, k.t), victim: k.v, victimSide, killer: k.a,
        traded: !!revenge, tradeBy: revenge?.a ?? null, tradeS: revenge ? Math.round(((revenge.t - k.t) / TR) * 10) / 10 : null,
        victimPlace: placeName(a, posOf(r, k.t - 8, k.v)),
      });
    }

    // ── клатч: команда осталась одна против X (X ≥ 1) — с момента, когда умер предпоследний
    const alive = new Map();
    const startFrame = frameAt(r, r.freezeEnd) ?? r.frames[0];
    for (const p of startFrame[1]) alive.set(p[0], sideOfP(p));
    const dead = new Set();
    const clutchSides = new Set(); // клатч считаем у каждой стороны отдельно: первый 1vX и ответный (часто 1v1)
    for (const k of kills) {
      dead.add(k.v);
      for (const side of ["T", "CT"]) {
        const mine = [...alive.entries()].filter(([i, s]) => s === side && !dead.has(i)).map(([i]) => i);
        const theirs = [...alive.entries()].filter(([i, s]) => s !== side && !dead.has(i)).map(([i]) => i);
        if (mine.length === 1 && theirs.length >= 1 && !clutchSides.has(side)) {
          clutchSides.add(side);
          const hero = mine[0];
          const after = kills.filter((x) => x.t > k.t);
          const heroKills = after.filter((x) => x.a === hero).length;
          const heroDied = after.find((x) => x.v === hero);
          const end = heroDied?.t ?? r.end;
          // путь героя по местам и гранаты, которые он кинул в клатче
          const route = [];
          for (const f of r.frames) {
            if (f[0] < k.t || f[0] > end) continue;
            const p = f[1].find((q) => q[0] === hero);
            const pl = placeName(a, p);
            if (pl && route[route.length - 1] !== pl) route.push(pl);
          }
          const nades = r.nades.filter((n) => n.p === hero && n.t0 >= k.t && n.t0 <= end).map((n) => n.type);
          const bombPlanted = !!r.bomb?.planted && r.bomb.planted.t <= k.t;
          out.clutches.push({
            round: r.n, t: k.t, end, rt: sec(r, k.t), hero, side, vs: theirs.length,
            won: winnerSide === side, kills: heroKills, survived: !heroDied,
            route, nades, bombPlanted, startPlace: placeName(a, posOf(r, k.t, hero)),
          });
          break;
        }
      }
    }

    // ── второй тайминг: стрелял с одного места, пауза 0.6–6 с, снова стреляет с того же места
    const shotsBy = new Map();
    for (const [t, i] of r.shots ?? []) {
      if (!shotsBy.has(i)) shotsBy.set(i, []);
      shotsBy.get(i).push(t);
    }
    for (const [i, ts] of shotsBy) {
      ts.sort((x, y) => x - y);
      // серии выстрелов: разрыв больше 0.6 с — новая серия
      const bursts = [];
      for (const t of ts) {
        const b = bursts[bursts.length - 1];
        if (b && t - b.end <= REPEEK_GAP_S[0] * TR) b.end = t;
        else bursts.push({ start: t, end: t });
      }
      for (let k = 1; k < bursts.length; k++) {
        const gap = (bursts[k].start - bursts[k - 1].end) / TR;
        if (gap < REPEEK_GAP_S[0] || gap > REPEEK_GAP_S[1]) continue;
        const p0 = posOf(r, bursts[k - 1].start, i), p1 = posOf(r, bursts[k].start, i);
        if (!p0 || !p1 || p0[6] <= 0 || p1[6] <= 0) continue;
        if ((p0[2] - p1[2]) ** 2 + (p0[3] - p1[3]) ** 2 > REPEEK_SPOT ** 2) continue;
        // между выходами ушёл из угла (спрятался) и вернулся: в середине паузы стоял в стороне хотя бы на 60 юнитов
        const mid = posOf(r, Math.round((bursts[k - 1].end + bursts[k].start) / 2), i);
        if (!mid) continue;
        const away = Math.min((mid[2] - p0[2]) ** 2 + (mid[3] - p0[3]) ** 2, (mid[2] - p1[2]) ** 2 + (mid[3] - p1[3]) ** 2);
        if (away < 60 ** 2) continue;
        const died = kills.find((x) => x.v === i && x.t >= bursts[k].start && x.t - bursts[k].start <= REPEEK_DEATH_S * TR);
        const gotKill = kills.find((x) => x.a === i && x.t >= bursts[k].start && x.t - bursts[k].start <= REPEEK_DEATH_S * TR);
        out.repeeks.push({ round: r.n, t: bursts[k].start, rt: sec(r, bursts[k].start), player: i, side: sideOfP(p1), place: placeName(a, p1), gap: Math.round(gap * 10) / 10, died: !!died, gotKill: !!gotKill });
      }
    }

    // ── позиции на 0:20 и 0:40 после закупки
    for (const at of [20, 40]) {
      const f = frameAt(r, r.freezeEnd + at * TR);
      if (!f) continue;
      for (const p of f[1]) {
        if (p[6] <= 0) continue;
        out.setups.push({ round: r.n, at, player: p[0], side: sideOfP(p), place: placeName(a, p), x: p[2], y: p[3] });
      }
    }
  }
  return out;
}

/**
 * Выжимка карты для разведки соперника (сайт собирает по составу команды):
 * rows — [игрок, раунд, сторона, раунд выигран 0/1, место на 0:20, место на 0:40, AWP на 0:20 0/1, убийств, первое убийство 0/1, первая смерть 0/1]
 * nades — [игрок, раунд, сторона, тип, куда легла, секунда раунда]; openings — [раунд, убийца, жертва, место убийцы, место жертвы, секунда];
 * plants — [раунд, сторона закладчика T, место закладки, секунда, игрок]
 */
export function scout(a) {
  const sit = situations(a);
  const rows = [], nades = [], openings = [], plants = [];
  for (const r of a.rounds) {
    if (!r.frames.length) continue;
    const start = frameAt(r, r.freezeEnd) ?? r.frames[0];
    const op = sit.openings.find((o) => o.round === r.n);
    for (const p of start[1]) {
      const i = p[0];
      const side = sideOfP(p);
      const s20 = sit.setups.find((x) => x.round === r.n && x.player === i && x.at === 20);
      const s40 = sit.setups.find((x) => x.round === r.n && x.player === i && x.at === 40);
      const p20 = posOf(r, r.freezeEnd + 20 * TR, i);
      rows.push([i, r.n, side, r.winner === side ? 1 : 0, s20?.place ?? null, s40?.place ?? null, p20 && /awp/i.test(String(p20[8] ?? "")) ? 1 : 0, r.kills.filter((k) => k.a === i && k.v !== i).length, op?.killer === i ? 1 : 0, op?.victim === i ? 1 : 0]);
    }
    for (const n of r.nades) if (n.p != null && ["smoke", "flash", "molotov", "he"].includes(n.type)) nades.push([n.p, r.n, n.side, n.type, n.to ?? null, n.rt]);
    if (op) openings.push([r.n, op.killer, op.victim, op.killerPlace, op.victimPlace, op.rt]);
    const pl = r.bomb?.planted;
    if (pl) plants.push([r.n, "T", placeName(a, posOf(r, pl.t, pl.p)) ?? null, sec(r, pl.t), pl.p ?? null]);
  }
  return { v: 1, map: a.map, players: a.players.map((p) => ({ name: p.name, steamid: p.steamid })), rounds: a.rounds.length, rows, nades, openings, plants };
}
