"use client";

import { useEffect, useMemo, useState } from "react";
import type { Knowledge } from "./pro-library";
import { ClipView, SIDE_COLOR, beginDraw, drawCallouts, placeLabel, radars, toPx, useRadarCanvas } from "./replay";

/*
 * «Как играют про» — ситуации из про-демок (server/analyzer/situations.mjs → learn.mjs):
 * первые дуэли, клатчи, второй тайминг, позиции на 0:20/0:40, размены. У каждой ситуации — клип-пример по кругу.
 */

type Ref = { analysis: string; round: number; t: number; who: string | null };
type Opening = { side: "T" | "CT"; from: string; to: string; count: number; roundWin: number; rt: number | null; pros: { name: string; n: number }[]; examples: (Ref & { victim: string | null; weapon: string })[] };
type Clutch = { analysis: string; round: number; t: number; end: number; side: "T" | "CT"; vs: number; won: boolean; kills: number; hero: string | null; team: string | null; route: string[]; nades: string[]; bombPlanted: boolean; startPlace: string | null };
type Repeek = { side: "T" | "CT"; place: string; count: number; died: number; killed: number; gap: number | null; examples: Ref[] };
type Setup = { at: number; side: "T" | "CT"; total: number; places: { place: string; share: number }[]; dots: [number, number][] };
export type KnowledgeV2 = Knowledge & {
  openings: Opening[];
  trades: { T: number; CT: number };
  tradeByPlace: { side: "T" | "CT"; place: string; deaths: number; traded: number }[];
  clutchStats: { vs: number; count: number; won: number }[];
  clutches: Clutch[];
  repeeks: Repeek[];
  setups: Setup[];
};

const TR = 64;
const NADE_ONE: Record<string, string> = { smoke: "смок", flash: "флешка", molotov: "молотов", he: "HE", decoy: "декой" };
const fmt = (s: number | null) => (s == null ? "—" : `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, "0")}`);
const P = (name: string | null | undefined) => (name ? placeLabel(name) : "?");

function SideSwitch({ side, setSide }: { side: "T" | "CT"; setSide: (s: "T" | "CT") => void }) {
  return (
    <div className="flex gap-1">
      {(["T", "CT"] as const).map((s) => (
        <button key={s} type="button" onClick={() => setSide(s)} className={`rounded-md px-3 py-1.5 text-[14px] font-bold ${side === s ? "text-[#0b0d09]" : "text-white/60"}`} style={side === s ? { background: SIDE_COLOR[s] } : undefined}>
          {s === "T" ? "Атака (T)" : "Защита (CT)"}
        </button>
      ))}
    </div>
  );
}

/** Карта с подписями мест: рисует то, что передали (линии, точки) */
function Radar({ map, data, draw }: { map: string; data: KnowledgeV2; draw: (g: CanvasRenderingContext2D, px: (x: number, y: number) => [number, number], place: (name: string) => [number, number] | null) => void }) {
  const meta = radars[map];
  const { ref, base, crop } = useRadarCanvas(map, meta, false);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    beginDraw(g, crop);
    if (base) { g.globalAlpha = 0.85; g.drawImage(base, 0, 0, 1024, 1024); g.globalAlpha = 1; }
    const px = (x: number, y: number) => toPx(meta, x, y);
    const byName = new Map((data.callouts ?? []).map((c) => [c.name, c]));
    const place = (name: string) => { const c = byName.get(name); return c ? toPx(meta, c.x, c.y) : null; };
    draw(g, px, place);
    drawCallouts(g, data, meta, false);
  }, [ref, base, crop, meta, data, draw]);
  return <canvas ref={ref} width={1024} height={1024} className="aspect-square w-full rounded-xl" />;
}

function Clip({ r, before = 4, after = 2, end }: { r: Ref; before?: number; after?: number; end?: number }) {
  return <ClipView analysisId={r.analysis} clip={{ round: r.round, from: r.t - before * TR, to: (end ?? r.t) + after * TR }} focusName={r.who} />;
}

export function Situations({ map, data, tab }: { map: string; data: KnowledgeV2; tab: string }) {
  return (
    <div className="rounded-2xl bg-[#0f120c] p-3 text-white sm:p-4">
      {tab === "openings" && <Openings map={map} data={data} />}
      {tab === "clutches" && <Clutches data={data} />}
      {tab === "repeeks" && <Repeeks map={map} data={data} />}
      {tab === "setups" && <Setups map={map} data={data} />}
      {tab === "trades" && <Trades data={data} />}
    </div>
  );
}

// ─────────────── первые дуэли

function Openings({ map, data }: { map: string; data: KnowledgeV2 }) {
  const [side, setSide] = useState<"T" | "CT">("T");
  const [sel, setSel] = useState<number | null>(null);
  const [ex, setEx] = useState(0);
  const list = useMemo(() => data.openings.filter((o) => o.side === side), [data, side]);
  const cur = sel != null ? list[sel] : null;
  const draw = useMemo(
    () => (g: CanvasRenderingContext2D, _px: unknown, place: (n: string) => [number, number] | null) => {
      const max = Math.max(1, ...list.map((o) => o.count));
      list.forEach((o, i) => {
        const a = place(o.from), b = place(o.to);
        if (!a || !b) return;
        const on = sel === i;
        g.globalAlpha = sel != null && !on ? 0.2 : 0.9;
        g.strokeStyle = SIDE_COLOR[o.side];
        g.lineWidth = 2 + (o.count / max) * 8;
        g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
        g.fillStyle = "#ff5a4a";
        g.beginPath(); g.arc(b[0], b[1], 7, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      });
      g.lineWidth = 1;
    },
    [list, sel],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SideSwitch side={side} setSide={(s) => { setSide(s); setSel(null); }} />
        <span className="text-[13px] text-white/55">Кто первым убивает в раунде: откуда стрелял → где стоял убитый. Красная точка — где умирает первый.</span>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <Radar map={map} data={data} draw={draw} />
        <div className="min-w-0">
          {cur ? (
            <div>
              <div className="text-[19px] font-extrabold">{P(cur.from)} → {P(cur.to)}</div>
              <div className="mt-1 text-[14px] text-white/70">{cur.count} раз первым убийством раунда · после этого раунд выигран в {cur.roundWin}% · обычно на {fmt(cur.rt)}</div>
              <div className="mt-1 text-[13.5px] text-white/60">Кто: {cur.pros.map((p) => `${p.name} ×${p.n}`).join(", ")}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {cur.examples.map((e, i) => (
                  <button key={i} type="button" onClick={() => setEx(i)} className={`rounded-md px-2.5 py-1 text-[13px] font-semibold ${i === ex ? "bg-[#d4ff1f] text-[#0b0d09]" : "bg-white/10 text-white/80"}`}>
                    {e.who} → {e.victim} · {e.weapon}
                  </button>
                ))}
              </div>
              {cur.examples[ex] && <div className="mt-3"><Clip r={cur.examples[ex]} before={5} after={2} /></div>}
              <button type="button" onClick={() => setSel(null)} className="mt-3 text-[13px] font-semibold text-white/60 hover:text-white">← все дуэли</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {list.length === 0 && <p className="text-[14px] text-white/55">Пока мало данных — нужно больше про-демок.</p>}
              {list.slice(0, 30).map((o, i) => (
                <button key={i} type="button" onClick={() => { setSel(i); setEx(0); }} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">{P(o.from)} → {P(o.to)}</span>
                    <span className="block text-[12.5px] text-white/55">{o.pros.slice(0, 3).map((p) => p.name).join(", ")} · на {fmt(o.rt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-[15px] font-black">{o.count}×</span>
                    <span className="block text-[11.5px] text-white/45">раунд: {o.roundWin}%</span>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────── клатчи

function Clutches({ data }: { data: KnowledgeV2 }) {
  const [vs, setVs] = useState<number | null>(null);
  const [onlyWon, setOnlyWon] = useState(true);
  const [sel, setSel] = useState<number | null>(null);
  const list = data.clutches.filter((c) => (vs == null || c.vs === vs) && (!onlyWon || c.won));
  const cur = sel != null ? list[sel] : null;
  return (
    <div>
      <div className="grid grid-cols-5 gap-2">
        {data.clutchStats.map((s) => (
          <button key={s.vs} type="button" onClick={() => { setVs(vs === s.vs ? null : s.vs); setSel(null); }} className={`rounded-lg border px-3 py-2 text-left ${vs === s.vs ? "border-[#d4ff1f] bg-white/10" : "border-white/10 bg-white/[0.04]"}`}>
            <div className="text-[13px] font-bold text-white/70">1 против {s.vs}</div>
            <div className="num text-[20px] font-black">{s.count ? Math.round((s.won / s.count) * 100) : 0}%</div>
            <div className="text-[11.5px] text-white/45">выиграно {s.won} из {s.count}</div>
          </button>
        ))}
      </div>
      <label className="mt-3 inline-flex items-center gap-2 text-[13.5px] text-white/70">
        <input type="checkbox" checked={onlyWon} onChange={(e) => { setOnlyWon(e.target.checked); setSel(null); }} /> только выигранные — учиться у тех, кто вытащил
      </label>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <div className="space-y-1.5">
          {list.length === 0 && <p className="text-[14px] text-white/55">Нет клатчей с такими условиями.</p>}
          {list.slice(0, 40).map((c, i) => (
            <button key={i} type="button" onClick={() => setSel(i)} className={`block w-full rounded-lg border px-3 py-2 text-left ${sel === i ? "border-[#d4ff1f] bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"}`}>
              <div className="flex items-center gap-2">
                <span className="rounded px-1.5 text-[12px] font-black text-[#0b0d09]" style={{ background: SIDE_COLOR[c.side] }}>{c.side}</span>
                <span className="text-[14.5px] font-bold">{c.hero}</span>
                <span className="text-[12.5px] text-white/50">{c.team}</span>
                <span className={`ml-auto text-[13px] font-bold ${c.won ? "text-[#9fe870]" : "text-[#ff6a5a]"}`}>1v{c.vs} · {c.won ? "вытащил" : "проиграл"}</span>
              </div>
              <div className="mt-1 text-[12.5px] text-white/60">
                {c.route.length ? c.route.map(P).join(" → ") : P(c.startPlace)} · убил {c.kills}
                {c.nades.length ? ` · ${c.nades.map((n) => NADE_ONE[n] ?? n).join(", ")}` : " · без гранат"}
                {c.bombPlanted ? " · бомба стоит" : ""}
              </div>
            </button>
          ))}
        </div>
        <div className="min-w-0">
          {cur ? (
            <>
              <Clip r={{ analysis: cur.analysis, round: cur.round, t: cur.t, who: cur.hero }} before={1} after={2} end={cur.end} />
              <p className="mt-1.5 text-[12.5px] text-white/45">Клатч целиком по кругу: с момента, когда {cur.hero} остался один, до конца. Подсвечен он и его путь.</p>
            </>
          ) : (
            <p className="text-[14px] text-white/55">Выберите клатч слева — покажу, как его играли.</p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────── второй тайминг

function Repeeks({ map, data }: { map: string; data: KnowledgeV2 }) {
  const [side, setSide] = useState<"T" | "CT">("CT");
  const [sel, setSel] = useState<number | null>(null);
  const list = useMemo(() => data.repeeks.filter((r) => r.side === side), [data, side]);
  const cur = sel != null ? list[sel] : null;
  const all = list.reduce((n, r) => n + r.count, 0);
  const diedAll = all ? Math.round(list.reduce((n, r) => n + (r.died * r.count) / 100, 0) / all * 100) : 0;
  const draw = useMemo(
    () => (g: CanvasRenderingContext2D, _px: unknown, place: (n: string) => [number, number] | null) => {
      const max = Math.max(1, ...list.map((r) => r.count));
      list.forEach((r, i) => {
        const p = place(r.place);
        if (!p) return;
        g.globalAlpha = sel != null && sel !== i ? 0.25 : 0.85;
        g.fillStyle = r.died > r.killed ? "#ff5a4a" : "#9fe870";
        g.beginPath(); g.arc(p[0], p[1], 8 + (r.count / max) * 22, 0, Math.PI * 2); g.fill();
        g.globalAlpha = 1;
      });
    },
    [list, sel],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SideSwitch side={side} setSide={(s) => { setSide(s); setSel(null); }} />
        <span className="text-[13px] text-white/55">Повторный выход в тот же угол после того, как спрятался. Зелёный — чаще убивают сами, красный — чаще умирают. У топов в среднем {diedAll}% таких выходов кончаются смертью.</span>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <Radar map={map} data={data} draw={draw} />
        <div className="min-w-0">
          {cur ? (
            <div>
              <div className="text-[19px] font-extrabold">{P(cur.place)}</div>
              <div className="mt-1 text-[14px] text-white/70">{cur.count} повторных выходов · убили сами в {cur.killed}% · умерли в {cur.died}% · пауза обычно {cur.gap ?? "—"} с</div>
              {cur.examples[0] ? (
                <div className="mt-3"><Clip r={cur.examples[0]} before={5} after={3} /></div>
              ) : (
                <p className="mt-3 text-[14px] text-white/55">Удачных примеров тут нет — топы на этом месте повторно выходить почти не рискуют.</p>
              )}
              <button type="button" onClick={() => setSel(null)} className="mt-3 text-[13px] font-semibold text-white/60 hover:text-white">← все места</button>
            </div>
          ) : (
            <div className="space-y-1.5">
              {list.slice(0, 25).map((r, i) => (
                <button key={i} type="button" onClick={() => setSel(i)} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08]">
                  <span className="min-w-0 flex-1 truncate text-[14.5px] font-bold">{P(r.place)}</span>
                  <span className="text-[12.5px] text-[#9fe870]">убили {r.killed}%</span>
                  <span className="text-[12.5px] text-[#ff6a5a]">умерли {r.died}%</span>
                  <span className="num w-10 text-right text-[13px] text-white/50">{r.count}×</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────── позиции на 0:20 / 0:40

function Setups({ map, data }: { map: string; data: KnowledgeV2 }) {
  const [side, setSide] = useState<"T" | "CT">("CT");
  const [at, setAt] = useState(20);
  const cur = data.setups.find((s) => s.side === side && s.at === at);
  const draw = useMemo(
    () => (g: CanvasRenderingContext2D, px: (x: number, y: number) => [number, number]) => {
      g.globalCompositeOperation = "lighter";
      for (const [x, y] of cur?.dots ?? []) {
        const [a, b] = px(x, y);
        const grd = g.createRadialGradient(a, b, 0, a, b, 26);
        const c = side === "T" ? "232,162,58" : "90,169,230";
        grd.addColorStop(0, `rgba(${c},0.5)`);
        grd.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = grd;
        g.beginPath(); g.arc(a, b, 26, 0, Math.PI * 2); g.fill();
      }
      g.globalCompositeOperation = "source-over";
    },
    [cur, side],
  );
  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <SideSwitch side={side} setSide={setSide} />
        <div className="flex gap-1">
          {[20, 40].map((s) => (
            <button key={s} type="button" onClick={() => setAt(s)} className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${at === s ? "bg-white/15 text-white" : "text-white/55"}`}>0:{s}</button>
          ))}
        </div>
        <span className="text-[13px] text-white/55">Где стоят топы через {at} секунд после закупки — расстановка и позиции.</span>
      </div>
      <div className="mt-3 grid gap-4 xl:grid-cols-2">
        <Radar map={map} data={data} draw={draw} />
        <div className="space-y-1">
          {(cur?.places ?? []).slice(0, 20).map((p) => (
            <div key={p.place} className="flex items-center gap-3 text-[14px]">
              <span className="w-40 truncate font-semibold">{P(p.place)}</span>
              <span className="h-2 flex-1 overflow-hidden rounded bg-white/10"><span className="block h-full rounded" style={{ width: `${Math.min(100, p.share * 2.5)}%`, background: SIDE_COLOR[side] }} /></span>
              <span className="num w-12 text-right text-white/70">{p.share}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────── размены

function Trades({ data }: { data: KnowledgeV2 }) {
  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        {(["T", "CT"] as const).map((s) => (
          <div key={s} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <div className="text-[13px] font-bold" style={{ color: SIDE_COLOR[s] }}>{s === "T" ? "Атака" : "Защита"}</div>
            <div className="num mt-1 text-[28px] font-black">{data.trades[s]}%</div>
            <div className="text-[13px] text-white/55">смертей топы разменивают — напарник убивает обидчика за 3 секунды</div>
          </div>
        ))}
      </div>
      <div className="mt-4 text-[14px] font-bold">Где разменивают чаще и реже</div>
      <div className="mt-2 grid gap-1.5 sm:grid-cols-2">
        {data.tradeByPlace.slice(0, 30).map((t) => (
          <div key={`${t.side}-${t.place}`} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[13.5px]">
            <span className="rounded px-1.5 text-[11.5px] font-black text-[#0b0d09]" style={{ background: SIDE_COLOR[t.side] }}>{t.side}</span>
            <span className="min-w-0 flex-1 truncate font-semibold">{P(t.place)}</span>
            <span className="num text-white/70">{t.traded}%</span>
            <span className="num w-14 text-right text-white/40">{t.deaths} смертей</span>
          </div>
        ))}
      </div>
    </div>
  );
}
