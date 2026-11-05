"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play } from "lucide-react";
import RADARS from "@/lib/radar-maps.json";

/*
 * Разбор демки: 2D-повтор раунда, тепловая карта, гранаты, экономика.
 * Данные — JSON из server/analyzer/analyze.mjs (gzip, качается по подписанной ссылке прямо из хранилища).
 */

type P = [number, 0 | 1, number, number, number, number, number, number, string | null]; // i, side(0=T,1=CT), x, y, z, yaw, hp, armor, weapon
type Frame = [number, P[]];
type Kill = { t: number; a: number | null; v: number; as: number | null; w: string; hs: boolean; ax: number | null; ay: number | null; vx: number | null; vy: number | null; vs: "T" | "CT" | null; smoke: boolean; blind: boolean; wall: boolean; flash: boolean };
type Nade = { type: string; p: number | null; t0: number; t1: number; x: number; y: number; path: [number, number, number][] };
type BombEv = { t: number; x: number | null; y: number | null; site: string | number | null; p: number | null };
type Round = {
  n: number; start: number; freezeEnd: number; end: number; winner: "T" | "CT" | null; reason: string | null; aSide: "T" | "CT" | null;
  bomb: { planted?: BombEv; defused?: BombEv; exploded?: BombEv } | null;
  frames: Frame[]; kills: Kill[]; nades: Nade[];
  econ: { p: number; side: "T" | "CT"; money: number | null; equip: number | null; kit: boolean; helmet: boolean }[];
  buyT?: string; buyCT?: string;
};
export type Analysis = { v: number; map: string; tickrate: number; every: number; teams: { A: string; B: string }; score: { A: number; B: number }; players: { name: string; steamid: string | null; team: "A" | "B" | null }[]; rounds: Round[] };

type RadarMeta = { pos_x: number; pos_y: number; scale: number; size: number; bombA?: (number | null)[]; bombB?: (number | null)[]; lower?: { image: string; below_z: number | null } };
const radars = RADARS as Record<string, RadarMeta>;

const SIDE_COLOR = { T: "#e8a23a", CT: "#5aa9e6" } as const;
const TAIL = 3 * 64;
const SMOKE_S = 18, MOLLY_S = 7;
const NADE_COLOR: Record<string, string> = { smoke: "#cfd6dd", flash: "#ffffff", he: "#ff5a4a", molotov: "#ff8a1f", decoy: "#9aa" };
const NADE_NAME: Record<string, string> = { smoke: "Смоки", flash: "Флешки", he: "HE", molotov: "Молотовы", decoy: "Декои" };
const BUY_NAME: Record<string, string> = { pistol: "Пистолетка", full: "Полная", force: "Форс", semi: "Полуэко", eco: "Эко" };
const weaponName = (w: string | null) => (w ? w.replace(/^weapon_/, "").replace(/_/g, " ") : "");
const fmt = (s: number) => `${Math.floor(Math.max(0, s) / 60)}:${String(Math.floor(Math.max(0, s) % 60)).padStart(2, "0")}`;

function useImage(src: string | null) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!src) return;
    const i = new Image();
    i.onload = () => setImg(i);
    i.src = src;
  }, [src]);
  return img;
}

export function AnalysisView({ url, map }: { url: string; map: string }) {
  const [data, setData] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(url);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        // файл — gzip; если хранилище уже распаковало его по дороге, читаем как есть
        const buf = new Uint8Array(await r.arrayBuffer());
        const gz = buf[0] === 0x1f && buf[1] === 0x8b;
        const text = gz ? await new Response(new Blob([buf]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(buf);
        setData(JSON.parse(text) as Analysis);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [url]);
  if (error) return <p className="text-danger">Не удалось загрузить разбор: {error}</p>;
  if (!data) return <p className="text-fg-3">Загружаем разбор…</p>;
  const meta = radars[map];
  if (!meta) return <p className="text-fg-3">Для карты {map} нет радара.</p>;
  return <Viewer data={data} meta={meta} />;
}

type Tab = "replay" | "heat" | "nades" | "econ";

function Viewer({ data, meta }: { data: Analysis; meta: RadarMeta }) {
  const [tab, setTab] = useState<Tab>("replay");
  const tabs: [Tab, string][] = [["replay", "2D-повтор"], ["heat", "Тепловая карта"], ["nades", "Гранаты"], ["econ", "Экономика"]];
  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-[22px] font-extrabold">
          {data.teams.A} <span className="text-accent">{data.score.A}:{data.score.B}</span> {data.teams.B}
          <span className="ml-3 text-[15px] font-semibold text-fg-3">{data.map.replace(/^de_/, "")} · {data.rounds.length} раундов</span>
        </div>
        <div className="flex gap-1 rounded-lg border border-line p-1">
          {tabs.map(([k, label]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-md px-3 py-1.5 text-[14px] font-semibold ${tab === k ? "bg-accent text-accent-ink" : "text-fg-2 hover:text-fg"}`}>
              {label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-4">
        {tab === "replay" && <Replay data={data} meta={meta} />}
        {tab === "heat" && <Heat data={data} meta={meta} />}
        {tab === "nades" && <Nades data={data} meta={meta} />}
        {tab === "econ" && <Econ data={data} />}
      </div>
    </div>
  );
}

// ─────────────────────────── холст радара

/** Холст 1024×1024 и картинка радара: основная — по названию карты, нижний уровень — из meta.lower */
function useRadarCanvas(map: string, meta: RadarMeta, lower: boolean) {
  const ref = useRef<HTMLCanvasElement>(null);
  const base = useImage(`/analysis/radars/${lower && meta.lower ? meta.lower.image : `${map}.png`}`);
  return { ref, base };
}

function toPx(meta: RadarMeta, x: number, y: number): [number, number] {
  return [(x - meta.pos_x) / meta.scale, (meta.pos_y - y) / meta.scale];
}
/** Буква точки закладки по ближайшей отметке A/B из файлов карты; если точки рядом (Nuke) — не угадываем */
function siteLetter(meta: RadarMeta, x: number | null, y: number | null): "A" | "B" | null {
  if (x == null || y == null || meta.bombA?.[0] == null || meta.bombB?.[0] == null) return null;
  const [px, py] = toPx(meta, x, y).map((v) => v / meta.size);
  const d = (p: (number | null)[]) => Math.hypot(px - (p[0] ?? 0), py - (p[1] ?? 0));
  const a = d(meta.bombA), bb = d(meta.bombB);
  if (Math.abs(a - bb) < 0.06) return null;
  return a < bb ? "A" : "B";
}

const onLevel = (meta: RadarMeta, z: number, lower: boolean) => (!meta.lower?.below_z ? true : lower ? z < meta.lower.below_z : z >= meta.lower.below_z);

function LevelSwitch({ meta, lower, setLower }: { meta: RadarMeta; lower: boolean; setLower: (v: boolean) => void }) {
  if (!meta.lower) return null;
  return (
    <div className="flex gap-1 rounded-lg border border-line p-1 text-[13px]">
      {[false, true].map((l) => (
        <button key={String(l)} type="button" onClick={() => setLower(l)} className={`rounded-md px-2.5 py-1 font-semibold ${lower === l ? "bg-surface-3 text-fg" : "text-fg-3"}`}>
          {l ? "Нижний уровень" : "Верхний уровень"}
        </button>
      ))}
    </div>
  );
}

// ─────────────────────────── 2D-повтор

function lerpAngle(a: number, b: number, k: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * k;
}

function Replay({ data, meta }: { data: Analysis; meta: RadarMeta }) {
  const [ri, setRi] = useState(0);
  const round = data.rounds[ri];
  const [tick, setTick] = useState(round?.start ?? 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2);
  const [lower, setLower] = useState(false);
  const { ref, base } = useRadarCanvas(data.map, meta, lower);
  const last = useRef<number | null>(null);

  const selectRound = useCallback((i: number) => {
    setRi(i);
    setTick(data.rounds[i].freezeEnd - 5 * 64);
    setPlaying(true);
  }, [data.rounds]);

  useEffect(() => {
    if (!playing || !round) return;
    let raf = 0;
    const step = (now: number) => {
      const dt = last.current == null ? 0 : (now - last.current) / 1000;
      last.current = now;
      setTick((t) => {
        const nt = t + dt * data.tickrate * speed;
        if (nt >= round.end + TAIL) {
          setPlaying(false);
          return round.end + TAIL;
        }
        return nt;
      });
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      last.current = null;
    };
  }, [playing, speed, round, data.tickrate]);

  // позиции на текущий тик (интерполяция между кадрами)
  const players = useMemo(() => {
    if (!round?.frames.length) return [] as P[];
    const f = round.frames;
    let lo = 0, hi = f.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (f[mid][0] <= tick) lo = mid;
      else hi = mid - 1;
    }
    const a = f[lo], b = f[Math.min(lo + 1, f.length - 1)];
    const k = b[0] === a[0] ? 0 : Math.min(1, Math.max(0, (tick - a[0]) / (b[0] - a[0])));
    const nb = new Map(b[1].map((p) => [p[0], p]));
    return a[1].map((p): P => {
      const q = nb.get(p[0]);
      if (!q || p[6] === 0) return p;
      return [p[0], p[1], p[2] + (q[2] - p[2]) * k, p[3] + (q[3] - p[3]) * k, p[4] + (q[4] - p[4]) * k, lerpAngle(p[5], q[5], k), q[6] === 0 ? p[6] : p[6], p[7], p[8]];
    });
  }, [round, tick]);

  useEffect(() => {
    const c = ref.current;
    if (!c || !round) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 1024, 1024);
    if (base) g.drawImage(base, 0, 0, 1024, 1024);
    const r = (u: number) => u / meta.scale;

    // гранаты
    for (const n of round.nades) {
      if (tick < n.t0) continue;
      if (tick < n.t1) {
        const pts = n.path.filter(([t]) => t <= tick);
        g.strokeStyle = NADE_COLOR[n.type] ?? "#fff";
        g.globalAlpha = 0.7;
        g.setLineDash([4, 4]);
        g.beginPath();
        pts.forEach(([, x, y], i) => {
          const [px, py] = toPx(meta, x, y);
          if (i) g.lineTo(px, py);
          else g.moveTo(px, py);
        });
        g.stroke();
        g.setLineDash([]);
        g.globalAlpha = 1;
        continue;
      }
      const [px, py] = toPx(meta, n.x, n.y);
      const since = (tick - n.t1) / data.tickrate;
      if (n.type === "smoke" && since < SMOKE_S) {
        g.fillStyle = "rgba(205,212,220,0.55)";
        g.beginPath(); g.arc(px, py, r(144), 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.7)"; g.stroke();
      } else if (n.type === "molotov" && since < MOLLY_S) {
        g.fillStyle = "rgba(255,120,30,0.45)";
        g.beginPath(); g.arc(px, py, r(120), 0, Math.PI * 2); g.fill();
      } else if (n.type === "flash" && since < 0.6) {
        g.fillStyle = `rgba(255,255,255,${0.9 * (1 - since / 0.6)})`;
        g.beginPath(); g.arc(px, py, r(90), 0, Math.PI * 2); g.fill();
      } else if (n.type === "he" && since < 0.6) {
        g.strokeStyle = `rgba(255,90,74,${1 - since / 0.6})`;
        g.lineWidth = 3;
        g.beginPath(); g.arc(px, py, r(200) * (0.4 + since), 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1;
      }
    }

    // бомба
    const b = round.bomb;
    if (b?.planted && tick >= b.planted.t && b.planted.x != null && b.planted.y != null) {
      const [px, py] = toPx(meta, b.planted.x, b.planted.y);
      const defused = b.defused && tick >= b.defused.t;
      g.fillStyle = defused ? SIDE_COLOR.CT : `rgba(255,60,60,${0.6 + 0.4 * Math.abs(Math.sin(tick / 20))})`;
      g.fillRect(px - 7, py - 7, 14, 14);
    }

    // убийства: крестик на месте смерти, линия выстрела 1.5 с
    for (const k of round.kills) {
      if (tick < k.t || k.vx == null || k.vy == null) continue;
      const [vx, vy] = toPx(meta, k.vx, k.vy);
      if (tick - k.t < 1.5 * data.tickrate && k.ax != null && k.ay != null) {
        const [ax, ay] = toPx(meta, k.ax, k.ay);
        g.strokeStyle = `rgba(255,255,255,${1 - (tick - k.t) / (1.5 * data.tickrate)})`;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(vx, vy); g.stroke();
      }
      g.strokeStyle = k.vs ? SIDE_COLOR[k.vs] : "#aaa";
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(vx - 7, vy - 7); g.lineTo(vx + 7, vy + 7); g.moveTo(vx + 7, vy - 7); g.lineTo(vx - 7, vy + 7); g.stroke();
      g.lineWidth = 1;
    }

    // игроки
    g.font = "bold 15px Inter, sans-serif";
    g.textAlign = "center";
    for (const p of players) {
      if (p[6] <= 0) continue;
      const [px, py] = toPx(meta, p[2], p[3]);
      const here = onLevel(meta, p[4], lower);
      g.globalAlpha = here ? 1 : 0.3;
      const col = p[1] === 0 ? SIDE_COLOR.T : SIDE_COLOR.CT;
      const a = (p[5] * Math.PI) / 180;
      g.strokeStyle = col;
      g.lineWidth = 3;
      g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(a) * 26, py - Math.sin(a) * 26); g.stroke();
      g.lineWidth = 1;
      g.fillStyle = col;
      g.beginPath(); g.arc(px, py, 11, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#0d0f0a"; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
      g.fillStyle = "#fff";
      g.fillText(data.players[p[0]]?.name.slice(0, 14) ?? "?", px, py - 17);
      g.globalAlpha = 1;
    }
  }, [players, round, tick, base, meta, lower, data.players, data.tickrate, ref]);

  if (!round) return <p className="text-fg-3">В демке нет раундов.</p>;
  const sinceFreeze = (tick - round.freezeEnd) / data.tickrate;
  const plantedAt = round.bomb?.planted?.t;
  const clock = tick < round.freezeEnd ? `Закупка ${fmt(-sinceFreeze)}` : plantedAt && tick >= plantedAt ? `💣 ${fmt(40 - (tick - plantedAt) / data.tickrate)}` : fmt(115 - sinceFreeze);
  const feed = round.kills.filter((k) => k.t <= tick);
  const econ = new Map(round.econ.map((e) => [e.p, e]));
  const aSide = round.aSide ?? "T";
  const winnerTeam = round.winner ? (round.winner === aSide ? data.teams.A : data.teams.B) : null;

  return (
    <div>
      <div className="flex flex-wrap gap-1">
        {data.rounds.map((r, i) => {
          const aWon = r.winner && r.aSide ? r.winner === r.aSide : null;
          return (
            <button
              key={r.n}
              type="button"
              onClick={() => selectRound(i)}
              title={`Раунд ${r.n}: ${r.winner ?? "?"} (${r.reason ?? ""})`}
              className={`h-8 min-w-8 rounded-md border px-1.5 text-[13px] font-bold ${i === ri ? "border-accent" : "border-transparent"}`}
              style={{ background: r.winner ? SIDE_COLOR[r.winner] + (aWon ? "" : "66") : "var(--color-surface-3)", color: "#0d0f0a" }}
            >
              {r.n}
            </button>
          );
        })}
      </div>
      <p className="mt-1 text-[13px] text-fg-3">Яркие — раунд выиграла {data.teams.A}, бледные — {data.teams.B}. Цвет — сторона победителя.</p>

      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div>
          <canvas ref={ref} width={1024} height={1024} className="aspect-square w-full rounded-lg bg-black/40" />
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => setPlaying((v) => !v)} className="inline-flex size-10 items-center justify-center rounded-full bg-accent text-accent-ink" aria-label={playing ? "Пауза" : "Играть"}>
              {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
            </button>
            {[1, 2, 4, 8].map((s) => (
              <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded-md px-2 py-1 text-[13px] font-bold ${speed === s ? "bg-surface-3 text-fg" : "text-fg-3"}`}>
                ×{s}
              </button>
            ))}
            <span className="num ml-auto text-[18px] font-bold">{clock}</span>
            <LevelSwitch meta={meta} lower={lower} setLower={setLower} />
          </div>
          <div className="relative mt-2">
            <input
              type="range"
              min={round.start}
              max={round.end + TAIL}
              value={tick}
              onChange={(e) => { setTick(Number(e.target.value)); setPlaying(false); }}
              className="w-full accent-[var(--color-accent)]"
              aria-label="Время раунда"
            />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-2">
              {round.kills.map((k, i) => (
                <span key={i} className="absolute top-0 h-2 w-0.5" style={{ left: `${((k.t - round.start) / (round.end + TAIL - round.start)) * 100}%`, background: k.vs === "T" ? SIDE_COLOR.CT : SIDE_COLOR.T }} />
              ))}
            </div>
          </div>
          <p className="mt-1 text-[13px] text-fg-3">
            Раунд {round.n}: {winnerTeam ? `выиграла ${winnerTeam} (${round.winner})` : "—"}
            {round.bomb?.planted ? ` · плент${siteLetter(meta, round.bomb.planted.x, round.bomb.planted.y) ? ` на ${siteLetter(meta, round.bomb.planted.x, round.bomb.planted.y)}` : ""}${round.bomb.defused ? ", разминировали" : round.bomb.exploded ? ", взорвалась" : ""}` : ""} · закупка {data.teams.A}: {BUY_NAME[(aSide === "T" ? round.buyT : round.buyCT) ?? ""] ?? "—"}, {data.teams.B}: {BUY_NAME[(aSide === "T" ? round.buyCT : round.buyT) ?? ""] ?? "—"}
          </p>
        </div>

        <div className="space-y-4">
          {(["T", "CT"] as const).map((side) => {
            const team = side === aSide ? data.teams.A : data.teams.B;
            const list = players.filter((p) => (p[1] === 0 ? "T" : "CT") === side);
            return (
              <div key={side}>
                <div className="mb-1.5 flex items-center gap-2 text-[14px] font-bold">
                  <span className="size-2.5 rounded-full" style={{ background: SIDE_COLOR[side] }} />
                  {team} <span className="text-fg-3">· {side}</span>
                </div>
                {list.map((p) => {
                  const e = econ.get(p[0]);
                  return (
                    <div key={p[0]} className={`flex items-center gap-2 py-1 text-[13.5px] ${p[6] <= 0 ? "opacity-40" : ""}`}>
                      <span className="w-28 truncate font-semibold">{data.players[p[0]]?.name}</span>
                      <span className="h-1.5 w-14 overflow-hidden rounded bg-surface-3"><span className="block h-full" style={{ width: `${Math.max(0, p[6])}%`, background: SIDE_COLOR[side] }} /></span>
                      <span className="w-20 truncate text-fg-3">{weaponName(p[8])}</span>
                      <span className="num ml-auto text-fg-3">{e?.equip != null ? `$${e.equip}` : ""}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div>
            <div className="mb-1.5 text-[14px] font-bold">Убийства</div>
            {feed.length === 0 && <p className="text-[13px] text-fg-3">Пока никто не умер</p>}
            {feed.map((k, i) => (
              <div key={i} className="flex items-center gap-1.5 py-0.5 text-[13px]">
                <span className="num w-10 text-fg-3">{fmt((k.t - round.freezeEnd) / data.tickrate)}</span>
                <span className="truncate font-semibold" style={{ color: k.vs ? SIDE_COLOR[k.vs === "T" ? "CT" : "T"] : undefined }}>{k.a != null ? data.players[k.a]?.name : "мир"}</span>
                <span className="text-fg-3">[{weaponName(k.w)}{k.hs ? " · HS" : ""}{k.wall ? " · стена" : ""}{k.smoke ? " · смок" : ""}]</span>
                <span className="truncate" style={{ color: k.vs ? SIDE_COLOR[k.vs] : undefined }}>{data.players[k.v]?.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── фильтры для карт

type Filter = { team: "A" | "B"; side: "all" | "T" | "CT"; player: number | "all" };
function Filters({ data, f, setF, extra }: { data: Analysis; f: Filter; setF: (f: Filter) => void; extra?: React.ReactNode }) {
  const sel = "rounded-md border border-line bg-surface px-2 py-1.5 text-[14px]";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select className={sel} value={f.team} onChange={(e) => setF({ ...f, team: e.target.value as "A" | "B", player: "all" })}>
        <option value="A">{data.teams.A}</option>
        <option value="B">{data.teams.B}</option>
      </select>
      <select className={sel} value={f.side} onChange={(e) => setF({ ...f, side: e.target.value as Filter["side"] })}>
        <option value="all">Обе стороны</option>
        <option value="T">Атака (T)</option>
        <option value="CT">Защита (CT)</option>
      </select>
      <select className={sel} value={String(f.player)} onChange={(e) => setF({ ...f, player: e.target.value === "all" ? "all" : Number(e.target.value) })}>
        <option value="all">Все игроки</option>
        {data.players.map((p, i) => (p.team === f.team ? <option key={i} value={i}>{p.name}</option> : null))}
      </select>
      {extra}
    </div>
  );
}
const sideOfTeam = (r: Round, team: "A" | "B") => (r.aSide ? (team === "A" ? r.aSide : r.aSide === "T" ? "CT" : "T") : null);

// ─────────────────────────── тепловая карта

function Heat({ data, meta }: { data: Analysis; meta: RadarMeta }) {
  const [f, setF] = useState<Filter>({ team: "A", side: "all", player: "all" });
  const [what, setWhat] = useState<"deaths" | "kills">("deaths");
  const [lower, setLower] = useState(false);
  const { ref, base } = useRadarCanvas(data.map, meta, lower);
  const points = useMemo(() => {
    const out: [number, number][] = [];
    for (const r of data.rounds) {
      const side = sideOfTeam(r, f.team);
      if (f.side !== "all" && side !== f.side) continue;
      for (const k of r.kills) {
        const who = what === "deaths" ? k.v : k.a;
        if (who == null || data.players[who]?.team !== f.team) continue;
        if (f.player !== "all" && who !== f.player) continue;
        const x = what === "deaths" ? k.vx : k.ax, y = what === "deaths" ? k.vy : k.ay;
        if (x != null && y != null) out.push(toPx(meta, x, y));
      }
    }
    return out;
  }, [data, f, what, meta]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 1024, 1024);
    if (base) { g.globalAlpha = 0.85; g.drawImage(base, 0, 0, 1024, 1024); g.globalAlpha = 1; }
    g.globalCompositeOperation = "lighter";
    const col = what === "deaths" ? "255,70,60" : "120,255,90";
    for (const [x, y] of points) {
      const grd = g.createRadialGradient(x, y, 0, x, y, 34);
      grd.addColorStop(0, `rgba(${col},0.55)`);
      grd.addColorStop(1, `rgba(${col},0)`);
      g.fillStyle = grd;
      g.beginPath(); g.arc(x, y, 34, 0, Math.PI * 2); g.fill();
    }
    g.globalCompositeOperation = "source-over";
    g.fillStyle = "#fff";
    for (const [x, y] of points) { g.beginPath(); g.arc(x, y, 2.5, 0, Math.PI * 2); g.fill(); }
  }, [points, base, what, ref]);
  return (
    <div>
      <Filters
        data={data}
        f={f}
        setF={setF}
        extra={
          <>
            <select className="rounded-md border border-line bg-surface px-2 py-1.5 text-[14px]" value={what} onChange={(e) => setWhat(e.target.value as "deaths" | "kills")}>
              <option value="deaths">Где умирают</option>
              <option value="kills">Откуда убивают</option>
            </select>
            <LevelSwitch meta={meta} lower={lower} setLower={setLower} />
            <span className="text-[14px] text-fg-3">{points.length} точек</span>
          </>
        }
      />
      <canvas ref={ref} width={1024} height={1024} className="mt-3 aspect-square w-full max-w-[820px] rounded-lg bg-black/40" />
    </div>
  );
}

// ─────────────────────────── гранаты

function Nades({ data, meta }: { data: Analysis; meta: RadarMeta }) {
  const [f, setF] = useState<Filter>({ team: "A", side: "all", player: "all" });
  const [type, setType] = useState("smoke");
  const [lower, setLower] = useState(false);
  const { ref, base } = useRadarCanvas(data.map, meta, lower);
  const list = useMemo(() => {
    const out: { from: [number, number]; to: [number, number] }[] = [];
    for (const r of data.rounds) {
      const side = sideOfTeam(r, f.team);
      if (f.side !== "all" && side !== f.side) continue;
      for (const n of r.nades) {
        if (n.type !== type || n.p == null || data.players[n.p]?.team !== f.team) continue;
        if (f.player !== "all" && n.p !== f.player) continue;
        const s = n.path[0];
        if (!s) continue;
        out.push({ from: toPx(meta, s[1], s[2]), to: toPx(meta, n.x, n.y) });
      }
    }
    return out;
  }, [data, f, type, meta]);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const r of data.rounds) for (const n of r.nades) if (n.p != null && data.players[n.p]?.team === f.team) c[n.type] = (c[n.type] ?? 0) + 1;
    return c;
  }, [data, f.team]);
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const g = c.getContext("2d")!;
    g.clearRect(0, 0, 1024, 1024);
    if (base) g.drawImage(base, 0, 0, 1024, 1024);
    const col = NADE_COLOR[type] ?? "#fff";
    for (const { from, to } of list) {
      g.strokeStyle = col; g.globalAlpha = 0.35;
      g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(to[0], to[1]); g.stroke();
      g.globalAlpha = 1; g.fillStyle = col;
      g.beginPath(); g.arc(to[0], to[1], type === "smoke" ? 9 : 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#0d0f0a"; g.stroke();
    }
  }, [list, base, type, ref]);
  return (
    <div>
      <Filters
        data={data}
        f={f}
        setF={setF}
        extra={
          <>
            {Object.keys(NADE_NAME).map((t) => (
              <button key={t} type="button" onClick={() => setType(t)} className={`rounded-md px-2.5 py-1 text-[13px] font-semibold ${type === t ? "bg-surface-3 text-fg" : "text-fg-3"}`}>
                {NADE_NAME[t]} <span className="text-fg-3">{counts[t] ?? 0}</span>
              </button>
            ))}
            <LevelSwitch meta={meta} lower={lower} setLower={setLower} />
          </>
        }
      />
      <p className="mt-2 text-[13px] text-fg-3">Линия — откуда бросили, точка — где сработала.</p>
      <canvas ref={ref} width={1024} height={1024} className="mt-2 aspect-square w-full max-w-[820px] rounded-lg bg-black/40" />
    </div>
  );
}

// ─────────────────────────── экономика

function Econ({ data }: { data: Analysis }) {
  const avg = (r: Round, side: "T" | "CT" | null) => {
    if (!side) return null;
    const eq = r.econ.filter((e) => e.side === side).map((e) => e.equip ?? 0);
    return eq.length ? Math.round(eq.reduce((a, b) => a + b, 0) / eq.length) : null;
  };
  const conv = (team: "A" | "B") => {
    const rows: Record<string, { n: number; w: number }> = {};
    for (const r of data.rounds) {
      const side = sideOfTeam(r, team);
      const buy = side === "T" ? r.buyT : side === "CT" ? r.buyCT : undefined;
      if (!buy) continue;
      rows[buy] ??= { n: 0, w: 0 };
      rows[buy].n++;
      if (r.winner === side) rows[buy].w++;
    }
    return rows;
  };
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        {(["A", "B"] as const).map((t) => {
          const c = conv(t);
          return (
            <div key={t} className="rounded-lg border border-line p-4">
              <div className="font-bold">{data.teams[t]} — победы по типу закупки</div>
              {Object.keys(BUY_NAME).map((b) => (
                <div key={b} className="mt-1.5 flex justify-between text-[14px]">
                  <span>{BUY_NAME[b]}</span>
                  <span className="num text-fg-2">{c[b] ? `${c[b].w} из ${c[b].n} (${Math.round((c[b].w / c[b].n) * 100)}%)` : "—"}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[14px]">
          <thead className="text-fg-3">
            <tr className="border-b border-line">
              <th className="py-2 text-left">Раунд</th>
              <th className="text-left">{data.teams.A}</th>
              <th className="text-left">{data.teams.B}</th>
              <th className="text-left">Победа</th>
            </tr>
          </thead>
          <tbody>
            {data.rounds.map((r) => {
              const sa = sideOfTeam(r, "A"), sb = sideOfTeam(r, "B");
              const cell = (side: "T" | "CT" | null) => {
                const buy = side === "T" ? r.buyT : side === "CT" ? r.buyCT : undefined;
                const a = avg(r, side);
                return (
                  <span>
                    <span style={{ color: side ? SIDE_COLOR[side] : undefined }}>{side}</span> · {BUY_NAME[buy ?? ""] ?? "—"} <span className="text-fg-3">{a != null ? `$${a}` : ""}</span>
                  </span>
                );
              };
              const won = r.winner ? (r.winner === sa ? data.teams.A : data.teams.B) : "—";
              return (
                <tr key={r.n} className="border-b border-line-subtle">
                  <td className="py-1.5 num">{r.n}</td>
                  <td>{cell(sa)}</td>
                  <td>{cell(sb)}</td>
                  <td className="font-semibold">{won}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
