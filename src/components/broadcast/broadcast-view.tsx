"use client";

/* eslint-disable @next/next/no-img-element -- логотипы и аватары с любого https-адреса, без оптимизатора: OBS грузит страницу напрямую */

import { useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import {
  SCENE_TITLE,
  availableScenes,
  nextScene,
  parseBroadcastParams,
  type BcGroup,
  type BcLeader,
  type BcMatch,
  type BcTeam,
  type BroadcastPayload,
  type Scene,
} from "@/lib/broadcast";
import { BC_CSS } from "./broadcast-css";

const W = 1920;
const H = 1080;
const TZ = "Asia/Almaty";
const FADE_MS = 450;
/** опрос отпечатка /api/live (кэш CDN 2 с) */
const WATCH_MS = 4000;
/** полное обновление в любом случае — статистика игроков не входит в отпечаток */
const FULL_MS = 60_000;

/**
 * Экран перерыва трансляции. Макет 1920×1080, масштабируется под окно источника целиком (без полос прокрутки).
 *   ?tournament=<slug> &scene=bracket|schedule|live|stats|auto &interval=15 &lower=1 &footer=<текст партнёра>
 * В авторежиме сцены сменяются по кругу с плавным затуханием; пустые (нет live, нет статистики) пропускаются.
 */
export function BroadcastView() {
  const sp = useSearchParams();
  const params = parseBroadcastParams(sp);
  const mock = process.env.NODE_ENV !== "production" && sp.get("mock") === "1";
  const data = useBroadcastData(mock ? "mock=1" : params.tournament ? `tournament=${encodeURIComponent(params.tournament)}` : "", mock);
  const stageRef = useFitScale();

  const available = data ? availableScenes(data) : [];
  const fixed = params.scene === "auto" ? null : params.scene;
  const { scene, fading, cycle } = useRotation(fixed, available, params.interval);

  const t = data?.tournament ?? null;
  const footer = params.footer ?? (t?.sponsors.length ? `Партнёры: ${t.sponsors.join(" · ")}` : null);

  return (
    <div className="bc-root">
      <style>{BC_CSS}</style>
      <div className="bc-stage" ref={stageRef} style={{ width: W, height: H }}>
        <Backdrop />
        <header className="bc-head">
          <img src="/brand/f16-arena-white.svg" alt="F16 Arena" className="bc-head-logo" draggable={false} />
          <span className="bc-head-div" />
          <div className="bc-head-title">
            <div className="bc-head-name">{t?.name ?? "F16 Arena"}</div>
            <div className="bc-head-stage">
              {data && data.live.length > 0 && (
                <span className="bc-onair">
                  <span className="bc-dot" /> {data.live.length > 1 ? `${data.live.length} матча в эфире` : "Матч в эфире"}
                </span>
              )}
              <span>{t?.stage || "Турнирная платформа"}</span>
            </div>
          </div>
          {!fixed && available.length > 1 && scene && (
            <nav className="bc-tabs">
              {available.map((s) => (
                <span key={s} className={`bc-tab${s === scene ? " is-on" : ""}`}>
                  {SCENE_TITLE[s]}
                  {s === scene && <span key={cycle} className="bc-tab-bar" style={{ animationDuration: `${params.interval}s` }} />}
                </span>
              ))}
            </nav>
          )}
          <Clock />
        </header>

        <main className={`bc-main${fading ? " is-out" : ""}`}>
          {!data ? null : scene ? (
            <div key={`${scene}-${cycle}`} className="bc-scene">
              <SceneView scene={scene} data={data} />
            </div>
          ) : (
            <Idle data={data} />
          )}
        </main>

        {params.lower && data && <Ticker data={data} />}

        <footer className="bc-foot">
          <span className="bc-foot-site">
            <img src="/brand/f16-symbol-white.svg" alt="" className="bc-foot-mark" draggable={false} />
            tournament.f16-arena.kz
          </span>
          <span className="bc-foot-mid">{footer}</span>
          <span className="bc-foot-break">
            <span className="bc-dot bc-dot-soft" /> Перерыв · скоро продолжим
          </span>
        </footer>
      </div>
    </div>
  );
}

// ───────────────────────── масштаб, данные, смена сцен

/** Сцена 1920×1080 вписывается в окно целиком; пересчёт — только при изменении размера окна, без перерисовки React */
function useFitScale() {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const s = Math.min(window.innerWidth / W, window.innerHeight / H) || 1;
      el.style.transform = `translate(-50%, -50%) scale(${s})`;
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  return ref;
}

/** Ответ без метки времени: одинаковые данные не перерисовывают экран */
const stamp = (text: string) => text.replace(/"updated_at":"[^"]*"/, "");

/**
 * Данные экрана. Дёшево и надолго: раз в 4 с — отпечаток турнира (/api/live), полный ответ — только когда
 * отпечаток сменился (и ещё раз через 6 с, когда истечёт кэш CDN), плюс раз в минуту. Сбой сети не гасит
 * экран: остаётся последний ответ. В скрытом источнике OBS опрос на паузе.
 */
function useBroadcastData(query: string, mock: boolean) {
  const [data, setData] = useState<BroadcastPayload | null>(null);
  useEffect(() => {
    let alive = true;
    let last = "";
    let fingerprint: string | null = null;
    let lastFull = 0;
    let busy = false;
    let followUp: ReturnType<typeof setTimeout> | undefined;
    let tournamentId: string | null = null;

    const full = async () => {
      lastFull = Date.now();
      try {
        const res = await fetch(`/api/public/broadcast${query ? `?${query}` : ""}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const text = await res.text();
        const key = stamp(text);
        if (key === last) return;
        last = key;
        const next = JSON.parse(text) as BroadcastPayload;
        tournamentId = next.tournament?.id ?? null;
        setData(next);
      } catch {
        // сеть моргнула — ждём следующего опроса
      }
    };

    const tick = async () => {
      if (document.hidden || busy) return;
      busy = true;
      try {
        if (mock || !tournamentId) {
          if (mock || Date.now() - lastFull >= 15_000) await full();
          return;
        }
        if (Date.now() - lastFull >= FULL_MS) {
          await full();
          return;
        }
        const res = await fetch(`/api/live?k=${encodeURIComponent(`tournament:${tournamentId}`)}`, { cache: "no-store" });
        if (!res.ok || !alive) return;
        const { v } = (await res.json()) as { v: string };
        if (fingerprint !== null && v !== fingerprint) {
          await full();
          clearTimeout(followUp);
          followUp = setTimeout(() => void full(), 6000);
        }
        fingerprint = v;
      } catch {
        // сеть моргнула
      } finally {
        busy = false;
      }
    };

    void full();
    const id = setInterval(tick, mock ? 5000 : WATCH_MS);
    const onVisible = () => {
      if (!document.hidden) void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      clearInterval(id);
      clearTimeout(followUp);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [query, mock]);
  return data;
}

/** Авторежим: сцена держится interval секунд, затем затухает и сменяется следующей непустой */
function useRotation(fixed: Scene | null, available: Scene[], interval: number) {
  const [picked, setPicked] = useState<Scene | null>(null);
  const [fading, setFading] = useState(false);
  const [cycle, setCycle] = useState(0);
  const availableKey = available.join(",");
  const scene: Scene | null = fixed ?? (picked && available.includes(picked) ? picked : nextScene(available, picked));

  useEffect(() => {
    if (fixed || available.length < 2 || !scene) return;
    let swap: ReturnType<typeof setTimeout> | undefined;
    const hold = setTimeout(() => {
      setFading(true);
      swap = setTimeout(() => {
        setPicked(nextScene(availableKey.split(",") as Scene[], scene));
        setCycle((c) => c + 1);
        setFading(false);
      }, FADE_MS);
    }, interval * 1000);
    return () => {
      clearTimeout(hold);
      clearTimeout(swap);
    };
    // available — по ключу: новые данные с тем же набором сцен не сбрасывают таймер
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fixed, scene, availableKey, interval, cycle]);

  return { scene, fading: fading && !fixed, cycle };
}

// ───────────────────────── оболочка

function Backdrop() {
  return (
    <div className="bc-bg" aria-hidden>
      <div className="bc-bg-glow" />
      <div className="bc-bg-grid" />
      <img src="/brand/f16-symbol-white.svg" alt="" className="bc-bg-mark" draggable={false} />
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  const time = now ? new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(now) : "--:--";
  const day = now ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", timeZone: TZ }).format(now) : "";
  return (
    <div className="bc-clock">
      <div className="bc-clock-time">{time}</div>
      <div className="bc-clock-day">{day}</div>
    </div>
  );
}

function SceneView({ scene, data }: { scene: Scene; data: BroadcastPayload }) {
  if (scene === "bracket") return <BracketScene data={data} />;
  if (scene === "schedule") return <ScheduleScene data={data} />;
  if (scene === "live") return <LiveScene matches={data.live} />;
  return <LeadersScene leaders={data.leaders} mvp={data.mvp} />;
}

function SceneHead({ title, sub }: { title: string; sub?: ReactNode }) {
  return (
    <div className="bc-scene-head">
      <h1 className="bc-scene-title">{title}</h1>
      {sub && <div className="bc-scene-sub">{sub}</div>}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="bc-empty">
      <img src="/brand/f16-symbol.svg" alt="" className="bc-empty-mark" draggable={false} />
      <div>{text}</div>
    </div>
  );
}

function Idle({ data }: { data: BroadcastPayload }) {
  const t = data.tournament;
  return (
    <div className="bc-idle">
      <img src="/brand/f16-symbol.svg" alt="" className="bc-idle-mark" draggable={false} />
      <div className="bc-idle-name">{t?.name ?? "F16 Arena"}</div>
      <div className="bc-idle-text">{t ? t.stage || "Скоро начало" : "Скоро турнир — следите за анонсами"}</div>
    </div>
  );
}

// ───────────────────────── команды

function hue(s: string) {
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return h;
}

function Logo({ team, size }: { team: BcTeam | null; size: number }) {
  const [broken, setBroken] = useState<string | null>(null);
  const style: CSSProperties = { width: size, height: size };
  if (!team) return <span className="bc-logo bc-logo-tbd" style={style} />;
  if (team.logo && broken !== team.logo) {
    return <img src={team.logo} alt="" className="bc-logo" style={style} draggable={false} onError={() => setBroken(team.logo)} />;
  }
  const h = hue(team.tag || team.name);
  return (
    <span
      className="bc-logo bc-logo-tag"
      style={{ ...style, fontSize: Math.round(size * 0.34), background: `linear-gradient(135deg, hsl(${h} 42% 26%), hsl(${h} 46% 16%))`, color: `hsl(${h} 80% 84%)` }}
    >
      {team.tag.slice(0, 4).toUpperCase()}
    </span>
  );
}

const nameSize = (name: string, base: number) => (name.length > 26 ? Math.round(base * 0.74) : name.length > 18 ? Math.round(base * 0.86) : base);

// ───────────────────────── «Сетка»

function BracketScene({ data }: { data: BroadcastPayload }) {
  const b = data.bracket;
  if (b.kind === "none") {
    if (!data.groups.length) return <Empty text="Сетка появится после жеребьёвки" />;
    return <GroupsView groups={data.groups} />;
  }
  const teams = new Set(b.upper[0]?.flatMap((m) => [m.team1?.id, m.team2?.id]).filter(Boolean)).size;
  const bo = [...new Set([...b.upper.flat(), ...(b.final ? [b.final] : [])].map((m) => m.bestOf))].sort().map((n) => `BO${n}`).join(" / ");
  if (b.kind === "de") {
    return (
      <div className="bc-fill">
        <SceneHead title="Сетка плей-офф" sub={`Double Elimination · ${bo}`} />
        <div className="bc-de">
          <div className="bc-de-part" style={{ flexGrow: 1.2 }}>
            <div className="bc-de-label">Верхняя сетка</div>
            <BracketGrid columns={[...b.upper, ...(b.final ? [[b.final]] : [])]} dense />
          </div>
          <div className="bc-de-part">
            <div className="bc-de-label">Нижняя сетка</div>
            <BracketGrid columns={b.lower} dense />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="bc-fill">
      <SceneHead title="Сетка плей-офф" sub={`Single Elimination · ${teams || b.upper[0]?.length * 2} команд · ${bo}`} />
      <BracketGrid columns={b.upper} third={b.third} champion />
    </div>
  );
}

/**
 * Колонки раундов. Матч i колонки c стоит по центру своей доли высоты: (i + ½) / n — в классической сетке
 * так он ровно посередине двух матчей, из которых приходят его участники. Линии — только для этой геометрии.
 */
function BracketGrid({ columns, third, champion, dense }: { columns: BcMatch[][]; third?: BcMatch | null; champion?: boolean; dense?: boolean }) {
  const n = columns.length;
  const first = columns[0]?.length ?? 0;
  const compact = dense || first > 8;
  const y = (i: number, len: number) => ((i + 0.5) / len) * 100;
  const final = columns[n - 1]?.length === 1 ? columns[n - 1][0] : null;
  return (
    <div className={`bc-br${compact ? " is-dense" : ""}`} style={{ ["--cols" as string]: n }}>
      {columns.map((col, c) => (
        <div key={c} className={`bc-br-col${col.length >= 8 ? " is-tight" : ""}`}>
          <div className="bc-br-round">
            {col[0]?.stage}
            {col[0] && <span className="bc-br-bo">BO{col[0].bestOf}</span>}
          </div>
          <div className="bc-br-area">
            {col.map((m, i) => (
              <div key={m.id} className="bc-br-slot" style={{ top: `${y(i, col.length)}%` }}>
                <BracketMatch m={m} />
              </div>
            ))}
            {c < n - 1 && <Connectors from={col} to={columns[c + 1]} y={y} />}
            {c === n - 1 && champion && final && (
              <div className="bc-br-slot bc-br-champ-slot" style={{ top: "22%" }}>
                <Champion m={final} />
              </div>
            )}
            {c === n - 1 && third && (
              <div className="bc-br-slot" style={{ top: "80%" }}>
                <div className="bc-br-third">Матч за 3-е место</div>
                <BracketMatch m={third} />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function Connectors({ from, to, y }: { from: BcMatch[]; to: BcMatch[]; y: (i: number, len: number) => number }) {
  if (to.length * 2 === from.length) {
    return (
      <>
        {to.map((m, j) => {
          const a = y(j * 2, from.length);
          const z = y(j * 2 + 1, from.length);
          const done = (k: number) => from[k]?.status === "finished";
          return (
            <span key={m.id}>
              <span className={`bc-br-fork${done(j * 2) ? " is-top" : ""}${done(j * 2 + 1) ? " is-bot" : ""}`} style={{ top: `${a}%`, height: `${z - a}%` }} />
              <span className={`bc-br-join${done(j * 2) && done(j * 2 + 1) ? " is-on" : ""}`} style={{ top: `${y(j, to.length)}%` }} />
            </span>
          );
        })}
      </>
    );
  }
  if (to.length === from.length) {
    return (
      <>
        {from.map((m, i) => (
          <span key={m.id} className={`bc-br-line${m.status === "finished" ? " is-on" : ""}`} style={{ top: `${y(i, from.length)}%` }} />
        ))}
      </>
    );
  }
  return null;
}

function BracketMatch({ m }: { m: BcMatch }) {
  const fin = m.status === "finished";
  const live = m.status === "live";
  const showScore = fin || live;
  const row = (team: BcTeam | null, series: number, side: 1 | 2) => {
    const score = m.rounds ? m.rounds[side - 1] : series;
    const won = fin && m.winner === side;
    const lost = fin && m.winner != null && m.winner !== side;
    return (
      <div className={`bc-bm-row${won ? " is-win" : ""}${lost ? " is-lose" : ""}`}>
        <Logo team={team} size={26} />
        <span className="bc-bm-name">{team?.name ?? (m.bye && fin ? "—" : "TBD")}</span>
        {showScore && !m.bye && <span className="bc-bm-score">{score}</span>}
      </div>
    );
  };
  return (
    <div className={`bc-bm${live ? " is-live" : ""}${m.bye ? " is-bye" : ""}${m.status === "veto" || m.status === "ready" ? " is-next" : ""}`}>
      {live && (
        <span className="bc-bm-flag bc-bm-flag-live">
          <span className="bc-dot" /> Live{m.current ? ` · ${m.current.name} ${m.current.score1}:${m.current.score2}` : ""}
        </span>
      )}
      {m.status === "veto" && <span className="bc-bm-flag bc-bm-flag-veto">Вето карт</span>}
      {m.status === "ready" && <span className="bc-bm-flag bc-bm-flag-ready">Далее</span>}
      {row(m.team1, m.score1, 1)}
      {row(m.team2, m.score2, 2)}
    </div>
  );
}

function Champion({ m }: { m: BcMatch }) {
  const champ = m.status === "finished" && m.winner ? (m.winner === 1 ? m.team1 : m.team2) : null;
  return (
    <div className={`bc-champ${champ ? " is-set" : ""}`}>
      <svg viewBox="0 0 24 24" className="bc-champ-cup" aria-hidden>
        <path
          fill="currentColor"
          d="M7 3h10v2h3v3a4 4 0 0 1-4 4h-.35A5 5 0 0 1 13 14.9V18h3v2H8v-2h3v-3.1A5 5 0 0 1 8.35 12H8a4 4 0 0 1-4-4V5h3V3Zm0 4H6v1a2 2 0 0 0 1 1.73V7Zm10 0v2.73A2 2 0 0 0 18 8V7h-1Z"
        />
      </svg>
      <div className="bc-champ-text">
        <div className="bc-champ-label">Чемпион</div>
        <div className="bc-champ-name">{champ?.name ?? "Определится в финале"}</div>
      </div>
    </div>
  );
}

function GroupsView({ groups }: { groups: BcGroup[] }) {
  const swiss = groups.length === 1 && groups[0].label == null;
  const shown = groups.slice(0, 4);
  const rowsMax = shown.length > 2 ? 5 : shown.length === 2 ? 10 : 12;
  return (
    <div className="bc-fill">
      <SceneHead title={swiss ? "Швейцарская система" : "Групповой этап"} sub="Таблица · победы, разница карт и раундов" />
      <div className={`bc-groups bc-groups-${shown.length}`}>
        {shown.map((g) => (
          <div key={g.label ?? "A"} className="bc-card bc-group">
            {!swiss && <div className="bc-group-label">Группа {g.label}</div>}
            <div className="bc-group-row bc-group-hdr">
              <span>#</span>
              <span>Команда</span>
              <span>В–П</span>
              <span>Карты</span>
              <span>Раунды</span>
            </div>
            {g.rows.slice(0, rowsMax).map((r, i) => (
              <div key={r.team.id} className={`bc-group-row${r.status === "eliminated" ? " is-out" : ""}${r.status === "advanced" ? " is-up" : ""}`}>
                <span className="bc-group-pos">{i + 1}</span>
                <span className="bc-group-team">
                  <Logo team={r.team} size={30} />
                  <span className="bc-ellipsis">{r.team.name}</span>
                </span>
                <span className="bc-num bc-strong">
                  {r.wins}–{r.losses}
                </span>
                <span className="bc-num">{signed(r.mapDiff)}</span>
                <span className="bc-num">{signed(r.roundDiff)}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

// ───────────────────────── «Расписание»

function startTime(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  const day = (x: Date) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: TZ }).format(x);
  const time = new Intl.DateTimeFormat("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).format(d);
  return day(d) === day(new Date()) ? time : `${day(d)}, ${time}`;
}

function ScheduleScene({ data }: { data: BroadcastPayload }) {
  const s = data.schedule;
  const upcoming: { m: BcMatch; kind: "now" | "next" | "soon" }[] = [
    ...s.now.map((m) => ({ m, kind: "now" as const })),
    ...s.next.map((m) => ({ m, kind: "next" as const })),
    ...s.soon.map((m) => ({ m, kind: "soon" as const })),
  ].slice(0, 7);
  const results = s.results.slice(0, 7);
  return (
    <div className="bc-fill">
      <SceneHead title="Расписание" sub={data.tournament?.stage} />
      <div className={`bc-sched${results.length && upcoming.length ? "" : " is-single"}`}>
        {upcoming.length > 0 && (
          <section className="bc-sched-col">
            <div className="bc-col-label">Матчи</div>
            {upcoming.map(({ m, kind }) => (
              <ScheduleRow key={m.id} m={m} kind={kind} />
            ))}
          </section>
        )}
        {results.length > 0 && (
          <section className="bc-sched-col">
            <div className="bc-col-label">Результаты</div>
            {results.map((m) => (
              <ResultRow key={m.id} m={m} />
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

function ScheduleRow({ m, kind }: { m: BcMatch; kind: "now" | "next" | "soon" }) {
  const badge =
    kind === "now" ? (
      <span className="bc-badge bc-badge-live">
        <span className="bc-dot" /> Сейчас
      </span>
    ) : kind === "next" ? (
      <span className="bc-badge bc-badge-next">Далее</span>
    ) : (
      <span className="bc-badge bc-badge-soon">Скоро</span>
    );
  const note =
    kind === "now"
      ? m.current
        ? `${m.current.name} · ${m.current.score1}:${m.current.score2}`
        : "Идёт игра"
      : m.status === "veto"
        ? "Идёт вето карт"
        : m.server === "ready"
          ? "Сервер готов"
          : m.server === "loading"
            ? "Сервер готовится"
            : startTime(m.scheduledAt) ?? "Ждёт старта";
  return (
    <div className={`bc-card bc-srow bc-srow-${kind}`}>
      <div className="bc-srow-side">
        {badge}
        <span className="bc-srow-note">{note}</span>
      </div>
      <div className="bc-srow-teams">
        <TeamInline team={m.team1} />
        <span className="bc-mid">
          <span className="bc-mid-main">
            {kind === "now" ? (
              <span className="bc-num bc-strong">
                {m.score1}:{m.score2}
              </span>
            ) : (
              <span className="bc-vs">vs</span>
            )}
          </span>
          <span className="bc-mid-stage">
            {m.stage} · BO{m.bestOf}
          </span>
        </span>
        <TeamInline team={m.team2} right />
      </div>
    </div>
  );
}

function ResultRow({ m }: { m: BcMatch }) {
  return (
    <div className="bc-card bc-rrow">
      <TeamInline team={m.team1} dim={m.winner === 2} />
      <span className="bc-mid">
        <span className="bc-mid-main bc-num">
          <b className={m.winner === 1 ? "is-win" : ""}>{m.rounds?.[0] ?? m.score1}</b>
          <span className="bc-colon">:</span>
          <b className={m.winner === 2 ? "is-win" : ""}>{m.rounds?.[1] ?? m.score2}</b>
        </span>
        <span className="bc-mid-stage">{m.stage}</span>
      </span>
      <TeamInline team={m.team2} right dim={m.winner === 1} />
    </div>
  );
}

function TeamInline({ team, right, dim }: { team: BcTeam | null; right?: boolean; dim?: boolean }) {
  const name = team?.name ?? "TBD";
  return (
    <span className={`bc-ti${right ? " is-right" : ""}${dim ? " is-dim" : ""}`}>
      <Logo team={team} size={40} />
      <span className="bc-ti-name" style={{ fontSize: nameSize(name, 24) }}>
        {name}
      </span>
    </span>
  );
}

// ───────────────────────── «Идут матчи»

function LiveScene({ matches }: { matches: BcMatch[] }) {
  if (!matches.length) return <Empty text="Сейчас матчей нет — скоро продолжим" />;
  const shown = matches.slice(0, 4);
  return (
    <div className="bc-fill">
      <SceneHead title="Идут матчи" sub={`${matches.length} в эфире · счёт обновляется в реальном времени`} />
      <div className={`bc-live bc-live-${shown.length}`}>
        {shown.map((m) => (
          <LiveCard key={m.id} m={m} logo={shown.length === 1 ? 190 : shown.length === 2 ? 150 : 84} />
        ))}
      </div>
    </div>
  );
}

function LiveCard({ m, logo }: { m: BcMatch; logo: number }) {
  const cur = m.current;
  const s1 = cur ? cur.score1 : m.score1;
  const s2 = cur ? cur.score2 : m.score2;
  return (
    <div className="bc-card bc-lc">
      <div className="bc-lc-top">
        <span className="bc-badge bc-badge-live">
          <span className="bc-dot" /> Live
        </span>
        <span className="bc-lc-stage">
          {m.stage} · BO{m.bestOf}
        </span>
      </div>
      <div className="bc-lc-main">
        <LiveTeam team={m.team1} lead={s1 > s2} size={logo} />
        <div className="bc-lc-center">
          <div className="bc-lc-score bc-num">
            <span className={s1 < s2 ? "is-trail" : ""}>{s1}</span>
            <span className="bc-colon">:</span>
            <span className={s2 < s1 ? "is-trail" : ""}>{s2}</span>
          </div>
          <div className="bc-lc-map">{cur ? cur.name : "Между картами"}</div>
          {m.bestOf > 1 && (
            <div className="bc-lc-series bc-num">
              Серия {m.score1}:{m.score2}
            </div>
          )}
        </div>
        <LiveTeam team={m.team2} right lead={s2 > s1} size={logo} />
      </div>
      {m.maps.length > 1 && (
        <div className="bc-lc-maps">
          {m.maps.map((x) => (
            <span key={x.number} className={`bc-chip bc-chip-${x.status}${x.winner ? ` is-won-${x.winner}` : ""}`}>
              {x.status === "live" && <span className="bc-dot" />}
              <span>{x.name}</span>
              {x.status !== "pending" && (
                <span className="bc-num">
                  {x.score1}:{x.score2}
                </span>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function LiveTeam({ team, right, lead, size }: { team: BcTeam | null; right?: boolean; lead: boolean; size: number }) {
  const name = team?.name ?? "TBD";
  return (
    <div className={`bc-lt${right ? " is-right" : ""}${lead ? " is-lead" : ""}`}>
      <Logo team={team} size={size} />
      <div className="bc-lt-name" style={{ fontSize: nameSize(name, size >= 150 ? 42 : 30) }}>
        {name}
      </div>
    </div>
  );
}

// ───────────────────────── «Лидеры»

function LeadersScene({ leaders, mvp }: { leaders: BcLeader[]; mvp: (BcLeader & { by: "swing" | "rating" }) | null }) {
  if (!leaders.length) return <Empty text="Статистика появится после первых карт" />;
  const swing = leaders.some((p) => p.swing != null);
  return (
    <div className="bc-fill">
      <SceneHead title="Лидеры турнира" sub="F16 Rating · игроки, сыгравшие от 2 карт" />
      <div className="bc-lead">
        {mvp && (
          <div className="bc-card bc-mvp">
            <div className="bc-mvp-label">{mvp.by === "swing" ? "MVP турнира · лучший Swing" : "MVP турнира"}</div>
            <Avatar p={mvp} size={168} />
            <div className="bc-mvp-name">{mvp.name}</div>
            {mvp.team && <div className="bc-mvp-team">{mvp.team}</div>}
            <div className="bc-mvp-stats">
              <Big label="F16 Rating" value={mvp.rating.toFixed(2)} />
              <Big label="K/D" value={mvp.kd.toFixed(2)} />
              <Big label="ADR" value={mvp.adr.toFixed(0)} />
              {mvp.swing != null && <Big label="Swing" value={signedFixed(mvp.swing)} />}
            </div>
          </div>
        )}
        <div className="bc-card bc-table">
          <div className={`bc-trow bc-trow-hdr${swing ? " has-swing" : ""}`}>
            <span>#</span>
            <span>Игрок</span>
            <span>Rating</span>
            <span>K/D</span>
            <span>ADR</span>
            {swing && <span>Swing</span>}
          </div>
          {leaders.map((p, i) => (
            <div key={`${p.name}-${i}`} className={`bc-trow${swing ? " has-swing" : ""}${i < 3 ? " is-top" : ""}`}>
              <span className="bc-trow-pos">{i + 1}</span>
              <span className="bc-trow-player">
                <Avatar p={p} size={44} />
                <span className="bc-trow-names">
                  <span className="bc-ellipsis bc-trow-name">{p.name}</span>
                  {p.team && <span className="bc-ellipsis bc-trow-team">{p.team}</span>}
                </span>
              </span>
              <span className="bc-num bc-strong">{p.rating.toFixed(2)}</span>
              <span className="bc-num">{p.kd.toFixed(2)}</span>
              <span className="bc-num">{p.adr.toFixed(0)}</span>
              {swing && <span className="bc-num">{p.swing != null ? signedFixed(p.swing) : "—"}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const signedFixed = (n: number) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`;

function Avatar({ p, size }: { p: BcLeader; size: number }) {
  const [broken, setBroken] = useState(false);
  if (p.avatar && !broken) {
    return <img src={p.avatar} alt="" className="bc-avatar" style={{ width: size, height: size }} draggable={false} onError={() => setBroken(true)} />;
  }
  const h = hue(p.name);
  return (
    <span
      className="bc-avatar bc-avatar-tag"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.4), background: `linear-gradient(135deg, hsl(${h} 38% 30%), hsl(${h} 42% 18%))` }}
    >
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Big({ label, value }: { label: string; value: string }) {
  return (
    <div className="bc-big">
      <div className="bc-big-value bc-num">{value}</div>
      <div className="bc-big-label">{label}</div>
    </div>
  );
}

// ───────────────────────── бегущая строка (&lower=1)

function Ticker({ data }: { data: BroadcastPayload }) {
  const items: string[] = [
    ...data.live.map((m) => `● LIVE  ${m.team1?.name ?? "TBD"} ${m.current ? `${m.current.score1}:${m.current.score2}` : `${m.score1}:${m.score2}`} ${m.team2?.name ?? "TBD"}${m.current ? ` · ${m.current.name}` : ""}`),
    ...data.schedule.next.map((m) => `Далее  ${m.team1?.name} vs ${m.team2?.name} · ${m.stage}`),
    ...data.schedule.soon.slice(0, 4).map((m) => `${startTime(m.scheduledAt) ?? "Скоро"}  ${m.team1?.name} vs ${m.team2?.name}`),
    ...data.schedule.results.map((m) => `${m.team1?.name ?? "—"} ${m.score1}:${m.score2} ${m.team2?.name ?? "—"} · ${m.stage}`),
  ];
  if (!items.length) items.push("tournament.f16-arena.kz — сетка, матчи и статистика турнира");
  // строка не перезапускается при смене счёта (обновляется на ходу); длительность зависит только от числа пунктов
  const duration = Math.max(30, items.length * 8);
  return (
    <div className="bc-ticker">
      <span className="bc-ticker-label">{data.tournament?.name ?? "F16 Arena"}</span>
      <div className="bc-ticker-track">
        <div className="bc-ticker-run" style={{ animationDuration: `${duration}s` }}>
          {[0, 1].map((copy) => (
            <span key={copy} className="bc-ticker-copy" aria-hidden={copy === 1}>
              {items.map((x, i) => (
                <span key={i} className="bc-ticker-item">
                  {x}
                </span>
              ))}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
