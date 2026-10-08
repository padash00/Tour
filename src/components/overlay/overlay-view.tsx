"use client";

/* eslint-disable @next/next/no-img-element -- логотипы команд с любого https-адреса, без оптимизатора: OBS грузит страницу напрямую */

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OverlayMap, OverlayMatch, OverlayPayload, OverlayTeam } from "@/lib/overlay";

const POLL_MS = 2000;
const TZ = "Asia/Almaty";

/**
 * Оверлей трансляции: плашка счёта сверху по центру, как на HLTV/ESL-трансляциях.
 *   турнир · этап · BO3
 *   [имя ⬚ лого] [1][0] [лого ⬚ имя]
 *   [Ancient 13:9] [● Mirage 9:7] [Nuke · decider]
 * Параметры: theme=dark|clear, scale=0.5…3, idle=hide (без «Скоро»), lower=1 (плашка F16 Arena внизу слева).
 */
export function OverlayView() {
  const sp = useSearchParams();
  const theme = sp.get("theme") === "clear" ? "clear" : "dark";
  const scale = clampScale(sp.get("scale"));
  const hideIdle = sp.get("idle") === "hide";
  const lower = sp.get("lower") === "1";
  const mock = process.env.NODE_ENV !== "production" ? sp.get("mock") : null;
  const source = mock ? `mock=${encodeURIComponent(mock)}` : sourceQuery(sp);
  const data = useOverlayData(source);

  const match = data?.match ?? null;
  return (
    <div className={`ov ov-${theme}`} style={{ ["--ov-scale" as string]: scale }}>
      <style>{CSS}</style>
      <div className="ov-top">
        {match && data?.state === "live" && <Scorebug m={match} />}
        {match && data?.state === "upcoming" && !hideIdle && <Upcoming m={match} />}
      </div>
      {lower && <LowerThird />}
    </div>
  );
}

function clampScale(raw: string | null) {
  const n = raw ? Number(raw) : 1;
  return Number.isFinite(n) && n > 0 ? Math.min(3, Math.max(0.5, n)) : 1;
}

function sourceQuery(sp: URLSearchParams) {
  for (const key of ["server", "match", "tournament"]) {
    const v = sp.get(key);
    if (v) return `${key}=${encodeURIComponent(v)}`;
  }
  return null;
}

/** Опрос раз в 2 с; в скрытой вкладке/неактивной сцене — пауза. Сбой сети не гасит оверлей: остаётся последний ответ */
function useOverlayData(source: string | null) {
  const [data, setData] = useState<OverlayPayload | null>(null);
  useEffect(() => {
    if (!source) return;
    let alive = true;
    let inflight = false;
    const run = async () => {
      if (document.hidden || inflight) return;
      inflight = true;
      try {
        const res = await fetch(`/api/public/overlay?${source}`, { cache: "no-store" });
        if (res.ok && alive) setData((await res.json()) as OverlayPayload);
      } catch {
        // сеть моргнула — ждём следующего опроса
      } finally {
        inflight = false;
      }
    };
    run();
    const id = setInterval(run, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [source]);
  return source ? data : null;
}

// ───────────────────────── плашка счёта

function Scorebug({ m }: { m: OverlayMatch }) {
  // BO1: счёт серии 0:0 до конца карты ничего не говорит — крупно показываем раунды
  const rounds = m.bestOf === 1 && m.current;
  const s1 = rounds ? m.current!.score1 : m.series1;
  const s2 = rounds ? m.current!.score2 : m.series2;
  return (
    <div className="ov-bug">
      <Header m={m} />
      <div className="ov-main">
        <TeamCell team={m.team1} side={1} />
        <Score value={s1} side={1} lead={s1 > s2} />
        <Score value={s2} side={2} lead={s2 > s1} />
        <TeamCell team={m.team2} side={2} />
      </div>
      <MapsRow m={m} />
    </div>
  );
}

function Header({ m }: { m: OverlayMatch }) {
  return (
    <div className="ov-head">
      <img src="/brand/f16-symbol-white.svg" alt="" className="ov-head-mark" draggable={false} />
      <span className="ov-head-name">{m.tournament}</span>
      <span className="ov-head-sep" />
      <span className="ov-head-stage">{m.stage}</span>
      <span className="ov-head-sep" />
      <span className="ov-head-bo">BO{m.bestOf}</span>
    </div>
  );
}

function TeamCell({ team, side }: { team: OverlayTeam; side: 1 | 2 }) {
  return (
    <div className={`ov-team ov-team-${side}`}>
      {/* длинные названия (колледжи, вузы) — мельче и в две строки, а не «ЕВРАЗИЙСКИЙ НАЦ…» */}
      <span className={`ov-team-name${team.name.length > 24 ? " is-sm" : team.name.length > 15 ? " is-md" : ""}`}>{team.name}</span>
      <Logo team={team} />
      <span className="ov-team-bar" />
    </div>
  );
}

function Logo({ team }: { team: OverlayTeam }) {
  const [broken, setBroken] = useState<string | null>(null);
  if (team.logo && broken !== team.logo) {
    return <img src={team.logo} alt="" className="ov-logo" draggable={false} onError={() => setBroken(team.logo)} />;
  }
  return <span className="ov-logo ov-logo-tag">{team.tag.slice(0, 4).toUpperCase()}</span>;
}

function Score({ value, side, lead }: { value: number; side: 1 | 2; lead: boolean }) {
  return (
    <div className={`ov-score ov-score-${side}${lead ? " is-lead" : ""}`}>
      <Num value={value} />
    </div>
  );
}

/** Цифра меняется плавно: новое значение въезжает снизу, рамка коротко вспыхивает */
function Num({ value }: { value: number }) {
  return (
    <span className="ov-num">
      <span key={value} className="ov-num-in">
        {value}
      </span>
    </span>
  );
}

function MapsRow({ m }: { m: OverlayMatch }) {
  if (!m.maps.length) return null;
  const single = m.maps.length === 1;
  return (
    <div className="ov-maps">
      {m.maps.map((x) => (
        <MapChip key={x.number} map={x} m={m} single={single} isNext={m.next?.number === x.number} />
      ))}
    </div>
  );
}

function MapChip({ map, m, single, isNext }: { map: OverlayMap; m: OverlayMatch; single: boolean; isNext: boolean }) {
  if (map.status === "live") {
    return (
      <div className="ov-map ov-map-live">
        <span className="ov-live-dot" />
        <span className="ov-map-name">{map.name}</span>
        {/* в BO1 раунды уже крупно в центре — в строке карт достаточно названия */}
        {m.bestOf > 1 && (
          <span className="ov-map-rounds">
            <Num value={map.score1} />
            <span className="ov-colon">:</span>
            <Num value={map.score2} />
          </span>
        )}
      </div>
    );
  }
  if (map.status === "finished") {
    return (
      <div className={`ov-map ov-map-done ov-won-${map.winner ?? 0}`}>
        <span className="ov-map-name">{map.name}</span>
        <span className="ov-map-result">
          <b className={map.winner === 1 ? "is-win" : ""}>{map.score1}</b>
          <span className="ov-colon">:</span>
          <b className={map.winner === 2 ? "is-win" : ""}>{map.score2}</b>
        </span>
      </div>
    );
  }
  return (
    <div className={`ov-map ov-map-wait${isNext ? " is-next" : ""}`}>
      {isNext && <span className="ov-map-flag">Далее</span>}
      <span className="ov-map-name">{map.name}</span>
      {!single && map.pick == null && <span className="ov-map-flag">decider</span>}
    </div>
  );
}

// ───────────────────────── «Скоро»

function Upcoming({ m }: { m: OverlayMatch }) {
  const when = m.status === "veto" ? "идёт вето карт" : m.scheduledAt ? startTime(m.scheduledAt) : m.status === "ready" ? "скоро начало" : null;
  return (
    <div className="ov-bug">
      <Header m={m} />
      <div className="ov-soon">
        <span className="ov-soon-badge">Скоро</span>
        <span className="ov-soon-teams">
          <Logo team={m.team1} />
          <span className="ov-soon-name">{m.team1.name}</span>
          <span className="ov-soon-vs">vs</span>
          <span className="ov-soon-name">{m.team2.name}</span>
          <Logo team={m.team2} />
        </span>
        {when && <span className="ov-soon-time">{when}</span>}
      </div>
    </div>
  );
}

function startTime(iso: string) {
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: TZ }).format(x);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  return day(d) === day(new Date()) ? time : `${day(d)} · ${time}`;
}

// ───────────────────────── нижняя плашка

function LowerThird() {
  return (
    <div className="ov-lower">
      <img src="/brand/f16-arena-white.svg" alt="F16 Arena" className="ov-lower-logo" draggable={false} />
      <span className="ov-lower-sep" />
      <span className="ov-lower-url">tournament.f16-arena.kz</span>
    </div>
  );
}

// ───────────────────────── стили
// Отдельным <style> внутри страницы: прозрачный фон html/body действует, только пока открыт /overlay.

const CSS = `
html, body { background: transparent !important; overflow: hidden !important; }
#main-content { animation: none !important; }

.ov {
  --ov-panel: rgba(9, 13, 20, 0.94);
  --ov-panel-2: rgba(16, 24, 35, 0.96);
  --ov-head: rgba(6, 9, 14, 0.9);
  --ov-line: rgba(255, 255, 255, 0.08);
  --ov-fg: #f4f7fb;
  --ov-fg-2: #bbc6d5;
  --ov-fg-3: #8d9bad;
  --ov-t1: #6ea8ff;
  --ov-t2: #ff8a43;
  --ov-live: #ff5b64;
  position: fixed; inset: 0; pointer-events: none; overflow: hidden;
  font-family: var(--font-onest), ui-sans-serif, system-ui, sans-serif;
  color: var(--ov-fg);
  font-variant-numeric: tabular-nums;
  -webkit-font-smoothing: antialiased;
}
.ov-clear {
  --ov-panel: rgba(9, 13, 20, 0.58);
  --ov-panel-2: rgba(16, 24, 35, 0.66);
  --ov-head: rgba(6, 9, 14, 0.5);
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
}

.ov-top {
  position: absolute; top: 14px; left: 50%;
  transform: translateX(-50%) scale(var(--ov-scale, 1)); transform-origin: top center;
}
.ov-bug { display: flex; flex-direction: column; align-items: center; animation: ov-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }

/* турнир · этап · BO3 */
.ov-head {
  display: flex; align-items: center; gap: 10px; height: 26px; padding: 0 16px;
  background: var(--ov-head); border-radius: 7px 7px 0 0;
  font-size: 12px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ov-fg-2);
  white-space: nowrap; max-width: 860px;
}
.ov-head-mark { height: 12px; width: auto; opacity: 0.9; }
.ov-head-name { overflow: hidden; text-overflow: ellipsis; }
.ov-head-stage { color: var(--ov-fg); }
.ov-head-bo { color: var(--ov-fg-3); }
.ov-head-sep { width: 3px; height: 3px; border-radius: 50%; background: var(--ov-fg-3); opacity: 0.7; flex-shrink: 0; }

/* команды и счёт */
.ov-main { display: flex; align-items: stretch; height: 60px; filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.45)); }
.ov-team {
  position: relative; display: flex; align-items: center; gap: 14px; width: 340px; padding: 0 16px;
  background: var(--ov-panel); overflow: hidden; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.07);
}
.ov-team-1 { justify-content: flex-end; border-radius: 8px 0 0 8px; }
.ov-team-2 { flex-direction: row-reverse; justify-content: flex-end; border-radius: 0 8px 8px 0; }
.ov-team-name {
  min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 23px; font-weight: 700; letter-spacing: 0.01em; text-transform: uppercase; line-height: 1;
}
.ov-team-name.is-md { font-size: 19px; }
.ov-team-name.is-sm {
  font-size: 15px; line-height: 1.12; white-space: normal;
  display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2;
}
.ov-team-1 .ov-team-name { text-align: right; }
.ov-team-bar { position: absolute; left: 0; right: 0; bottom: 0; height: 3px; }
.ov-team-1 .ov-team-bar { background: linear-gradient(90deg, transparent, var(--ov-t1) 55%); }
.ov-team-2 .ov-team-bar { background: linear-gradient(270deg, transparent, var(--ov-t2) 55%); }

.ov-logo { width: 40px; height: 40px; flex-shrink: 0; object-fit: contain; border-radius: 6px; }
.ov-logo-tag {
  display: grid; place-items: center; background: rgba(255, 255, 255, 0.08);
  font-size: 12px; font-weight: 800; letter-spacing: 0.02em; color: var(--ov-fg-2); text-shadow: none;
}

.ov-score {
  position: relative; display: grid; place-items: center; width: 64px;
  background: var(--ov-panel-2); font-size: 38px; font-weight: 800; line-height: 1; color: var(--ov-fg-2);
}
.ov-score-1 { box-shadow: inset 0 -3px 0 var(--ov-t1); }
.ov-score-2 { box-shadow: inset 0 -3px 0 var(--ov-t2); border-left: 1px solid var(--ov-line); }
.ov-score.is-lead { color: var(--ov-fg); }
.ov-score-1.is-lead { background: linear-gradient(180deg, rgba(110, 168, 255, 0.22), var(--ov-panel-2)); }
.ov-score-2.is-lead { background: linear-gradient(180deg, rgba(255, 138, 67, 0.22), var(--ov-panel-2)); }

.ov-num { display: inline-flex; overflow: hidden; line-height: 1; }
.ov-num-in { display: inline-block; animation: ov-num 420ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }

/* строка карт */
.ov-maps { display: flex; justify-content: center; gap: 3px; margin-top: 4px; }
.ov-map {
  display: flex; align-items: center; gap: 8px; height: 28px; padding: 0 12px;
  background: var(--ov-panel); border-radius: 5px;
  font-size: 13px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; color: var(--ov-fg-2); white-space: nowrap;
}
.ov-map-live { height: 32px; padding: 0 14px; background: var(--ov-panel-2); color: var(--ov-fg); box-shadow: inset 0 0 0 1px rgba(255, 91, 100, 0.35); }
.ov-map-live .ov-map-name { font-size: 14px; font-weight: 700; }
.ov-map-rounds { display: flex; align-items: center; gap: 4px; font-size: 18px; font-weight: 800; letter-spacing: 0; margin-left: 2px; }
.ov-live-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ov-live); box-shadow: 0 0 8px var(--ov-live); animation: ov-pulse 1.6s ease-in-out infinite; }
.ov-map-done { align-self: center; }
.ov-won-1 { box-shadow: inset 3px 0 0 var(--ov-t1); }
.ov-won-2 { box-shadow: inset -3px 0 0 var(--ov-t2); }
.ov-map-result { display: flex; gap: 3px; font-size: 14px; letter-spacing: 0; color: var(--ov-fg-3); }
.ov-map-result b { font-weight: 700; }
.ov-map-result b.is-win { color: var(--ov-fg); }
.ov-colon { color: var(--ov-fg-3); font-weight: 600; }
.ov-map-wait { align-self: center; color: var(--ov-fg-3); }
.ov-map-wait.is-next { color: var(--ov-fg-2); }
.ov-map-flag { font-size: 10px; font-weight: 700; letter-spacing: 0.14em; color: var(--ov-fg-3); opacity: 0.85; }
.ov-map-wait.is-next .ov-map-flag:first-child { color: var(--ov-t1); opacity: 1; }

/* «Скоро» */
.ov-soon {
  display: flex; align-items: center; gap: 16px; height: 52px; padding: 0 18px 0 0;
  background: var(--ov-panel); border-radius: 8px; overflow: hidden;
  filter: drop-shadow(0 10px 22px rgba(0, 0, 0, 0.45));
}
.ov-soon-badge {
  align-self: stretch; display: grid; place-items: center; padding: 0 16px;
  background: var(--ov-t1); color: #06101d; text-shadow: none;
  font-size: 13px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase;
}
.ov-soon-teams { display: flex; align-items: center; gap: 12px; }
.ov-soon-teams .ov-logo { width: 32px; height: 32px; }
.ov-soon-name { font-size: 20px; font-weight: 700; text-transform: uppercase; max-width: 280px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ov-soon-vs { font-size: 13px; font-weight: 600; color: var(--ov-fg-3); text-transform: uppercase; letter-spacing: 0.1em; }
.ov-soon-time { padding-left: 16px; border-left: 1px solid var(--ov-line); font-size: 17px; font-weight: 700; color: var(--ov-fg-2); white-space: nowrap; }

/* нижняя плашка */
.ov-lower {
  position: absolute; left: 40px; bottom: 36px; display: flex; align-items: center; gap: 16px; height: 52px; padding: 0 20px 0 12px;
  background: var(--ov-panel); border-radius: 8px; box-shadow: inset 3px 0 0 var(--ov-t1);
  transform: scale(var(--ov-scale, 1)); transform-origin: bottom left;
  animation: ov-in 360ms cubic-bezier(0.2, 0.8, 0.2, 1) both;
}
.ov-lower-logo { height: 38px; width: auto; }
.ov-lower-sep { width: 1px; height: 24px; background: var(--ov-line); }
.ov-lower-url { font-size: 17px; font-weight: 600; letter-spacing: 0.02em; color: var(--ov-fg-2); }

@keyframes ov-in { from { opacity: 0; transform: translateY(-8px); } }
@keyframes ov-num { from { opacity: 0; transform: translateY(60%); } }
@keyframes ov-pulse { 50% { opacity: 0.35; } }
@media (prefers-reduced-motion: reduce) { .ov *, .ov *::before { animation: none !important; } }
`;
