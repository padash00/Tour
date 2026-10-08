/**
 * Стили экрана перерыва. Отдельным <style> внутри страницы: размеры в px макета 1920×1080 (сцена масштабируется
 * целиком), шкала текста DS с clamp() здесь не годится. Цвета — токены F16 DS.
 */
export const BC_CSS = `
html, body { background: #05080d !important; overflow: hidden !important; }
#main-content { animation: none !important; }

.bc-root {
  --bg: #070b12;
  --card: rgba(13, 20, 31, 0.92);
  --card-2: rgba(19, 29, 43, 0.96);
  --line: rgba(255, 255, 255, 0.085);
  --line-2: rgba(255, 255, 255, 0.16);
  --fg: #f4f7fb;
  --fg-2: #bbc6d5;
  --fg-3: #8d9bad;
  --fg-4: #667589;
  --accent: #6ea8ff;
  --warm: #ff8a43;
  --live: #ff5b64;
  --warn: #e7b45f;
  --ok: #58c99b;
  --gold: #e8c27a;
  position: fixed; inset: 0; overflow: hidden; background: #05080d; cursor: none;
  font-family: var(--font-onest), ui-sans-serif, system-ui, sans-serif;
  color: var(--fg); -webkit-font-smoothing: antialiased; font-feature-settings: "tnum" 1;
}
.bc-stage {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); transform-origin: center;
  display: flex; flex-direction: column; overflow: hidden; background: var(--bg);
}
.bc-num { font-variant-numeric: tabular-nums; }
.bc-strong { font-weight: 800; color: var(--fg); }
.bc-ellipsis { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-colon { color: var(--fg-4); margin: 0 2px; }
.bc-dot { width: 10px; height: 10px; border-radius: 50%; background: var(--live); box-shadow: 0 0 10px var(--live); flex-shrink: 0; animation: bc-pulse 1.6s ease-in-out infinite; }
.bc-dot-soft { background: var(--accent); box-shadow: 0 0 10px var(--accent); }

/* фон: свечение бренда, сетка, знак */
.bc-bg { position: absolute; inset: 0; pointer-events: none; overflow: hidden; }
.bc-bg-glow {
  position: absolute; inset: 0;
  background:
    radial-gradient(1100px 620px at 88% -8%, rgba(110, 168, 255, 0.16), transparent 62%),
    radial-gradient(900px 520px at -6% 108%, rgba(255, 138, 67, 0.10), transparent 60%),
    linear-gradient(180deg, #08101b 0%, #070b12 45%, #06090f 100%);
}
.bc-bg-grid {
  position: absolute; inset: 0; opacity: 0.5;
  background-image: linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px);
  background-size: 64px 64px;
  mask-image: radial-gradient(1200px 700px at 50% 40%, #000 30%, transparent 85%);
}
.bc-bg-mark { position: absolute; right: -140px; bottom: -120px; height: 760px; width: auto; opacity: 0.025; }

/* шапка */
.bc-head { position: relative; z-index: 1; height: 128px; flex-shrink: 0; display: flex; align-items: center; gap: 28px; padding: 0 72px; border-bottom: 1px solid var(--line); background: linear-gradient(180deg, rgba(6, 10, 16, 0.85), rgba(6, 10, 16, 0.35)); }
.bc-head::after { content: ""; position: absolute; left: 72px; bottom: -1px; width: 220px; height: 2px; background: linear-gradient(90deg, var(--warm), transparent); }
.bc-head-logo { height: 62px; width: auto; flex-shrink: 0; }
.bc-head-div { width: 1px; height: 56px; background: var(--line-2); flex-shrink: 0; }
.bc-head-title { min-width: 0; flex: 1; }
.bc-head-name { font-size: 34px; font-weight: 750; letter-spacing: -0.015em; line-height: 1.1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-head-stage { margin-top: 8px; display: flex; align-items: center; gap: 16px; font-size: 17px; font-weight: 650; letter-spacing: 0.16em; text-transform: uppercase; color: var(--accent); white-space: nowrap; }
.bc-onair { display: inline-flex; align-items: center; gap: 9px; color: var(--live); }

.bc-tabs { display: flex; gap: 6px; flex-shrink: 0; }
.bc-tab { position: relative; padding: 12px 18px; border-radius: 10px; font-size: 17px; font-weight: 650; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-4); overflow: hidden; }
.bc-tab.is-on { color: var(--fg); background: rgba(255, 255, 255, 0.06); }
.bc-tab-bar { position: absolute; left: 0; bottom: 0; height: 3px; width: 100%; background: var(--accent); transform-origin: left; animation: bc-progress linear both; }

.bc-clock { flex-shrink: 0; text-align: right; padding-left: 20px; border-left: 1px solid var(--line); min-width: 150px; }
.bc-clock-time { font-size: 44px; font-weight: 750; letter-spacing: -0.01em; line-height: 1; font-variant-numeric: tabular-nums; }
.bc-clock-day { margin-top: 6px; font-size: 15px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--fg-3); }

/* область сцены */
.bc-main { position: relative; z-index: 1; flex: 1; min-height: 0; padding: 26px 72px 30px; transition: opacity ${450}ms ease, transform ${450}ms ease; }
.bc-main.is-out { opacity: 0; transform: translateY(-6px); }
.bc-scene { height: 100%; animation: bc-in 600ms cubic-bezier(0.2, 0.8, 0.2, 1) both; }
.bc-fill { height: 100%; display: flex; flex-direction: column; min-height: 0; }
.bc-scene-head { flex-shrink: 0; display: flex; align-items: baseline; gap: 24px; height: 76px; }
.bc-scene-title { margin: 0; font-size: 52px; font-weight: 800; letter-spacing: -0.025em; line-height: 1; }
.bc-scene-sub { font-size: 21px; font-weight: 550; color: var(--fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc-card { background: var(--card); border: 1px solid var(--line); border-radius: 14px; box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.05), 0 18px 40px rgba(0, 0, 0, 0.28); }

.bc-empty, .bc-idle { height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; gap: 28px; font-size: 38px; font-weight: 650; color: var(--fg-2); }
.bc-empty-mark { height: 120px; width: auto; opacity: 0.85; }
.bc-idle-mark { height: 200px; width: auto; }
.bc-idle-name { font-size: 76px; font-weight: 800; letter-spacing: -0.03em; color: var(--fg); line-height: 1.05; max-width: 1500px; }
.bc-idle-text { font-size: 30px; font-weight: 650; letter-spacing: 0.14em; text-transform: uppercase; color: var(--accent); }

/* логотипы */
.bc-logo { flex-shrink: 0; border-radius: 8px; object-fit: contain; display: block; }
.bc-logo-tag { display: grid; place-items: center; font-weight: 800; letter-spacing: 0.02em; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
.bc-logo-tbd { background: rgba(255, 255, 255, 0.04); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.06); }
.bc-avatar { flex-shrink: 0; border-radius: 50%; object-fit: cover; display: block; }
.bc-avatar-tag { display: grid; place-items: center; font-weight: 800; color: var(--fg); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }

/* сетка */
.bc-br { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); column-gap: 64px; }
.bc-br-col { display: flex; flex-direction: column; min-width: 0; }
.bc-br-round { height: 44px; flex-shrink: 0; display: flex; align-items: center; gap: 12px; font-size: 18px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-2); border-bottom: 1px solid var(--line); margin-bottom: 14px; }
.bc-br-bo { font-size: 13px; letter-spacing: 0.1em; color: var(--fg-3); padding: 3px 8px; border-radius: 6px; background: rgba(255, 255, 255, 0.05); }
.bc-br-area { position: relative; flex: 1; }
.bc-br-slot { position: absolute; left: 0; right: 0; transform: translateY(-50%); }
.bc-br-fork { position: absolute; left: 100%; width: 32px; border: 2px solid var(--line-2); border-left: 0; border-radius: 0 8px 8px 0; }
.bc-br-fork.is-top { border-top-color: rgba(110, 168, 255, 0.55); }
.bc-br-fork.is-bot { border-bottom-color: rgba(110, 168, 255, 0.55); }
.bc-br-join { position: absolute; left: calc(100% + 32px); width: 32px; height: 2px; margin-top: -1px; background: var(--line-2); }
.bc-br-join.is-on { background: rgba(110, 168, 255, 0.55); }
.bc-br-line { position: absolute; left: 100%; width: 64px; height: 2px; margin-top: -1px; background: var(--line-2); }
.bc-br-line.is-on { background: rgba(110, 168, 255, 0.55); }
.bc-br-third { margin-bottom: 10px; font-size: 15px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-3); }

.bc-bm { position: relative; background: var(--card); border: 1px solid var(--line); border-radius: 10px; box-shadow: 0 10px 24px rgba(0, 0, 0, 0.3); }
.bc-bm-row { display: flex; align-items: center; gap: 12px; height: 38px; padding: 0 14px 0 7px; }
.bc-bm-row + .bc-bm-row { border-top: 1px solid var(--line); }
.bc-bm-name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 19px; font-weight: 600; color: var(--fg-2); }
.bc-bm-score { min-width: 30px; text-align: right; font-size: 21px; font-weight: 800; color: var(--fg-3); font-variant-numeric: tabular-nums; }
.bc-bm-row.is-win .bc-bm-name { color: var(--fg); font-weight: 750; }
.bc-bm-row.is-win .bc-bm-score { color: var(--accent); }
.bc-bm-row.is-lose { opacity: 0.48; }
.bc-bm.is-bye { opacity: 0.55; }
.bc-bm.is-live { border-color: rgba(255, 91, 100, 0.75); box-shadow: 0 0 0 1px rgba(255, 91, 100, 0.25), 0 0 32px rgba(255, 91, 100, 0.2); background: linear-gradient(90deg, rgba(255, 91, 100, 0.1), var(--card) 40%); }
.bc-bm.is-live .bc-bm-name { color: var(--fg); }
.bc-bm.is-live .bc-bm-score { color: var(--fg); }
.bc-bm.is-next { border-color: rgba(110, 168, 255, 0.4); }
.bc-bm-flag { position: absolute; bottom: calc(100% + 5px); right: 0; z-index: 1; display: inline-flex; align-items: center; gap: 7px; height: 23px; padding: 0 9px; border-radius: 6px; font-size: 12.5px; font-weight: 800; letter-spacing: 0.1em; text-transform: uppercase; white-space: nowrap; }
.bc-bm-flag .bc-dot { width: 7px; height: 7px; background: #fff; box-shadow: none; }
.bc-bm-flag-live { background: var(--live); color: #fff; }
.bc-bm-flag-veto { background: var(--warn); color: #1a1203; }
.bc-bm-flag-ready { background: var(--accent); color: #06101d; }
.bc-br.is-dense .bc-bm-row { height: 29px; gap: 9px; }
.bc-br.is-dense .bc-bm-name { font-size: 15.5px; }
.bc-br.is-dense .bc-bm-score { font-size: 16px; }
.bc-br.is-dense .bc-logo { width: 20px !important; height: 20px !important; font-size: 8px !important; }
.bc-br.is-dense .bc-br-round { height: 30px; font-size: 14px; margin-bottom: 8px; }
.bc-br.is-dense .bc-bm-flag { height: 18px; font-size: 10.5px; bottom: calc(100% + 3px); }
/* колонка на 8+ матчей: между матчами нет места под плашку — live видно по красной рамке и счёту */
.bc-br-col.is-tight .bc-bm-flag { display: none; }

.bc-champ { display: flex; align-items: center; gap: 16px; padding: 16px 18px; border-radius: 12px; border: 1px solid rgba(232, 194, 122, 0.28); background: linear-gradient(135deg, rgba(232, 194, 122, 0.12), rgba(13, 20, 31, 0.9) 60%); }
.bc-champ-cup { width: 46px; height: 46px; color: var(--gold); flex-shrink: 0; opacity: 0.9; }
.bc-champ-text { min-width: 0; }
.bc-champ-label { font-size: 14px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: var(--gold); }
.bc-champ-name { margin-top: 4px; font-size: 21px; font-weight: 650; color: var(--fg-3); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-champ.is-set .bc-champ-name { font-size: 26px; font-weight: 800; color: var(--fg); }

.bc-de { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 18px; }
.bc-de-part { flex: 1 1 0; min-height: 0; display: flex; flex-direction: column; }
.bc-de-label { font-size: 14px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: var(--warm); margin-bottom: 6px; }

/* группы */
.bc-groups { flex: 1; min-height: 0; display: grid; gap: 28px; }
.bc-groups-2 { grid-template-columns: 1fr 1fr; }
.bc-groups-3, .bc-groups-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.bc-group { padding: 22px 28px; min-height: 0; overflow: hidden; }
.bc-group-label { font-size: 16px; font-weight: 800; letter-spacing: 0.2em; text-transform: uppercase; color: var(--warm); margin-bottom: 10px; }
.bc-group-row { display: grid; grid-template-columns: 48px minmax(0, 1fr) 90px 90px 100px; align-items: center; height: 50px; border-top: 1px solid var(--line); font-size: 22px; color: var(--fg-2); }
.bc-group-row > span:nth-child(n+3) { text-align: right; }
.bc-group-hdr { height: 36px; border-top: 0; font-size: 13px; font-weight: 750; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-3); }
.bc-group-pos { font-weight: 800; color: var(--fg-3); }
.bc-group-team { display: flex; align-items: center; gap: 14px; min-width: 0; font-weight: 700; color: var(--fg); }
.bc-group-row.is-up .bc-group-pos { color: var(--ok); }
.bc-group-row.is-out { opacity: 0.45; }

/* расписание */
.bc-sched { flex: 1; min-height: 0; display: grid; grid-template-columns: 1.18fr 1fr; gap: 40px; }
.bc-sched.is-single { grid-template-columns: minmax(0, 1200px); justify-content: center; }
.bc-sched-col { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.bc-col-label { font-size: 16px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: var(--fg-3); height: 22px; }
.bc-srow { display: grid; grid-template-columns: 196px minmax(0, 1fr); align-items: center; height: 84px; padding: 0 22px 0 18px; }
.bc-srow-now { border-color: rgba(255, 91, 100, 0.5); background: linear-gradient(90deg, rgba(255, 91, 100, 0.12), var(--card) 35%); }
.bc-srow-next { border-color: rgba(110, 168, 255, 0.35); }
.bc-srow-side { display: flex; flex-direction: column; align-items: flex-start; gap: 7px; min-width: 0; }
.bc-srow-note { font-size: 15px; font-weight: 600; color: var(--fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 180px; }
.bc-srow-now .bc-srow-note { color: var(--fg-2); }
.bc-srow-teams, .bc-rrow { display: grid; grid-template-columns: minmax(0, 1fr) 150px minmax(0, 1fr); align-items: center; gap: 12px; }
.bc-rrow { height: 84px; padding: 0 22px; }
.bc-mid { display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 0; }
.bc-mid-main { font-size: 30px; font-weight: 800; line-height: 1; color: var(--fg-3); }
.bc-mid-main b { font-weight: 800; color: var(--fg-3); }
.bc-mid-main b.is-win { color: var(--fg); }
.bc-vs { font-size: 18px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-4); }
.bc-mid-stage { font-size: 12.5px; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-4); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 150px; }
.bc-ti { display: flex; align-items: center; gap: 14px; min-width: 0; }
.bc-ti.is-right { flex-direction: row-reverse; text-align: right; }
.bc-ti-name { min-width: 0; font-weight: 750; line-height: 1.1; color: var(--fg); overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; word-break: break-word; }
.bc-ti.is-dim { opacity: 0.5; }
.bc-badge { display: inline-flex; align-items: center; gap: 8px; height: 30px; padding: 0 12px; border-radius: 7px; font-size: 14px; font-weight: 800; letter-spacing: 0.14em; text-transform: uppercase; white-space: nowrap; }
.bc-badge .bc-dot { width: 8px; height: 8px; background: #fff; box-shadow: none; }
.bc-badge-live { background: var(--live); color: #fff; }
.bc-badge-next { background: var(--accent); color: #06101d; }
.bc-badge-soon { background: rgba(255, 255, 255, 0.07); color: var(--fg-2); box-shadow: inset 0 0 0 1px var(--line-2); }

/* идут матчи */
.bc-live { flex: 1; min-height: 0; display: grid; gap: 28px; }
.bc-live-2 { grid-template-columns: 1fr 1fr; }
.bc-live-3, .bc-live-4 { grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; }
.bc-lc { position: relative; overflow: hidden; display: flex; flex-direction: column; padding: 28px 36px; border-color: rgba(255, 91, 100, 0.35); }
.bc-lc::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 5px; background: var(--live); }
.bc-lc-top { flex-shrink: 0; display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.bc-lc-stage { font-size: 18px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc-lc-main { flex: 1; min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr); align-items: center; gap: 28px; }
.bc-lt { display: flex; flex-direction: column; align-items: center; text-align: center; gap: 22px; min-width: 0; }
.bc-lt-name { min-height: 2.2em; font-weight: 800; letter-spacing: -0.015em; line-height: 1.1; color: var(--fg-2); max-width: 100%; overflow: hidden; display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; word-break: break-word; }
.bc-lt.is-lead .bc-lt-name { color: var(--fg); }
.bc-lc-center { display: flex; flex-direction: column; align-items: center; gap: 10px; }
.bc-lc-score { font-size: 160px; font-weight: 800; line-height: 0.95; letter-spacing: -0.03em; color: var(--fg); white-space: nowrap; }
.bc-lc-score .is-trail { color: var(--fg-3); }
.bc-live-3 .bc-lc-score, .bc-live-4 .bc-lc-score { font-size: 76px; }
.bc-live-1 .bc-lc-score { font-size: 220px; }
.bc-lc-map { font-size: 26px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-2); }
.bc-lc-series { font-size: 21px; font-weight: 700; color: var(--fg-3); padding: 4px 12px; border-radius: 7px; background: rgba(255, 255, 255, 0.05); }
.bc-lc-maps { display: flex; justify-content: center; gap: 10px; flex-wrap: wrap; }
.bc-chip { display: inline-flex; align-items: center; gap: 10px; height: 46px; padding: 0 18px; border-radius: 9px; background: rgba(255, 255, 255, 0.05); font-size: 19px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--fg-3); }
.bc-chip .bc-dot { width: 8px; height: 8px; }
.bc-chip-live { color: var(--fg); background: rgba(255, 91, 100, 0.14); box-shadow: inset 0 0 0 1px rgba(255, 91, 100, 0.45); }
.bc-chip-finished { color: var(--fg-2); }
.bc-chip.is-won-1 { box-shadow: inset 3px 0 0 var(--accent); }
.bc-chip.is-won-2 { box-shadow: inset -3px 0 0 var(--accent); }
.bc-live-3 .bc-lc, .bc-live-4 .bc-lc { padding: 20px 28px; }
.bc-live-3 .bc-chip, .bc-live-4 .bc-chip { height: 32px; font-size: 14px; padding: 0 12px; }

/* лидеры */
.bc-lead { flex: 1; min-height: 0; display: grid; grid-template-columns: 540px minmax(0, 1fr); gap: 36px; }
.bc-mvp { position: relative; overflow: hidden; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 32px; border-color: rgba(232, 194, 122, 0.3); background: radial-gradient(520px 360px at 50% 0%, rgba(232, 194, 122, 0.14), transparent 70%), var(--card); }
.bc-mvp-label { font-size: 16px; font-weight: 800; letter-spacing: 0.22em; text-transform: uppercase; color: var(--gold); margin-bottom: 28px; }
.bc-mvp .bc-avatar { box-shadow: 0 0 0 4px rgba(232, 194, 122, 0.5), 0 20px 50px rgba(0, 0, 0, 0.4); }
.bc-mvp-name { margin-top: 26px; font-size: 52px; font-weight: 800; letter-spacing: -0.02em; line-height: 1.05; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.bc-mvp-team { margin-top: 8px; font-size: 22px; font-weight: 600; color: var(--fg-3); }
.bc-mvp-stats { margin-top: 36px; display: flex; gap: 34px; }
.bc-big-value { font-size: 40px; font-weight: 800; line-height: 1; }
.bc-big-label { margin-top: 8px; font-size: 13px; font-weight: 750; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-3); }
.bc-table { padding: 14px 32px; display: flex; flex-direction: column; }
.bc-trow { flex: 1; display: grid; grid-template-columns: 60px minmax(0, 1fr) 130px 110px 110px; align-items: center; border-top: 1px solid var(--line); font-size: 25px; color: var(--fg-2); }
.bc-trow.has-swing { grid-template-columns: 60px minmax(0, 1fr) 130px 110px 110px 110px; }
.bc-trow > span:nth-child(n+3) { text-align: right; }
.bc-trow-hdr { flex: 0 0 48px; border-top: 0; font-size: 14px; font-weight: 750; letter-spacing: 0.16em; text-transform: uppercase; color: var(--fg-3); }
.bc-trow-pos { font-weight: 800; color: var(--fg-4); }
.bc-trow.is-top .bc-trow-pos { color: var(--gold); }
.bc-trow-player { display: flex; align-items: center; gap: 16px; min-width: 0; }
.bc-trow-names { display: flex; flex-direction: column; min-width: 0; }
.bc-trow-name { font-weight: 750; color: var(--fg); }
.bc-trow-team { font-size: 15px; font-weight: 600; color: var(--fg-3); }

/* бегущая строка */
.bc-ticker { position: relative; z-index: 1; flex-shrink: 0; height: 58px; display: flex; align-items: stretch; background: rgba(6, 10, 16, 0.92); border-top: 1px solid var(--line); }
.bc-ticker-label { flex-shrink: 0; display: flex; align-items: center; padding: 0 26px 0 72px; max-width: 520px; background: linear-gradient(90deg, #0d1828, #12223a); font-size: 16px; font-weight: 800; letter-spacing: 0.12em; text-transform: uppercase; color: var(--accent); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; box-shadow: 8px 0 18px rgba(0, 0, 0, 0.4); z-index: 1; }
.bc-ticker-track { flex: 1; min-width: 0; overflow: hidden; display: flex; align-items: center; mask-image: linear-gradient(90deg, transparent, #000 40px, #000 calc(100% - 40px), transparent); }
.bc-ticker-run { display: flex; width: max-content; animation: bc-marquee linear infinite; will-change: transform; }
.bc-ticker-copy { display: flex; }
.bc-ticker-item { padding: 0 34px; font-size: 21px; font-weight: 650; color: var(--fg-2); white-space: nowrap; border-right: 1px solid var(--line-2); }

/* подвал */
.bc-foot { position: relative; z-index: 1; flex-shrink: 0; height: 72px; display: flex; align-items: center; gap: 32px; padding: 0 72px; border-top: 1px solid var(--line); background: rgba(5, 8, 13, 0.75); }
.bc-foot-site { display: inline-flex; align-items: center; gap: 14px; font-size: 22px; font-weight: 700; letter-spacing: 0.01em; color: var(--fg); white-space: nowrap; }
.bc-foot-mark { height: 26px; width: auto; }
.bc-foot-mid { flex: 1; min-width: 0; text-align: center; font-size: 19px; font-weight: 600; letter-spacing: 0.04em; color: var(--fg-3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bc-foot-break { display: inline-flex; align-items: center; gap: 12px; font-size: 17px; font-weight: 750; letter-spacing: 0.14em; text-transform: uppercase; color: var(--fg-2); white-space: nowrap; }

@keyframes bc-in { from { opacity: 0; transform: translateY(14px); } }
@keyframes bc-progress { from { transform: scaleX(0); } to { transform: scaleX(1); } }
@keyframes bc-pulse { 50% { opacity: 0.35; } }
@keyframes bc-marquee { from { transform: translateX(0); } to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .bc-root *, .bc-root *::before { animation-duration: 0s !important; } .bc-ticker-run { animation: none !important; } }
`;
