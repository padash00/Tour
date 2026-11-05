"use client";

import { useEffect, useMemo, useState } from "react";
import { ClipView, NADE_COLOR, NADE_NAME, SIDE_COLOR, beginDraw, drawCallouts, placeLabel, radars, toPx, useGzJson, useRadarCanvas, type Analysis } from "./replay";
import { Situations, type KnowledgeV2 } from "./pro-situations";

/*
 * «Как играют про»: библиотека раскидок по карте из про-демок (server/analyzer/learn.mjs).
 * Выбираешь раскидку на карте или в списке — справа клип: как её кидал про, по кругу.
 */

type Example = { analysis: string; round: number; t0: number; t1: number; rt: number; who: string | null; team: string | null; fx: number; fy: number; path: [number, number, number][] };
type Lineup = { id: string; side: "T" | "CT"; type: string; from: string | null; to: string | null; x: number; y: number; fx: number; fy: number; count: number; rate: number; rt: number | null; pros: { name: string; n: number }[]; examples: Example[] };
export type Knowledge = { v: number; map: string; at: string; demos: number; rounds: { T: number; CT: number }; throws: number; callouts: Analysis["callouts"]; lineups: Lineup[] };

const sec = (s: number | null) => (s == null ? "—" : s < 0 ? `${Math.abs(s).toFixed(0)} с до конца закупки` : `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`);
const TYPE_ONE: Record<string, string> = { smoke: "Смок", flash: "Флешка", molotov: "Молотов", he: "HE" };

type Tab = "lineups" | "openings" | "clutches" | "repeeks" | "setups" | "trades";
const TABS: [Tab, string][] = [["lineups", "Раскидки"], ["openings", "Первые дуэли"], ["clutches", "Клатчи"], ["repeeks", "Второй тайминг"], ["setups", "Позиции"], ["trades", "Размены"]];

export function ProLibrary({ map }: { map: string }) {
  const { data, error } = useGzJson<Knowledge>(`/api/analysis/knowledge/${map}`);
  const [tab, setTab] = useState<Tab>("lineups");
  if (!radars[map]) return <p className="text-fg-3">Для карты {map} нет радара.</p>;
  if (error) return <p className="text-danger">Библиотека не загрузилась: {error}</p>;
  if (!data) return <p className="text-fg-3">Загружаем библиотеку…</p>;
  const has = (t: Tab) => t === "lineups" || (data.v ?? 1) >= 2;
  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-1 rounded-lg border border-line p-1">
        {TABS.filter(([t]) => has(t)).map(([t, label]) => (
          <button key={t} type="button" onClick={() => setTab(t)} className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${tab === t ? "bg-accent text-accent-ink" : "text-fg-2 hover:text-fg"}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === "lineups" ? <Lineups map={map} data={data} /> : <Situations map={map} data={data as KnowledgeV2} tab={tab} />}
    </div>
  );
}

function Lineups({ map, data }: { map: string; data: Knowledge }) {
  const meta = radars[map];
  const [side, setSide] = useState<"T" | "CT">("T");
  const [type, setType] = useState("smoke");
  const [selId, setSelId] = useState<string | null>(null);
  const [exIdx, setExIdx] = useState(0);
  const { ref, base, crop } = useRadarCanvas(map, meta ?? { pos_x: 0, pos_y: 0, scale: 1, size: 1024 }, false);

  const list = useMemo(() => (data?.lineups ?? []).filter((l) => l.side === side && l.type === type), [data, side, type]);
  const sel = list.find((l) => l.id === selId) ?? null;

  useEffect(() => {
    const c = ref.current;
    if (!c || !meta || !data) return;
    const g = c.getContext("2d")!;
    beginDraw(g, crop);
    if (base) { g.globalAlpha = 0.9; g.drawImage(base, 0, 0, 1024, 1024); g.globalAlpha = 1; }
    drawCallouts(g, data, meta, false);
    const col = NADE_COLOR[type] ?? "#fff";
    for (const l of list) {
      const on = l.id === selId;
      const [fx, fy] = toPx(meta, l.fx, l.fy);
      const [x, y] = toPx(meta, l.x, l.y);
      g.globalAlpha = selId && !on ? 0.25 : 0.9;
      g.strokeStyle = col;
      g.lineWidth = on ? 3 : 1.5;
      g.setLineDash(on ? [] : [6, 5]);
      g.beginPath(); g.moveTo(fx, fy); g.lineTo(x, y); g.stroke();
      g.setLineDash([]);
      // откуда — кружок цвета стороны, куда — точка гранаты
      g.fillStyle = SIDE_COLOR[l.side];
      g.beginPath(); g.arc(fx, fy, on ? 8 : 5, 0, Math.PI * 2); g.fill();
      g.fillStyle = col;
      g.strokeStyle = "#0b0d09";
      g.lineWidth = 2;
      const r = type === "smoke" ? (on ? 16 : 11) : on ? 10 : 7;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = 1;
    }
    // путь гранаты выбранного примера
    const ex = sel?.examples[exIdx];
    if (ex?.path?.length) {
      g.strokeStyle = "#d4ff1f";
      g.lineWidth = 2.5;
      g.beginPath();
      ex.path.forEach(([, px, py], i) => { const [a, b] = toPx(meta, px, py); if (i) g.lineTo(a, b); else g.moveTo(a, b); });
      g.stroke();
      g.lineWidth = 1;
    }
  }, [data, list, selId, sel, exIdx, base, crop, meta, ref, type]);

  // клик по карте — ближайшая раскидка
  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!meta || !list.length) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const c = crop ?? { x: 0, y: 0, s: 1024 };
    const px = c.x + ((e.clientX - rect.left) / rect.width) * c.s;
    const py = c.y + ((e.clientY - rect.top) / rect.height) * c.s;
    let best: Lineup | null = null, bd = Infinity;
    for (const l of list) {
      for (const [x, y] of [toPx(meta, l.x, l.y), toPx(meta, l.fx, l.fy)]) {
        const d = (x - px) ** 2 + (y - py) ** 2;
        if (d < bd) { bd = d; best = l; }
      }
    }
    if (best && bd < 40 ** 2) { setSelId(best.id); setExIdx(0); }
  };

  const ex = sel?.examples[exIdx];

  return (
    <div className="rounded-2xl bg-[#0f120c] p-3 text-white sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["T", "CT"] as const).map((s) => (
          <button key={s} type="button" onClick={() => { setSide(s); setSelId(null); }} className={`rounded-md px-3 py-1.5 text-[14px] font-bold ${side === s ? "text-[#0b0d09]" : "text-white/60"}`} style={side === s ? { background: SIDE_COLOR[s] } : undefined}>
            {s === "T" ? "Атака (T)" : "Защита (CT)"}
          </button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {["smoke", "flash", "molotov", "he"].map((t) => {
          const n = (data.lineups ?? []).filter((l) => l.side === side && l.type === t).length;
          return (
            <button key={t} type="button" onClick={() => { setType(t); setSelId(null); }} className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${type === t ? "bg-white/15 text-white" : "text-white/55"}`}>
              <span className="mr-1.5 inline-block size-2.5 rounded-full" style={{ background: NADE_COLOR[t] }} />
              {NADE_NAME[t]} <span className="text-white/45">{n}</span>
            </button>
          );
        })}
        <span className="ml-auto text-[12.5px] text-white/45">{data.demos} карт · {data.throws} бросков · собрано {new Date(data.at).toLocaleString("ru-RU")}</span>
      </div>

      <div className="mt-3 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <canvas ref={ref} width={1024} height={1024} onClick={onCanvasClick} className="aspect-square w-full cursor-pointer rounded-xl" />
          <p className="mt-1.5 text-[12.5px] text-white/45">Кружок цвета стороны — откуда бросают, точка — куда ложится граната. Нажмите на раскидку на карте или в списке.</p>
        </div>
        <div className="min-w-0">
          {sel && ex ? (
            <div>
              <div className="text-[19px] font-extrabold">
                {TYPE_ONE[sel.type]}: {sel.from ? placeLabel(sel.from) : "?"} → {sel.to ? placeLabel(sel.to) : "?"}
              </div>
              <div className="mt-1 text-[14px] text-white/70">
                Кидают в {sel.rate}% раундов за {sel.side} · обычно на {sec(sel.rt)} · всего {sel.count} раз
              </div>
              <div className="mt-1 text-[13.5px] text-white/60">Кто кидает: {sel.pros.map((p) => `${p.name} ×${p.n}`).join(", ")}</div>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {sel.examples.map((e, i) => (
                  <button key={i} type="button" onClick={() => setExIdx(i)} className={`rounded-md px-2.5 py-1 text-[13px] font-semibold ${i === exIdx ? "bg-[#d4ff1f] text-[#0b0d09]" : "bg-white/10 text-white/80"}`}>
                    {e.who ?? "?"} · раунд {e.round}
                  </button>
                ))}
              </div>
              <div className="mt-3">
                <ClipView analysisId={ex.analysis} clip={{ round: ex.round, from: ex.t0 - 4 * 64, to: ex.t1 + (sel.type === "smoke" ? 5 : 3) * 64 }} focusName={ex.who} />
              </div>
              <p className="mt-1.5 text-[12.5px] text-white/45">Клип идёт по кругу: 4 секунды до броска и пару секунд после. Подсвечен игрок, который кидает.</p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {list.length === 0 && <p className="text-[14px] text-white/55">Для этой стороны и гранаты раскидок пока нет — нужно больше про-демок.</p>}
              {list.slice(0, 40).map((l) => (
                <button key={l.id} type="button" onClick={() => { setSelId(l.id); setExIdx(0); }} className="flex w-full items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-left hover:bg-white/[0.08]">
                  <span className="size-3 shrink-0 rounded-full" style={{ background: NADE_COLOR[l.type] }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14.5px] font-bold">{l.from ? placeLabel(l.from) : "?"} → {l.to ? placeLabel(l.to) : "?"}</span>
                    <span className="block text-[12.5px] text-white/55">{l.pros.slice(0, 3).map((p) => p.name).join(", ")} · на {sec(l.rt)}</span>
                  </span>
                  <span className="text-right">
                    <span className="num block text-[15px] font-black">{l.rate}%</span>
                    <span className="block text-[11.5px] text-white/45">{l.count} раз</span>
                  </span>
                </button>
              ))}
            </div>
          )}
          {sel && (
            <button type="button" onClick={() => setSelId(null)} className="mt-3 text-[13px] font-semibold text-white/60 hover:text-white">← все раскидки</button>
          )}
        </div>
      </div>
    </div>
  );
}
