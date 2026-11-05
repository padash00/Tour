"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ClipView, NADE_COLOR, SIDE_COLOR, placeLabel, useGzJson } from "./replay";

/*
 * Разбор игрока против топов (server/analyzer/coach.mjs): цифры «ты / топы», выводы по темам,
 * у каждого момента — два клипа рядом: слева твой момент, справа такой же момент у про.
 */

type ClipRef = { analysis: string; round: number; t: number; t1?: number; end?: number; who: string | null };
type Moment = ClipRef & {
  place?: string | null; side?: "T" | "CT"; by?: string; weapon?: string; rt?: number;
  type?: string; from?: string | null; to?: string | null; standard?: boolean;
  died?: boolean; gotKill?: boolean; gap?: number; proDied?: number | null; proCount?: number;
  vs?: number; won?: boolean; kills?: number; route?: string[]; nades?: string[]; proWin?: number | null;
  proShare?: number;
  shots?: number; team?: number; mate?: string; dist?: number; self?: boolean; enemies?: number; kind?: string; equip?: number; money?: number; teamAvg?: number;
  pro?: (ClipRef & { from?: string; to?: string; route?: string[]; nades?: string[] }) | null;
};
type Pair = [number | null, number | null];
type Skill = {
  accuracy: Pair; hs: Pair; firstBullet: Pair; spray: Pair; shotsPerKill: Pair; enemiesPerFlash: Pair; blindSecPerFlash: Pair; teamFlashPct: Pair; flashKillPct: Pair; heDmg: Pair; mollyDmg: Pair;
  counterStrafe?: Pair; ttd?: Pair; crosshair?: Pair; utilOnDeath?: Pair; ctSmokeStop?: Pair; tradeAttempt?: Pair; tradeSuccess?: Pair; tradedAttempt?: Pair; tradedSuccess?: Pair;
};
type Finding = { topic: string; title: string; moments: Moment[]; perRound?: Record<string, [number, number]>; skill?: Skill };
type Highlight = ClipRef & { kind: string; title: string; kills: number; hs?: number; weapons?: string[] };
type Fight = { at: number; enemy: string; place: string | null; shots: number; hits: number; head: number; dmg: number; took: number; firstHit: string; result: string; moving: number | null; rifleShots: number; ttd: number | null; aimDeg: number | null };
type RoundStory = {
  n: number; side: "T" | "CT"; won: boolean; buy: string | null; equip: number | null;
  route: { place: string; at: number }[]; at20: string | null; at20Pro: number | null;
  nades: { type: string; from: string | null; to: string | null; at: number; enemies?: number }[];
  fights: Fight[]; kills: { at: number; victim: string; hs: boolean }[]; damage: number;
  death: { at: number; place: string | null; by: string | null; traded: boolean; nearestMate: number | null; util: number | null } | null;
  bomb: string | null; tags: string[]; start: number; end: number; text: string;
};
type Report = {
  v: number; map: string; player: { name: string; steamid: string }; analysis: string; proMaps: number;
  stats: { rounds: number; kpr: [number, number]; dpr: [number, number]; adr: [number, number]; openingDeathRate: [number, number]; openingKillRate: [number, number]; traded: [number, number]; nadesPerRound: Record<string, [number, number]> };
  findings: Finding[];
  highlights?: Highlight[];
  rounds?: RoundStory[];
  skill?: Skill;
};

const TR = 64;
const P = (n: string | null | undefined) => (n ? placeLabel(n) : "?");
const t = (s?: number) => (s == null ? "" : `${Math.floor(Math.max(0, s) / 60)}:${String(Math.round(Math.max(0, s) % 60)).padStart(2, "0")}`);
const NADE_ONE: Record<string, string> = { smoke: "смок", flash: "флешка", molotov: "молотов", he: "HE" };
const ORDER = ["trades", "opening_deaths", "aim", "utility", "flashes", "repeeks", "clutches", "economy", "positions"];
const ABOUT: Record<string, string> = {
  trades: "Размен — когда напарник убивает твоего убийцу. «Мог разменять» — ты был в 10 м от убийцы напарника или видел его; «пытался» — вступил с ним в бой за 5 секунд. Ниже — смерти без размена и моменты, когда напарника убили рядом, а ты не вступил.",
  opening_deaths: "Первая смерть раунда — самое дорогое: команда сразу играет 4 против 5. Справа — как про на этом же месте выигрывает первую дуэль.",
  utility: "Каждую твою гранату сравниваем с раскидками топов: та же точка броска и то же место падения — «как у топов». Справа — как её кидает про.",
  repeeks: "Второй тайминг — выглянул, спрятался и снова вышел в тот же угол. Соперник уже ждёт, поэтому это часто кончается смертью.",
  clutches: "Последний живой против одного или нескольких. Справа — выигранный клатч про в похожей ситуации.",
  positions: "Где ты стоишь на 20-й секунде раунда и насколько часто там стоят топы. Редкая позиция — не ошибка, но повод проверить, зачем ты там.",
  aim: "Считаем только выстрелы в бою (видел врага или шёл обмен уроном). Время до урона — от появления врага до первого попадания. Довод прицела — на сколько градусов пришлось довести прицел до попадания: меньше — значит прицел уже стоял на уровне головы. Контрстрейф — доля выстрелов из винтовки с остановки (скорость ниже 34% от максимальной). Спрей — очереди из винтовки от 3 пуль.",
  flashes: "Хорошая флешка ослепляет врагов дольше 1.1 секунды и не трогает своих. Слепота — по самому ослеплённому врагу. Ниже — флешки, которые ослепили своих или никого; справа — как про кидает флешку в это место.",
  economy: "Закупка вместе с командой — основа экономики. Форс в одного, сейв, когда все купились, и недокуп с деньгами в кармане обычно стоят раунда.",
};

function StatCard({ label, me, pro, better }: { label: string; me: number; pro: number; better: "up" | "down"; }) {
  const good = better === "up" ? me >= pro : me <= pro;
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.04] p-3">
      <div className="text-[12.5px] text-white/55">{label}</div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`num text-[24px] font-black ${good ? "text-[#9fe870]" : "text-[#ff8a7a]"}`}>{me}</span>
        <span className="text-[13px] text-white/45">топы {pro}</span>
      </div>
    </div>
  );
}

function SkillRow({ items }: { items: (readonly [string, Pair, "up" | "down", string?])[] }) {
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
      {items.map(([label, [me, pro], better, unit]) => {
        const good = me == null || pro == null ? null : better === "up" ? me >= pro : me <= pro;
        return (
          <div key={label} className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2">
            <div className="text-[12px] text-white/55">{label}</div>
            <div className="mt-0.5 flex items-baseline gap-1.5">
              <span className={`num text-[19px] font-black ${good == null ? "text-white" : good ? "text-[#9fe870]" : "text-[#ff8a7a]"}`}>{me ?? "—"}{me != null ? unit ?? "" : ""}</span>
              <span className="text-[12px] text-white/45">топы {pro ?? "—"}{pro != null ? unit ?? "" : ""}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function momentText(f: Finding, m: Moment) {
  const head = `Раунд ${m.round}${m.rt != null ? ` · ${t(m.rt)}` : ""}`;
  switch (f.topic) {
    case "opening_deaths":
      return { head, body: `Умер первым на ${P(m.place)} — убил ${m.by} (${m.weapon})`, tone: "bad" as const };
    case "trades":
      if (m.kind === "missed") return { head, body: `Напарника ${m.mate ?? ""} убил ${m.by ?? "?"}${m.place ? ` на ${P(m.place)}` : ""} в ${Math.round((m.dist ?? 0) / 100)} м от тебя — ты не вступил в бой`, tone: "warn" as const, tag: "упущенный размен" };
      return { head, body: `Смерть на ${P(m.place)} — напарника рядом не было, не разменяли`, tone: "bad" as const };
    case "utility":
      return { head, body: `${NADE_ONE[m.type ?? ""] ?? m.type}: ${P(m.from)} → ${P(m.to)}`, tone: m.standard ? ("good" as const) : ("warn" as const), tag: m.standard ? "как у топов" : "не так, как у топов" };
    case "repeeks":
      return { head, body: `${P(m.place)}: снова вышел через ${m.gap} с → ${m.died ? "умер" : m.gotKill ? "убил" : "без результата"}${m.proDied != null ? ` · у топов здесь умирают в ${m.proDied}%` : ""}`, tone: m.died ? ("bad" as const) : ("good" as const) };
    case "clutches":
      return { head, body: `1 против ${m.vs} — ${m.won ? "вытащил" : "проиграл"}, убил ${m.kills}${m.route?.length ? ` · ${m.route.map(P).join(" → ")}` : ""}${m.proWin != null ? ` · топы выигрывают 1v${m.vs} в ${m.proWin}%` : ""}`, tone: m.won ? ("good" as const) : ("bad" as const) };
    case "aim":
      return { head, body: `Умер после очереди мимо: ${m.shots} выстрелов, ни одного попадания — убил ${m.by ?? "?"}`, tone: "bad" as const };
    case "flashes":
      return {
        head,
        body: `Флешка ${P(m.from)} → ${P(m.to)}: ${m.team ? `ослепила своих (${m.team})` : ""}${m.team && m.self ? ", " : ""}${m.self ? "ослепила тебя" : ""}${!m.team && !m.self ? "никого не ослепила" : ""}${m.enemies ? ` · врагов: ${m.enemies}` : ""}`,
        tone: m.team || m.self ? ("bad" as const) : ("warn" as const),
      };
    case "economy": {
      const what = m.kind === "force_alone" ? `Форс в одного: у тебя $${m.equip}, у команды в среднем $${m.teamAvg}` : m.kind === "save_alone" ? `Сейв в одного: у тебя $${m.equip}, команда купилась ($${m.teamAvg})` : `Недокуп: снаряжение $${m.equip}, а в кармане $${m.money}`;
      return { head, body: `${what} · раунд ${m.won ? "выигран" : "проигран"}`, tone: m.won ? ("warn" as const) : ("bad" as const) };
    }
    case "positions":
      return { head: `Раунд ${m.round}`, body: `${m.side} · ${P(m.place)} — у топов здесь ${m.proShare}% игроков на 0:20`, tone: (m.proShare ?? 0) < 3 ? ("warn" as const) : ("good" as const), tag: (m.proShare ?? 0) < 3 ? "редкая позиция" : undefined };
    default:
      return { head, body: "", tone: "good" as const };
  }
}

const TONE = { good: "border-[#9fe870]/30", warn: "border-[#ffb347]/40", bad: "border-[#ff6a5a]/40" };

function Compare({ f, m, me }: { f: Finding; m: Moment; me: string }) {
  const myEnd = f.topic === "clutches" ? (m.end ?? m.t) + 2 * TR : (m.t1 ?? m.t) + (f.topic === "utility" && m.type === "smoke" ? 5 : 3) * TR;
  const myFrom = f.topic === "clutches" ? m.t - TR : f.topic === "positions" ? m.t - 6 * TR : m.t - 5 * TR;
  const pro = m.pro;
  const proEnd = pro ? (f.topic === "clutches" ? (pro.end ?? pro.t) + 2 * TR : (pro.t1 ?? pro.t) + (f.topic === "utility" && m.type === "smoke" ? 5 : 3) * TR) : 0;
  return (
    <div className="mt-3 grid gap-3 lg:grid-cols-2">
      <div>
        <div className="mb-1.5 text-[13px] font-bold text-white/80">Ты · {me} · раунд {m.round}</div>
        <ClipView analysisId={m.analysis} clip={{ round: m.round, from: myFrom, to: f.topic === "positions" ? m.t + 4 * TR : myEnd }} focusName={me} />
      </div>
      <div>
        {pro ? (
          <>
            <div className="mb-1.5 text-[13px] font-bold text-[#d4ff1f]">Про · {pro.who} · раунд {pro.round}{pro.from ? ` · ${P(pro.from)} → ${P(pro.to)}` : ""}</div>
            <ClipView analysisId={pro.analysis} clip={{ round: pro.round, from: f.topic === "clutches" ? pro.t - TR : pro.t - 5 * TR, to: proEnd }} focusName={pro.who} />
          </>
        ) : (
          <div className="flex h-full min-h-40 items-center justify-center rounded-2xl border border-dashed border-white/15 p-6 text-center text-[14px] text-white/55">
            {f.topic === "trades"
              ? "Здесь сравнивать не с кем: суть ошибки — ты был один. Держись в 1–2 секундах от напарника, чтобы он мог разменять."
              : f.topic === "aim"
                ? "Посмотри слева, куда смотрел прицел до контакта и как ты стрелял. Топы попадают первой пулей чаще: прицел заранее на уровне головы, стрельба с остановки, короткие очереди вместо зажима."
                : f.topic === "economy"
                  ? "Закупайтесь вместе: если команда копит — копи тоже, если команда покупается — докупи всё (броня, гранаты, оружие). Деньги в кармане в раунде с закупкой — потерянный раунд."
                  : "Для этого момента у топов в библиотеке пока нет похожего примера — станет больше с новыми про-демками."}
          </div>
        )}
      </div>
    </div>
  );
}

/** Простая разметка ответа тренера: ### заголовки, списки, **жирный** */
function Md({ text }: { text: string }) {
  const inline = (s: string): ReactNode[] => s.split(/(\*\*[^*]+\*\*)/g).map((x, i) => (x.startsWith("**") && x.endsWith("**") ? <strong key={i} className="text-white">{x.slice(2, -2)}</strong> : x));
  const out: ReactNode[] = [];
  let list: ReactNode[] = [];
  const flush = () => { if (list.length) { out.push(<ul key={`u${out.length}`} className="ml-5 list-disc space-y-1.5">{list}</ul>); list = []; } };
  text.split("\n").forEach((line, i) => {
    const l = line.trim();
    if (!l) { flush(); return; }
    if (l.startsWith("### ")) { flush(); out.push(<h3 key={i} className="mt-4 text-[16px] font-extrabold text-[#d4ff1f] first:mt-0">{l.slice(4)}</h3>); return; }
    const li = /^(?:[-•*]|\d+[.)])\s+(.*)$/.exec(l);
    if (li) { list.push(<li key={i}>{inline(li[1])}</li>); return; }
    flush();
    out.push(<p key={i}>{inline(l)}</p>);
  });
  flush();
  return <div className="space-y-2 text-[14.5px] leading-relaxed text-white/85">{out}</div>;
}

function CoachText({ analysisId, steamid }: { analysisId: string; steamid: string }) {
  const url = `/api/analysis/coach/${analysisId}/${steamid}/text`;
  const [state, setState] = useState<{ text: string | null; at?: string; error?: string; loading: boolean }>({ text: null, loading: true });
  useEffect(() => {
    fetch(url).then((r) => r.json()).then((d) => setState({ text: d.text ?? null, at: d.at, loading: false })).catch(() => setState({ text: null, loading: false }));
  }, [url]);
  const write = async () => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const r = await fetch(url, { method: "POST" });
    const d = await r.json().catch(() => ({}));
    setState(r.ok ? { text: d.text, at: d.at, loading: false } : { text: state.text, loading: false, error: d.error ?? `HTTP ${r.status}` });
  };
  return (
    <div className="rounded-2xl border border-[#d4ff1f]/30 bg-[#0f120c] p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center gap-3">
        <div className="text-[13px] font-bold uppercase tracking-wide text-[#d4ff1f]">ИИ-тренер</div>
        {state.at && <span className="text-[12px] text-white/40">написан {new Date(state.at).toLocaleString("ru-RU")}</span>}
        <button type="button" onClick={write} disabled={state.loading} className="ml-auto rounded-md bg-[#d4ff1f] px-3 py-1.5 text-[13px] font-bold text-[#0b0d09] disabled:opacity-50">
          {state.loading ? "Тренер пишет… (до минуты)" : state.text ? "Переписать" : "Написать разбор"}
        </button>
      </div>
      {state.error && <p className="mt-2 text-[13.5px] text-[#ff8a7a]">Не получилось: {state.error}</p>}
      {state.text ? <div className="mt-3"><Md text={state.text} /></div> : !state.loading && <p className="mt-2 text-[14px] text-white/55">Тренер посмотрит все сравнения ниже и напишет, что главное, где ошибки (с раундами и примером про) и что делать в следующей игре.</p>}
    </div>
  );
}

const BAD_TAGS = ["умер первым", "смерть без размена", "упустил размен", "умер после очереди мимо", "флешка по своим", "флешка в никуда", "форс в одного", "сейв в одного", "недокуп", "повторный выход — умер"];

function fightLine(f: Fight) {
  const notes: string[] = [];
  if (f.firstHit === "враг" && f.result === "умер") notes.push("враг попал первым");
  if (f.moving != null && f.rifleShots >= 3 && f.moving / f.rifleShots > 0.5) notes.push(`стрелял на ходу (${f.moving} из ${f.rifleShots})`);
  if (f.shots >= 6 && f.hits === 0) notes.push("ни одного попадания — зажим вместо коротких очередей");
  if (f.ttd != null) notes.push(`от появления врага до попадания ${f.ttd} мс`);
  return { main: `${t(f.at)} · ${f.enemy}${f.place ? ` · ${P(f.place)}` : ""} — ${f.shots} выстр., попал ${f.hits}${f.head ? ` (в голову ${f.head})` : ""}, урон ${f.dmg}, получил ${f.took}`, notes };
}

function RoundsList({ list, me, analysisId }: { list: RoundStory[]; me: string; analysisId: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [onlyBad, setOnlyBad] = useState(false);
  const shown = onlyBad ? list.filter((r) => r.tags.some((x) => BAD_TAGS.includes(x)) || !r.won) : list;
  return (
    <section className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[18px] font-extrabold">Каждый раунд: что ты делал</h2>
        <button type="button" onClick={() => setOnlyBad((v) => !v)} className="rounded-lg bg-white/10 px-3 py-1.5 text-[13px] font-bold text-white/85 hover:bg-white/15">
          {onlyBad ? "Показать все раунды" : "Только проигранные и с ошибками"}
        </button>
      </div>
      <p className="mt-1 text-[13.5px] text-white/55">Путь по карте, гранаты, каждая перестрелка (сколько стрелял и попал, кто попал первым, стрелял ли на ходу), как умер и был ли рядом свой. Нажми на раунд — откроется повтор.</p>
      <div className="mt-3 space-y-2">
        {shown.map((r) => {
          const bad = r.tags.filter((x) => BAD_TAGS.includes(x));
          const good = r.tags.filter((x) => !BAD_TAGS.includes(x));
          return (
            <div key={r.n} className={`rounded-xl border bg-white/[0.03] ${bad.length ? "border-[#ff6a5a]/35" : "border-white/10"}`}>
              <button type="button" onClick={() => setOpen(open === r.n ? null : r.n)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left">
                <span className="text-[15px] font-black">Раунд {r.n}</span>
                <span className="rounded px-1.5 py-0.5 text-[12px] font-bold" style={{ background: SIDE_COLOR[r.side], color: "#0b0d09" }}>{r.side === "T" ? "атака" : "защита"}</span>
                <span className={`rounded px-1.5 py-0.5 text-[12px] font-bold ${r.won ? "bg-[#9fe870]/20 text-[#9fe870]" : "bg-[#ff6a5a]/20 text-[#ff8a7a]"}`}>{r.won ? "выигран" : "проигран"}</span>
                {r.buy && <span className="text-[12.5px] text-white/50">{r.buy}{r.equip ? ` · $${r.equip}` : ""}</span>}
                {bad.map((x) => <span key={x} className="rounded bg-[#ff6a5a]/15 px-1.5 py-0.5 text-[12px] text-[#ff8a7a]">{x}</span>)}
                {good.map((x) => <span key={x} className="rounded bg-[#d4ff1f]/15 px-1.5 py-0.5 text-[12px] text-[#d4ff1f]">{x}</span>)}
                <span className="ml-auto text-[12.5px] text-white/40">{open === r.n ? "свернуть" : "подробнее"}</span>
              </button>
              {open === r.n && (
                <div className="grid gap-3 border-t border-white/10 p-3 lg:grid-cols-[1fr_minmax(0,420px)]">
                  <div className="space-y-2 text-[14px] leading-relaxed text-white/85">
                    {r.route.length > 0 && (
                      <p><b className="text-white">Путь:</b> {r.route.map((x) => `${P(x.place)} (${t(x.at)})`).join(" → ")}</p>
                    )}
                    {r.at20 && r.at20Pro != null && (
                      <p className={r.at20Pro < 3 ? "text-[#ffb347]" : ""}>
                        <b className="text-white">На 0:20:</b> {P(r.at20)} — {r.at20Pro < 3 ? `топы здесь почти не стоят (${r.at20Pro}%)` : `обычная позиция топов (${r.at20Pro}%)`}
                      </p>
                    )}
                    <p>
                      <b className="text-white">Гранаты:</b>{" "}
                      {r.nades.length ? r.nades.map((n) => `${n.type} ${P(n.from)} → ${P(n.to)}${n.enemies != null ? ` (ослепил ${n.enemies})` : ""}`).join(", ") : "не бросал"}
                    </p>
                    {r.fights.length > 0 && (
                      <div>
                        <b className="text-white">Перестрелки:</b>
                        <ul className="mt-1 space-y-1">
                          {r.fights.map((f, k) => {
                            const l = fightLine(f);
                            return (
                              <li key={k} className={`rounded-lg px-2.5 py-1.5 ${f.result === "убил" ? "bg-[#9fe870]/10" : f.result === "умер" ? "bg-[#ff6a5a]/10" : "bg-white/5"}`}>
                                <span className="font-bold">{f.result === "убил" ? "✓ убил" : f.result === "умер" ? "✗ умер" : "— разошлись"}</span> · {l.main}
                                {l.notes.length > 0 && <div className="text-[13px] text-white/60">{l.notes.join(" · ")}</div>}
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    )}
                    {r.death ? (
                      <p className="text-[#ff8a7a]">
                        <b>Смерть:</b> {t(r.death.at)}{r.death.place ? ` на ${P(r.death.place)}` : ""} от {r.death.by ?? "?"}
                        {r.death.nearestMate != null ? (r.death.nearestMate >= 15 ? ` — ближайший свой в ${r.death.nearestMate} м, разменять было некому` : ` — свой был в ${r.death.nearestMate} м`) : ""}
                        {r.death.traded ? ", тебя разменяли" : ", без размена"}
                        {r.death.util ? ` · не использовал гранат на $${r.death.util}` : ""}
                      </p>
                    ) : (
                      <p className="text-[#9fe870]"><b>Выжил</b>{r.damage ? ` · урон ${r.damage}` : ""}</p>
                    )}
                    {r.bomb && <p><b className="text-white">Бомба:</b> {r.bomb}</p>}
                  </div>
                  <ClipView analysisId={analysisId} clip={{ round: r.n, from: r.start - 2 * TR, to: r.end }} focusName={me} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const HL_ICON: Record<string, string> = { ace: "💥", "4k": "🔥", "3k": "🔥", clutch: "🧊", entry: "⚡" };

function Highlights({ list, me }: { list: Highlight[]; me: string }) {
  const [cur, setCur] = useState(0);
  const h = list[cur];
  return (
    <div className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
      <div className="text-[13px] font-bold uppercase tracking-wide text-[#d4ff1f]">Хайлайты</div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {list.map((x, i) => (
          <button key={i} type="button" onClick={() => setCur(i)} className={`rounded-lg px-3 py-1.5 text-[13.5px] font-bold ${i === cur ? "bg-[#d4ff1f] text-[#0b0d09]" : "bg-white/10 text-white/85 hover:bg-white/15"}`}>
            {HL_ICON[x.kind] ?? "★"} {x.title}
          </button>
        ))}
      </div>
      {h && (
        <div className="mt-3 max-w-[760px]">
          <ClipView key={cur} analysisId={h.analysis} clip={{ round: h.round, from: h.t - 4 * TR, to: (h.end ?? h.t) + 3 * TR }} focusName={me} />
          {h.weapons?.length ? <p className="mt-1.5 text-[12.5px] text-white/45">Оружие: {h.weapons.join(", ")}</p> : null}
        </div>
      )}
    </div>
  );
}

export function CoachReport({ analysisId, steamid }: { analysisId: string; steamid: string }) {
  const { data, error } = useGzJson<Report>(`/api/analysis/coach/${analysisId}/${steamid}`);
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <p className="text-danger">Разбор игрока не загрузился: {error}</p>;
  if (!data) return <p className="text-fg-3">Загружаем разбор…</p>;
  const s = data.stats;
  const findings = [...data.findings].sort((a, b) => ORDER.indexOf(a.topic) - ORDER.indexOf(b.topic));

  return (
    <div className="space-y-5">
      <div className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
        <div className="text-[13px] font-bold uppercase tracking-wide text-[#d4ff1f]">Разбор игрока</div>
        <div className="mt-1 text-[26px] font-black">{data.player.name}</div>
        <div className="text-[14px] text-white/60">{data.map.replace(/^de_/, "")} · {s.rounds} раундов · сравнение с {data.proMaps} картами топов на этой карте</div>
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatCard label="Убийств за раунд" me={s.kpr[0]} pro={s.kpr[1]} better="up" />
          <StatCard label="Смертей за раунд" me={s.dpr[0]} pro={s.dpr[1]} better="down" />
          <StatCard label="Урон за раунд" me={s.adr[0]} pro={s.adr[1]} better="up" />
          <StatCard label="Убил первым, %" me={s.openingKillRate[0]} pro={s.openingKillRate[1]} better="up" />
          <StatCard label="Умер первым, %" me={s.openingDeathRate[0]} pro={s.openingDeathRate[1]} better="down" />
          <StatCard label="Смерти разменяли, %" me={s.traded[0]} pro={s.traded[1]} better="up" />
        </div>
        <div className="mt-3 flex flex-wrap gap-3 text-[13px] text-white/65">
          Гранат за раунд (ты / топы):
          {Object.entries(s.nadesPerRound).map(([k, [a, b]]) => (
            <span key={k}><span className="mr-1 inline-block size-2 rounded-full" style={{ background: NADE_COLOR[k] }} />{NADE_ONE[k] ?? k} {a} / {b}</span>
          ))}
        </div>
        <p className="mt-3 text-[12.5px] text-white/40">Цифры топов — против топов, твои — против твоих соперников. Важнее не «больше/меньше», а то, как ты играешь в каждой ситуации ниже.</p>
      </div>

      {(data.highlights?.length ?? 0) > 0 && <Highlights list={data.highlights!} me={data.player.name} />}

      <CoachText analysisId={analysisId} steamid={steamid} />

      {(data.rounds?.length ?? 0) > 0 && <RoundsList list={data.rounds!} me={data.player.name} analysisId={analysisId} />}

      {findings.map((f) => (
        <section key={f.topic} className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
          <h2 className="text-[18px] font-extrabold">{f.title}</h2>
          <p className="mt-1 text-[13.5px] text-white/55">{ABOUT[f.topic]}</p>
          {f.topic === "aim" && f.skill && (
            <SkillRow
              items={[
                ["Точность в бою", f.skill.accuracy, "up", "%"],
                ["В голову (без AWP)", f.skill.hs, "up", "%"],
                ["Первая пуля", f.skill.firstBullet, "up", "%"],
                ["Спрей (винтовки, от 3 пуль)", f.skill.spray, "up", "%"],
                ["Выстрелов на убийство", f.skill.shotsPerKill, "down"],
                ...(f.skill.ttd ? ([["Время до урона", f.skill.ttd, "down", " мс"]] as const) : []),
                ...(f.skill.crosshair ? ([["Довод прицела", f.skill.crosshair, "down", "°"]] as const) : []),
                ...(f.skill.counterStrafe ? ([["Контрстрейф", f.skill.counterStrafe, "up", "%"]] as const) : []),
              ]}
            />
          )}
          {f.topic === "flashes" && f.skill && (
            <SkillRow items={[["Врагов на флешку", f.skill.enemiesPerFlash, "up"], ["Секунд слепоты врагам", f.skill.blindSecPerFlash, "up", " с"], ["Флешки по своим", f.skill.teamFlashPct, "down", "%"], ["Флешка → убийство", f.skill.flashKillPct, "up", "%"]]} />
          )}
          {f.topic === "utility" && data.skill && (
            <SkillRow
              items={[
                ["Урон с одной HE", data.skill.heDmg, "up"],
                ["Урон с одного молотова", data.skill.mollyDmg, "up"],
                ...(data.skill.utilOnDeath ? ([["Гранат на руках при смерти", data.skill.utilOnDeath, "down", " $"]] as const) : []),
                ...(data.skill.ctSmokeStop ? ([["Смоки защиты, остановившие выход", data.skill.ctSmokeStop, "up", "%"]] as const) : []),
              ]}
            />
          )}
          {f.topic === "trades" && data.skill?.tradeAttempt && (
            <SkillRow
              items={[
                ["Мог разменять — пытался", data.skill.tradeAttempt, "up", "%"],
                ["Мог разменять — разменял", data.skill.tradeSuccess ?? [null, null], "up", "%"],
                ["Тебя пытались разменять", data.skill.tradedAttempt ?? [null, null], "up", "%"],
                ["Тебя разменяли (когда было кому)", data.skill.tradedSuccess ?? [null, null], "up", "%"],
              ]}
            />
          )}
          {f.moments.length === 0 && <p className="mt-3 text-[14px] text-[#9fe870]">Здесь всё чисто 👍</p>}
          <div className="mt-3 space-y-2">
            {f.moments.map((m, i) => {
              const key = `${f.topic}-${i}`;
              const x = momentText(f, m);
              const on = open === key;
              return (
                <div key={key} className={`rounded-xl border bg-white/[0.03] ${on ? "border-[#d4ff1f]" : TONE[x.tone]}`}>
                  <button type="button" onClick={() => setOpen(on ? null : key)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-left">
                    <span className="text-[12.5px] font-bold text-white/50">{x.head}</span>
                    {m.side && <span className="rounded px-1.5 text-[11.5px] font-black text-[#0b0d09]" style={{ background: SIDE_COLOR[m.side] }}>{m.side}</span>}
                    <span className="min-w-0 flex-1 text-[14.5px] font-semibold">{x.body}</span>
                    {x.tag && <span className={`rounded-full px-2 py-0.5 text-[11.5px] font-bold ${x.tone === "good" ? "bg-[#9fe870]/15 text-[#9fe870]" : "bg-[#ffb347]/15 text-[#ffb347]"}`}>{x.tag}</span>}
                    <span className="text-[12.5px] font-semibold text-[#d4ff1f]">{on ? "скрыть" : m.pro || f.topic !== "positions" ? "▶ ты / про" : "▶ смотреть"}</span>
                  </button>
                  {on && <div className="px-3 pb-3"><Compare f={f} m={m} me={data.player.name} /></div>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}
