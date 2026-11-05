"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pause, Play, Shield, ShieldPlus, Wrench } from "lucide-react";
import RADARS from "@/lib/radar-maps.json";

/*
 * Разбор демки: 2D-повтор раунда, тепловая карта, гранаты, экономика.
 * Данные — JSON из server/analyzer/analyze.mjs (gzip, качается по подписанной ссылке прямо из хранилища).
 */

// i, сторона (0=T, 1=CT), x, y, z, yaw, hp, броня, оружие, место (номер в places), деньги, флаги (1 шлем, 2 дефузер, 4 прицел, 8 разминирует)
type P = [number, 0 | 1, number, number, number, number, number, number, string | null, number?, number?, number?];
type Frame = [number, P[]];
type Kill = { t: number; a: number | null; v: number; as: number | null; w: string; hs: boolean; ax: number | null; ay: number | null; vx: number | null; vy: number | null; vs: "T" | "CT" | null; smoke: boolean; blind: boolean; wall: boolean; flash: boolean };
type Nade = { type: string; p: number | null; t0: number; t1: number; x: number; y: number; path: [number, number, number][] };
type BombEv = { t: number; x: number | null; y: number | null; site: string | number | null; p: number | null };
type Round = {
  n: number; start: number; freezeEnd: number; end: number; winner: "T" | "CT" | null; reason: string | null; aSide: "T" | "CT" | null;
  bomb: { planted?: BombEv; defused?: BombEv; exploded?: BombEv } | null;
  frames: Frame[]; kills: Kill[]; nades: Nade[];
  shots?: [number, number][]; // тик, игрок
  hurts?: [number, number | null, number, number, string | null, string | null][]; // тик, стрелок, цель, урон, часть тела, оружие
  econ: { p: number; side: "T" | "CT"; money: number | null; equip: number | null; kit: boolean; helmet: boolean }[];
  buyT?: string; buyCT?: string;
};
export type Analysis = { v: number; map: string; tickrate: number; every: number; places?: string[]; callouts?: { name: string; x: number; y: number; z: number }[]; teams: { A: string; B: string }; score: { A: number; B: number }; players: { name: string; steamid: string | null; team: "A" | "B" | null }[]; rounds: Round[] };

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
        if (r.status === 404) throw new Error("файл этого разбора ещё загружается — откройте через пару минут");
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
  // обрезка по краям карты: на картинке радара вокруг карты много пустого места — карта заполняет весь холст
  const top = useImage(`/analysis/radars/${map}.png`);
  const crop = useMemo(() => (top ? cropOf(top) : null), [top]);
  return { ref, base, crop };
}

type Crop = { x: number; y: number; s: number };
/** Квадрат вокруг непрозрачной части радара (в координатах 1024×1024), с полями 4% */
function cropOf(img: HTMLImageElement): Crop {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 256;
  const g = c.getContext("2d", { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, 256, 256);
  const d = g.getImageData(0, 0, 256, 256).data;
  // столбцы и строки, где карта плотная (сетка из редких точек на радаре не считается)
  const cols = new Array(256).fill(0), rows = new Array(256).fill(0);
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++)
      if (d[(y * 256 + x) * 4 + 3] > 170) {
        cols[x]++;
        rows[y]++;
      }
  const MIN = 6;
  const x0 = cols.findIndex((n) => n >= MIN), x1 = 255 - [...cols].reverse().findIndex((n) => n >= MIN);
  const y0 = rows.findIndex((n) => n >= MIN), y1 = 255 - [...rows].reverse().findIndex((n) => n >= MIN);
  if (x0 < 0 || y0 < 0 || x1 <= x0 || y1 <= y0) return { x: 0, y: 0, s: 1024 };
  const k = 1024 / 256;
  const side = Math.min(1024, Math.max(x1 - x0, y1 - y0) * k * 1.06);
  const cx = ((x0 + x1) / 2) * k, cy = ((y0 + y1) / 2) * k;
  return { x: Math.max(0, Math.min(1024 - side, cx - side / 2)), y: Math.max(0, Math.min(1024 - side, cy - side / 2)), s: side };
}
/** Очистить холст и включить обрезку: дальше рисуем в координатах радара 1024×1024 */
function beginDraw(g: CanvasRenderingContext2D, crop: Crop | null) {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, 1024, 1024);
  g.fillStyle = "#0b0d09";
  g.fillRect(0, 0, 1024, 1024);
  const c = crop ?? { x: 0, y: 0, s: 1024 };
  const k = 1024 / c.s;
  g.setTransform(k, 0, 0, k, -c.x * k, -c.y * k);
  return k;
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

/** Название места из игры для людей: «BombsiteA» → «A Site», «PalaceAlley» → «Palace Alley», «TSpawn» → «T Spawn» */
function placeLabel(name: string) {
  const m = /^Bombsite([A-Z])$/.exec(name);
  if (m) return `${m[1]} Site`;
  return name.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^([TC]T?)(Spawn)/, "$1 $2").replace(/of/gi, "of");
}

/** Подписи мест на радаре (для тепловой карты и гранат) */
function drawCallouts(g: CanvasRenderingContext2D, data: Analysis, meta: RadarMeta, lower: boolean) {
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "600 13px Inter, sans-serif";
  for (const co of data.callouts ?? []) {
    if (!onLevel(meta, co.z, lower)) continue;
    const [x, y] = toPx(meta, co.x, co.y);
    const t = placeLabel(co.name).toUpperCase();
    g.lineWidth = 4;
    g.strokeStyle = "rgba(0,0,0,0.8)";
    g.strokeText(t, x, y);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillText(t, x, y);
  }
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

// ─────────────────────────── 2D-повтор (как трансляция: табло, команды по бокам, крупная карта)

function lerpAngle(a: number, b: number, k: number) {
  let d = ((b - a + 540) % 360) - 180;
  if (d < -180) d += 360;
  return a + d * k;
}

const REASON: Record<string, string> = {
  t_killed: "все T убиты", ct_killed: "все CT убиты", bomb_exploded: "бомба взорвалась", bomb_defused: "бомба разминирована",
  target_saved: "время вышло", ct_win: "победа CT", t_win: "победа T", target_bombed: "бомба взорвалась", terrorists_win: "победа T", cts_win: "победа CT",
};

/** Позиции игроков на тик: интерполяция между соседними кадрами (8 кадров в секунду) */
function framesAt(round: Round, tick: number): P[] {
  const f = round.frames;
  if (!f.length) return [];
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
    if (!q || p[6] === 0 || q[6] === 0) return p;
    const out = [...p] as P;
    out[2] = p[2] + (q[2] - p[2]) * k;
    out[3] = p[3] + (q[3] - p[3]) * k;
    out[4] = p[4] + (q[4] - p[4]) * k;
    out[5] = lerpAngle(p[5], q[5], k);
    return out;
  });
}

type Layers = { places: boolean; names: boolean; trails: boolean; shots: boolean };

function Replay({ data, meta }: { data: Analysis; meta: RadarMeta }) {
  // ссылка на момент: ?r=5&t=30 — 5-й раунд, 30-я секунда после закупки
  const [ri, setRi] = useState(() => {
    const r = typeof window === "undefined" ? NaN : Number(new URLSearchParams(window.location.search).get("r"));
    return Number.isInteger(r) && r >= 1 && r <= data.rounds.length ? r - 1 : 0;
  });
  const round = data.rounds[ri];
  const [tick, setTick] = useState(() => {
    const r = data.rounds[ri];
    if (!r) return 0;
    const t = typeof window === "undefined" ? NaN : Number(new URLSearchParams(window.location.search).get("t"));
    return Number.isFinite(t) ? Math.min(r.end + TAIL, r.freezeEnd + t * data.tickrate) : r.freezeEnd - 3 * 64;
  });
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [lower, setLower] = useState(false);
  const [sel, setSel] = useState<number | null>(null);
  const [layers, setLayers] = useState<Layers>({ places: true, names: true, trails: false, shots: true });
  const { ref, base, crop } = useRadarCanvas(data.map, meta, lower);
  const last = useRef<number | null>(null);
  const tr = data.tickrate;
  // на весь экран: разворачиваем весь повтор (табло, карта, команды)
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const on = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };

  const selectRound = useCallback(
    (i: number) => {
      if (i < 0 || i >= data.rounds.length) return;
      setRi(i);
      setTick(data.rounds[i].freezeEnd - 3 * 64);
      setPlaying(true);
    },
    [data.rounds],
  );

  // проигрывание
  useEffect(() => {
    if (!playing || !round) return;
    let raf = 0;
    const step = (now: number) => {
      const dt = last.current == null ? 0 : Math.min(0.1, (now - last.current) / 1000);
      last.current = now;
      setTick((t) => {
        const nt = t + dt * tr * speed;
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
  }, [playing, speed, round, tr]);

  // клавиши: пробел — пауза, ←/→ — 5 секунд, ↑/↓ — раунд
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT" && (e.target as HTMLInputElement).type !== "range") return;
      if (e.code === "Space") { e.preventDefault(); setPlaying((v) => !v); }
      else if (e.code === "ArrowRight") { e.preventDefault(); setTick((t) => Math.min((round?.end ?? t) + TAIL, t + 5 * tr)); }
      else if (e.code === "ArrowLeft") { e.preventDefault(); setTick((t) => Math.max(round?.start ?? t, t - 5 * tr)); }
      else if (e.code === "ArrowUp") { e.preventDefault(); selectRound(ri - 1); }
      else if (e.code === "ArrowDown") { e.preventDefault(); selectRound(ri + 1); }
      else if (e.code === "KeyF") { e.preventDefault(); toggleFull(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [round, tr, ri, selectRound]);

  const players = useMemo(() => (round ? framesAt(round, tick) : []), [round, tick]);

  // номера игроков 1–5 в команде — как на табло трансляции
  const slot = useMemo(() => {
    const m = new Map<number, number>();
    for (const team of ["A", "B"] as const) data.players.map((p, i) => [p, i] as const).filter(([p]) => p.team === team).forEach(([, i], k) => m.set(i, k + 1));
    return m;
  }, [data.players]);

  // убийства/урон за раунд до текущего момента — для табло
  const roundKills = useMemo(() => {
    const m = new Map<number, number>();
    for (const k of round?.kills ?? []) if (k.t <= tick && k.a != null) m.set(k.a, (m.get(k.a) ?? 0) + 1);
    return m;
  }, [round, tick]);
  const roundDmg = useMemo(() => {
    const m = new Map<number, number>();
    for (const h of round?.hurts ?? []) if (h[0] <= tick && h[1] != null) m.set(h[1], (m.get(h[1]) ?? 0) + Math.min(100, h[3]));
    return m;
  }, [round, tick]);
  const killedBy = useMemo(() => {
    const m = new Map<number, Kill>();
    for (const k of round?.kills ?? []) if (k.t <= tick) m.set(k.v, k);
    return m;
  }, [round, tick]);

  // ── рисование
  useEffect(() => {
    const c = ref.current;
    if (!c || !round) return;
    const g = c.getContext("2d")!;
    const S = 1024;
    beginDraw(g, crop);
    if (base) { g.globalAlpha = 0.92; g.drawImage(base, 0, 0, S, S); g.globalAlpha = 1; }
    const r = (u: number) => u / meta.scale;
    const outline = (text: string, x: number, y: number, font: string, fill: string) => {
      g.font = font;
      g.lineWidth = 4;
      g.strokeStyle = "rgba(0,0,0,0.85)";
      g.strokeText(text, x, y);
      g.fillStyle = fill;
      g.fillText(text, x, y);
    };
    g.textAlign = "center";
    g.textBaseline = "middle";

    // названия мест
    if (layers.places) {
      for (const co of data.callouts ?? []) {
        if (!onLevel(meta, co.z, lower)) continue;
        const [x, y] = toPx(meta, co.x, co.y);
        outline(placeLabel(co.name).toUpperCase(), x, y, "600 13px Inter, sans-serif", "rgba(255,255,255,0.62)");
      }
    }

    // следы: последние 4 секунды пути (выбранный игрок — всегда)
    const trailFor = (i: number) => layers.trails || sel === i;
    for (const p of players) {
      if (!trailFor(p[0]) || p[6] <= 0) continue;
      const pts = round.frames.filter(([t]) => t <= tick && t >= tick - 4 * tr).map(([, l]) => l.find((q) => q[0] === p[0])).filter(Boolean) as P[];
      if (pts.length < 2) continue;
      g.strokeStyle = p[1] === 0 ? SIDE_COLOR.T : SIDE_COLOR.CT;
      g.lineWidth = sel === p[0] ? 3 : 2;
      g.globalAlpha = 0.55;
      g.beginPath();
      pts.forEach((q, k) => { const [x, y] = toPx(meta, q[2], q[3]); if (k) g.lineTo(x, y); else g.moveTo(x, y); });
      g.stroke();
      g.globalAlpha = 1;
      g.lineWidth = 1;
    }

    // гранаты
    for (const n of round.nades) {
      if (tick < n.t0) continue;
      if (tick < n.t1) {
        const pts = n.path.filter(([t]) => t <= tick);
        g.strokeStyle = NADE_COLOR[n.type] ?? "#fff";
        g.globalAlpha = 0.8;
        g.setLineDash([5, 5]);
        g.lineWidth = 2;
        g.beginPath();
        pts.forEach(([, x, y], i) => { const [px, py] = toPx(meta, x, y); if (i) g.lineTo(px, py); else g.moveTo(px, py); });
        g.stroke();
        g.setLineDash([]);
        const head = pts[pts.length - 1];
        if (head) { const [hx, hy] = toPx(meta, head[1], head[2]); g.fillStyle = NADE_COLOR[n.type] ?? "#fff"; g.beginPath(); g.arc(hx, hy, 5, 0, Math.PI * 2); g.fill(); }
        g.globalAlpha = 1;
        g.lineWidth = 1;
        continue;
      }
      const [px, py] = toPx(meta, n.x, n.y);
      const since = (tick - n.t1) / tr;
      if (n.type === "smoke" && since < SMOKE_S) {
        const fade = since > SMOKE_S - 2 ? (SMOKE_S - since) / 2 : 1;
        g.fillStyle = `rgba(200,208,216,${0.62 * fade})`;
        g.beginPath(); g.arc(px, py, r(144), 0, Math.PI * 2); g.fill();
        g.strokeStyle = `rgba(255,255,255,${0.8 * fade})`; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
        outline(String(Math.ceil(SMOKE_S - since)), px, py, "700 14px Inter, sans-serif", "#1a1d16");
      } else if (n.type === "molotov" && since < MOLLY_S) {
        g.fillStyle = "rgba(255,110,20,0.5)";
        g.beginPath(); g.arc(px, py, r(120), 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,170,60,0.9)"; g.lineWidth = 2; g.stroke(); g.lineWidth = 1;
      } else if (n.type === "flash" && since < 0.5) {
        g.fillStyle = `rgba(255,255,255,${0.95 * (1 - since / 0.5)})`;
        g.beginPath(); g.arc(px, py, r(110), 0, Math.PI * 2); g.fill();
      } else if (n.type === "he" && since < 0.6) {
        g.strokeStyle = `rgba(255,80,60,${1 - since / 0.6})`;
        g.lineWidth = 4;
        g.beginPath(); g.arc(px, py, r(240) * (0.3 + since), 0, Math.PI * 2); g.stroke();
        g.lineWidth = 1;
      }
    }

    // бомба
    const b = round.bomb;
    if (b?.planted && tick >= b.planted.t && b.planted.x != null && b.planted.y != null) {
      const [px, py] = toPx(meta, b.planted.x, b.planted.y);
      const defused = b.defused && tick >= b.defused.t;
      const blown = b.exploded && tick >= b.exploded.t;
      if (blown && tick - b.exploded!.t < 1.5 * tr) {
        g.fillStyle = `rgba(255,90,30,${0.7 * (1 - (tick - b.exploded!.t) / (1.5 * tr))})`;
        g.beginPath(); g.arc(px, py, r(500), 0, Math.PI * 2); g.fill();
      }
      g.fillStyle = defused ? SIDE_COLOR.CT : `rgba(255,50,50,${0.65 + 0.35 * Math.abs(Math.sin(tick / 16))})`;
      g.beginPath(); g.roundRect(px - 9, py - 9, 18, 18, 4); g.fill();
      outline("C4", px, py - 18, "800 12px Inter, sans-serif", "#fff");
    }

    // выстрелы: короткий трассер по направлению взгляда
    const pos = new Map(players.map((p) => [p[0], p]));
    if (layers.shots) {
      for (const [t, i] of round.shots ?? []) {
        const age = (tick - t) / tr;
        if (age < 0 || age > 0.12) continue;
        const p = pos.get(i);
        if (!p) continue;
        const [x, y] = toPx(meta, p[2], p[3]);
        const a = (p[5] * Math.PI) / 180;
        g.strokeStyle = `rgba(255,240,150,${1 - age / 0.12})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * r(1400), y - Math.sin(a) * r(1400)); g.stroke();
        g.lineWidth = 1;
      }
    }

    // попадания: линия стрелок → цель и урон
    for (const [t, a, v, dmg, hg] of round.hurts ?? []) {
      const age = (tick - t) / tr;
      if (age < 0 || age > 0.8) continue;
      const pv = pos.get(v);
      const pa = a != null ? pos.get(a) : undefined;
      if (!pv) continue;
      const [vx, vy] = toPx(meta, pv[2], pv[3]);
      if (pa && a !== v) {
        const [ax, ay] = toPx(meta, pa[2], pa[3]);
        g.strokeStyle = `rgba(255,70,60,${0.9 * (1 - age / 0.8)})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(vx, vy); g.stroke();
        g.lineWidth = 1;
      }
      g.globalAlpha = 1 - age / 0.8;
      outline(`-${dmg}${hg === "head" ? " ◎" : ""}`, vx + 18, vy - 16 - age * 30, "800 15px Inter, sans-serif", "#ff6a5a");
      g.globalAlpha = 1;
    }

    // погибшие: крест и ник
    for (const k of round.kills) {
      if (tick < k.t || k.vx == null || k.vy == null) continue;
      const [vx, vy] = toPx(meta, k.vx, k.vy);
      if (tick - k.t < 1.2 * tr && k.ax != null && k.ay != null) {
        const [ax, ay] = toPx(meta, k.ax, k.ay);
        g.strokeStyle = `rgba(255,255,255,${1 - (tick - k.t) / (1.2 * tr)})`;
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(ax, ay); g.lineTo(vx, vy); g.stroke();
      }
      g.strokeStyle = k.vs ? SIDE_COLOR[k.vs] : "#aaa";
      g.globalAlpha = 0.85;
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(vx - 8, vy - 8); g.lineTo(vx + 8, vy + 8); g.moveTo(vx + 8, vy - 8); g.lineTo(vx - 8, vy + 8); g.stroke();
      g.lineWidth = 1;
      if (layers.names) outline(data.players[k.v]?.name ?? "", vx, vy + 20, "600 12px Inter, sans-serif", "rgba(255,255,255,0.55)");
      g.globalAlpha = 1;
    }

    // игроки: конус взгляда, кружок с номером, полоска HP, ник
    for (const p of players) {
      if (p[6] <= 0) continue;
      const [x, y] = toPx(meta, p[2], p[3]);
      const here = onLevel(meta, p[4], lower);
      g.globalAlpha = here ? 1 : 0.28;
      const col = p[1] === 0 ? SIDE_COLOR.T : SIDE_COLOR.CT;
      const a = (-p[5] * Math.PI) / 180;
      const fov = ((p[11] ?? 0) & 4 ? 18 : 75) * (Math.PI / 180);
      const len = (p[11] ?? 0) & 4 ? 160 : 70;
      const grd = g.createRadialGradient(x, y, 8, x, y, len);
      grd.addColorStop(0, col + "88");
      grd.addColorStop(1, col + "00");
      g.fillStyle = grd;
      g.beginPath(); g.moveTo(x, y); g.arc(x, y, len, a - fov / 2, a + fov / 2); g.closePath(); g.fill();
      if (sel === p[0]) { g.strokeStyle = "#d4ff1f"; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 21, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
      if ((p[11] ?? 0) & 8) { g.strokeStyle = `rgba(90,169,230,${0.5 + 0.5 * Math.abs(Math.sin(tick / 10))})`; g.lineWidth = 3; g.beginPath(); g.arc(x, y, 25, 0, Math.PI * 2); g.stroke(); g.lineWidth = 1; }
      g.fillStyle = col;
      g.beginPath(); g.arc(x, y, 13, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#0b0d09"; g.lineWidth = 2.5; g.stroke();
      // кольцо здоровья
      g.strokeStyle = p[6] > 50 ? "rgba(255,255,255,0.9)" : p[6] > 20 ? "#ffb347" : "#ff5a4a";
      g.lineWidth = 3;
      g.beginPath(); g.arc(x, y, 16.5, -Math.PI / 2, -Math.PI / 2 + (Math.PI * 2 * p[6]) / 100); g.stroke();
      g.lineWidth = 1;
      outline(String(slot.get(p[0]) ?? ""), x, y + 1, "800 13px Inter, sans-serif", "#0b0d09");
      if (layers.names) outline(data.players[p[0]]?.name.slice(0, 16) ?? "", x, y + 30, "700 13px Inter, sans-serif", "#fff");
      g.globalAlpha = 1;
    }
  }, [players, round, tick, base, meta, lower, data, tr, ref, layers, sel, slot, crop]);

  if (!round) return <p className="text-fg-3">В демке нет раундов.</p>;

  const aSide = round.aSide ?? "T";
  const sideOfTeamNow = (t: "A" | "B") => (t === "A" ? aSide : aSide === "T" ? "CT" : "T");
  const sinceFreeze = (tick - round.freezeEnd) / tr;
  const plantedAt = round.bomb?.planted?.t;
  const clock = tick < round.freezeEnd ? fmt(-sinceFreeze) : plantedAt && tick >= plantedAt ? fmt(40 - (tick - plantedAt) / tr) : fmt(115 - sinceFreeze);
  const phase = tick < round.freezeEnd ? "Закупка" : plantedAt && tick >= plantedAt ? (round.bomb?.defused && tick >= round.bomb.defused.t ? "Разминирована" : `Бомба на ${siteLetter(meta, round.bomb!.planted!.x, round.bomb!.planted!.y) ?? "точке"}`) : tick > round.end ? "Конец раунда" : "";
  // счёт до этого раунда
  let sa = 0, sb = 0;
  for (const r of data.rounds.slice(0, ri + (tick > round.end ? 1 : 0))) if (r.winner && r.aSide) { if (r.winner === r.aSide) sa++; else sb++; }
  const alive = (t: "A" | "B") => players.filter((p) => data.players[p[0]]?.team === t && p[6] > 0).length;
  const feed = round.kills.filter((k) => k.t <= tick && tick - k.t < 8 * tr).slice(-5);
  const total = round.end + TAIL - round.start;
  const pct = (t: number) => `${((t - round.start) / total) * 100}%`;
  const winnerTeam = round.winner ? (round.winner === aSide ? "A" : "B") : null;

  const teamPanel = (team: "A" | "B") => {
    const side = sideOfTeamNow(team);
    const list = data.players.map((p, i) => [p, i] as const).filter(([p]) => p.team === team).map(([, i]) => i);
    const byI = new Map(players.map((p) => [p[0], p]));
    return (
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 px-1 text-[13px] font-bold uppercase tracking-wide" style={{ color: SIDE_COLOR[side] }}>
          {side === "T" ? "Атака" : "Защита"} · {data.teams[team]}
        </div>
        {list.map((i) => {
          const p = byI.get(i);
          const dead = !p || p[6] <= 0;
          const k = killedBy.get(i);
          const flags = p?.[11] ?? 0;
          return (
            <button
              key={i}
              type="button"
              onClick={() => setSel(sel === i ? null : i)}
              className={`block w-full rounded-lg border px-2.5 py-2 text-left transition-colors ${sel === i ? "border-[#d4ff1f] bg-white/10" : "border-white/10 bg-white/[0.04] hover:bg-white/[0.08]"} ${dead ? "opacity-45" : ""}`}
            >
              <div className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded text-[12px] font-black text-[#0b0d09]" style={{ background: SIDE_COLOR[side] }}>{slot.get(i)}</span>
                <span className="truncate text-[14px] font-bold text-white">{data.players[i]?.name}</span>
                {(roundKills.get(i) ?? 0) > 0 && <span className="rounded bg-white/15 px-1 text-[11px] font-bold text-white">{roundKills.get(i)}K</span>}
                <span className="num ml-auto text-[13px] text-[#9fe870]">{p?.[10] != null ? `$${p[10]}` : ""}</span>
              </div>
              {dead ? (
                <div className="mt-1 truncate text-[12px] text-white/60">✕ {k ? `убил ${k.a != null ? data.players[k.a]?.name : "мир"} · ${weaponName(k.w)}${k.hs ? " · в голову" : ""}` : "мёртв"}</div>
              ) : (
                <>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="h-1.5 flex-1 overflow-hidden rounded bg-white/15">
                      <span className="block h-full rounded" style={{ width: `${p![6]}%`, background: p![6] > 50 ? "#e9ece4" : p![6] > 20 ? "#ffb347" : "#ff5a4a" }} />
                    </span>
                    <span className="num w-7 text-right text-[12px] font-bold text-white">{p![6]}</span>
                    <span className="flex items-center gap-0.5 text-white/60" title={`${p![7] > 0 ? ((flags & 1) ? "броня и шлем" : "броня") : "без брони"}${(flags & 2) ? ", дефузер" : ""}`}>
                      {p![7] > 0 && ((flags & 1) ? <ShieldPlus className="size-3.5" /> : <Shield className="size-3.5" />)}
                      {(flags & 2) !== 0 && <Wrench className="size-3.5" />}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-[12px] text-white/70">
                    <span className="truncate">{weaponName(p![8])}</span>
                    <span className="ml-auto truncate text-white/50">{p![9] != null && p![9] >= 0 ? placeLabel(data.places?.[p![9]] ?? "") : ""}</span>
                  </div>
                  {(roundDmg.get(i) ?? 0) > 0 && <div className="mt-0.5 text-[11px] text-white/45">урон в раунде: {roundDmg.get(i)}</div>}
                </>
              )}
            </button>
          );
        })}
      </div>
    );
  };

  const toggle = (k: keyof Layers, label: string) => (
    <button key={k} type="button" onClick={() => setLayers((l) => ({ ...l, [k]: !l[k] }))} className={`rounded-md px-2.5 py-1 text-[12.5px] font-semibold ${layers[k] ? "bg-white/15 text-white" : "text-white/45 hover:text-white/70"}`}>
      {label}
    </button>
  );

  return (
    <div ref={box} className={`bg-[#0f120c] text-white ${full ? "h-screen overflow-y-auto p-3" : "rounded-2xl p-3 sm:p-4"}`}>
      {/* табло */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 rounded-xl bg-white/[0.05] px-4 py-2.5">
        <div className="flex items-center justify-end gap-3">
          <span className="truncate text-[17px] font-extrabold" style={{ color: SIDE_COLOR[sideOfTeamNow("A")] }}>{data.teams.A}</span>
          <span className="num text-[28px] font-black">{sa}</span>
        </div>
        <div className="text-center">
          <div className="num text-[24px] font-black leading-none">{clock}</div>
          <div className="mt-1 text-[12px] font-semibold text-white/60">Раунд {round.n}{phase ? ` · ${phase}` : ""}</div>
          <div className="mt-0.5 text-[12px] font-bold"><span style={{ color: SIDE_COLOR[sideOfTeamNow("A")] }}>{alive("A")}</span> <span className="text-white/40">vs</span> <span style={{ color: SIDE_COLOR[sideOfTeamNow("B")] }}>{alive("B")}</span></div>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-[28px] font-black">{sb}</span>
          <span className="truncate text-[17px] font-extrabold" style={{ color: SIDE_COLOR[sideOfTeamNow("B")] }}>{data.teams.B}</span>
        </div>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-[250px_minmax(0,1fr)_250px]">
        <div className="order-2 xl:order-1">{teamPanel("A")}</div>
        <div className="order-1 xl:order-2">
          <div className={`relative mx-auto aspect-square w-full ${full ? "max-w-[min(100%,calc(100vh-190px))]" : "max-w-[min(100%,82vh)]"}`}>
            <canvas ref={ref} width={1024} height={1024} className="size-full rounded-xl" />
            {/* лента убийств, как в игре */}
            <div className="pointer-events-none absolute right-2 top-2 flex max-w-[70%] flex-col items-end gap-1">
              {feed.map((k, i) => (
                <div key={i} className="flex items-center gap-1.5 rounded-md bg-black/70 px-2 py-1 text-[12.5px] font-semibold">
                  <span style={{ color: k.vs ? SIDE_COLOR[k.vs === "T" ? "CT" : "T"] : "#ccc" }}>{k.a != null ? data.players[k.a]?.name : "мир"}</span>
                  <span className="text-white/70">{weaponName(k.w)}{k.hs ? " ◎" : ""}{k.wall ? " ⇢" : ""}{k.smoke ? " ☁" : ""}</span>
                  <span style={{ color: k.vs ? SIDE_COLOR[k.vs] : "#ccc" }}>{data.players[k.v]?.name}</span>
                </div>
              ))}
            </div>
            {tick > round.end && winnerTeam && (
              <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto w-fit -translate-y-1/2 rounded-xl bg-black/75 px-5 py-3 text-center">
                <div className="text-[20px] font-black" style={{ color: round.winner ? SIDE_COLOR[round.winner] : undefined }}>Раунд за {data.teams[winnerTeam]}</div>
                <div className="text-[13px] text-white/70">{REASON[round.reason ?? ""] ?? round.reason}</div>
              </div>
            )}
          </div>
        </div>
        <div className="order-3">{teamPanel("B")}</div>
      </div>

      {/* управление */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setPlaying((v) => !v)} className="inline-flex size-10 items-center justify-center rounded-full bg-[#d4ff1f] text-[#0b0d09]" aria-label={playing ? "Пауза" : "Играть"}>
          {playing ? <Pause className="size-5" /> : <Play className="size-5" />}
        </button>
        <button type="button" onClick={() => selectRound(ri - 1)} className="rounded-md px-2 py-1 text-[13px] font-semibold text-white/70 hover:text-white" aria-label="Предыдущий раунд">⏮</button>
        <button type="button" onClick={() => selectRound(ri + 1)} className="rounded-md px-2 py-1 text-[13px] font-semibold text-white/70 hover:text-white" aria-label="Следующий раунд">⏭</button>
        {[0.5, 1, 2, 4].map((s) => (
          <button key={s} type="button" onClick={() => setSpeed(s)} className={`rounded-md px-2 py-1 text-[13px] font-bold ${speed === s ? "bg-white/15 text-white" : "text-white/50"}`}>×{s}</button>
        ))}
        <span className="mx-1 h-5 w-px bg-white/15" />
        {toggle("places", "Места")}
        {toggle("names", "Ники")}
        {toggle("trails", "Следы")}
        {toggle("shots", "Выстрелы")}
        {meta.lower && (
          <button type="button" onClick={() => setLower((v) => !v)} className="rounded-md bg-white/10 px-2.5 py-1 text-[12.5px] font-semibold">{lower ? "Нижний уровень" : "Верхний уровень"}</button>
        )}
        <span className="ml-auto hidden text-[12px] text-white/40 lg:inline">пробел — пауза · ←/→ — 5 с · ↑/↓ — раунд · F — весь экран</span>
        <button type="button" onClick={toggleFull} className="rounded-md bg-white/10 px-3 py-1 text-[12.5px] font-bold hover:bg-white/20">{full ? "Выйти из полного экрана" : "⛶ На весь экран"}</button>
      </div>

      {/* шкала раунда: убийства, плент, разминирование */}
      <div className="relative mt-3 h-9">
        <div className="absolute inset-x-0 top-4 h-1.5 rounded bg-white/10" />
        <div className="absolute top-4 h-1.5 rounded bg-white/35" style={{ left: 0, width: pct(Math.min(tick, round.end + TAIL)) }} />
        <div className="absolute top-2.5 h-4 w-0.5 bg-white/40" style={{ left: pct(round.freezeEnd) }} title="Конец закупки" />
        {round.kills.map((k, i) => (
          <div key={i} className="absolute top-1 size-3 -translate-x-1/2 rounded-full border-2 border-[#0f120c]" style={{ left: pct(k.t), background: k.vs ? SIDE_COLOR[k.vs === "T" ? "CT" : "T"] : "#ccc" }} title={`${k.a != null ? data.players[k.a]?.name : "мир"} → ${data.players[k.v]?.name}`} />
        ))}
        {round.bomb?.planted && <div className="absolute top-0 -translate-x-1/2 text-[13px]" style={{ left: pct(round.bomb.planted.t) }} title="Плент">💣</div>}
        {round.bomb?.defused && <div className="absolute top-0 -translate-x-1/2 text-[13px]" style={{ left: pct(round.bomb.defused.t) }} title="Разминирование">🔧</div>}
        <input
          type="range"
          min={round.start}
          max={round.end + TAIL}
          step={1}
          value={tick}
          onChange={(e) => { setTick(Number(e.target.value)); setPlaying(false); }}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          aria-label="Время раунда"
        />
      </div>

      {/* раунды */}
      <div className="mt-2 flex flex-wrap items-center gap-1">
        {data.rounds.map((r, i) => {
          const aWon = r.winner && r.aSide ? r.winner === r.aSide : null;
          return (
            <span key={r.n} className="contents">
              {r.n === 13 && <span className="mx-1 h-6 w-px bg-white/20" title="Смена сторон" />}
              <button
                type="button"
                onClick={() => selectRound(i)}
                title={`Раунд ${r.n}: ${aWon == null ? "—" : aWon ? data.teams.A : data.teams.B} · ${REASON[r.reason ?? ""] ?? r.reason ?? ""}`}
                className={`h-7 min-w-7 rounded-md px-1 text-[12px] font-bold ${i === ri ? "ring-2 ring-[#d4ff1f]" : ""}`}
                style={{ background: r.winner ? SIDE_COLOR[r.winner] : "rgba(255,255,255,0.1)", opacity: aWon ? 1 : 0.45, color: "#0b0d09" }}
              >
                {r.n}
              </button>
            </span>
          );
        })}
      </div>
      <p className="mt-1.5 text-[12px] text-white/45">Яркие — раунды {data.teams.A}, бледные — {data.teams.B}; цвет — сторона, которая выиграла. Клик по игроку — подсветить и показать его путь.</p>
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
  const { ref, base, crop } = useRadarCanvas(data.map, meta, lower);
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
    beginDraw(g, crop);
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
    drawCallouts(g, data, meta, lower);
  }, [points, base, what, ref, data, meta, lower, crop]);
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
  const { ref, base, crop } = useRadarCanvas(data.map, meta, lower);
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
    beginDraw(g, crop);
    if (base) g.drawImage(base, 0, 0, 1024, 1024);
    const col = NADE_COLOR[type] ?? "#fff";
    for (const { from, to } of list) {
      g.strokeStyle = col; g.globalAlpha = 0.35;
      g.beginPath(); g.moveTo(from[0], from[1]); g.lineTo(to[0], to[1]); g.stroke();
      g.globalAlpha = 1; g.fillStyle = col;
      g.beginPath(); g.arc(to[0], to[1], type === "smoke" ? 9 : 6, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#0d0f0a"; g.stroke();
    }
    drawCallouts(g, data, meta, lower);
  }, [list, base, type, ref, data, meta, lower, crop]);
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
