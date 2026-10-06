"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ACTIVE_POOL, CS2_MAPS, slugify } from "@/lib/maps";
import { FORMATS, type FormatKind } from "@/lib/formats";
import { MODES, type ModeKey } from "@/lib/modes";
import type { PrizeRow, Tournament } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { ConfirmModal } from "@/components/modal";
import { requirementsTemplate, rulesTemplate } from "@/lib/rules-templates";
import { Field, buttonClass, cn } from "@/components/ui";

const DEFAULT_RULES = `Вето проходит на странице матча до подключения к серверу.
На сервер допускаются только заявленные игроки (по SteamID).
Разминка: .ready / .r — матч стартует при 10/10 готовых.
Ножевой раунд: победитель выбирает сторону командой .stay или .switch.
На картах de_* соперники слышат друг друга во время смены сторон; в раундах голос командный.
Тактические паузы — .tac, технические — .tech.
Каждая карта записывается в демо. Споры — через страницу матча.`;

const STEPS = ["Основное", "Формат", "Расписание", "Правила матча", "Карты", "Регистрация", "Публикация"] as const;

// ───────────────────────── мелкие контролы

function Segmented<T extends string | number>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string; hint?: string }[];
}) {
  return (
    <div className="inline-flex flex-wrap gap-0.5 rounded-lg border border-line bg-bg-2 p-0.5">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-8 min-w-10 px-3 rounded-md text-[13px] font-medium transition",
            value === o.value ? "bg-surface-3 text-fg" : "text-fg-3 hover:text-fg-2",
          )}
          title={o.hint}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function OptionCard({
  active,
  onClick,
  title,
  text,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  text: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "text-left rounded-lg border p-3.5 transition",
        active ? "border-accent/60 bg-accent-dim" : "border-line bg-bg-2 hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[14px] font-semibold", active ? "text-accent" : "text-fg")}>{title}</span>
        <span className={cn("size-3.5 rounded-full border-2 shrink-0", active ? "border-accent bg-accent" : "border-line-strong")} />
      </div>
      <p className="mt-1 text-[12px] text-fg-3 leading-relaxed">{text}</p>
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.2em] text-[#7f93b0]">{children}</div>;
}

function Section({ show, title, hint, children }: { show: boolean; title: string; hint?: string; children: ReactNode }) {
  // скрытые шаги остаются в DOM: их поля уходят вместе с формой
  return (
    <section className={cn(!show && "hidden")}>
      <div className="mb-7 pb-5 border-b border-white/[0.06]">
        <h2 className="text-[24px] font-semibold tracking-[-0.015em]">{title}</h2>
        {hint && <p className="mt-1.5 text-[13px] text-fg-3">{hint}</p>}
      </div>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-white/[0.05] last:border-0 text-[13px]">
      <span className="text-fg-3 shrink-0">{label}</span>
      <span className={cn("text-right min-w-0 truncate", warn ? "text-warn" : "text-fg")}>{value}</span>
    </div>
  );
}

const ghostBtn = "h-10 px-4 rounded-lg border border-line text-[13px] text-fg-2 hover:text-fg hover:border-line-strong disabled:opacity-40";

// ───────────────────────── даты

const pad = (n: number) => String(n).padStart(2, "0");
/** ISO → значение datetime-local в Алматы (UTC+5) */
function toLocal(iso: string | null | undefined) {
  if (!iso) return "";
  return new Date(new Date(iso).getTime() + 5 * 3600 * 1000).toISOString().slice(0, 16);
}
/** сдвиг значения datetime-local на минуты */
function shift(local: string, minutes: number) {
  const d = new Date(`${local}:00Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}
const human = (local: string) => (local ? local.replace("T", " ").slice(5).replace("-", ".") : "—");

// ───────────────────────── форма

export function TournamentForm({
  action,
  t,
  workshopMaps = [],
  disabledMaps = [],
  mapImages = {},
}: {
  action: FormAction;
  t?: Tournament;
  /** библиотека карт из Steam Workshop (Админка → Настройки), формат «name@id» */
  workshopMaps?: string[];
  /** официальные карты, скрытые в «Настройки → Карты» */
  disabledMaps?: string[];
  mapImages?: Record<string, string>;
}) {
  const [step, setStep] = useState(0);
  const [name, setName] = useState(t?.name ?? "");
  const [slug, setSlug] = useState(t?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!t);
  const [format, setFormat] = useState(t?.format ?? "5v5");
  const [bracket, setBracket] = useState<FormatKind>((t?.bracket_type as FormatKind) ?? "double_elimination");
  const [groupsCount, setGroupsCount] = useState(t?.groups_count ?? 2);
  const [advance, setAdvance] = useState(t?.advance_per_group ?? 2);
  const [swissWins, setSwissWins] = useState(t?.swiss_wins ?? 3);
  const [playoffType, setPlayoffType] = useState<string>(t?.playoff_type ?? "single_elimination");
  const [wsName, setWsName] = useState("");
  const [wsId, setWsId] = useState("");
  const [maxTeams, setMaxTeams] = useState(t?.max_teams ?? 16);
  const [bo, setBo] = useState(t?.default_best_of ?? 1);
  const [finalBo, setFinalBo] = useState(t?.final_best_of ?? 3);
  const [isLan, setIsLan] = useState(t?.is_lan ?? true);
  const [location, setLocation] = useState(t?.location ?? "F16 Arena");
  const [maps, setMaps] = useState<string[]>(t?.map_pool ?? ACTIVE_POOL.filter((m) => !disabledMaps.includes(m)));
  // в выборе — доступные карты и те, что уже стоят в турнире
  const officialMaps = CS2_MAPS.filter((m) => !disabledMaps.includes(m.id) || (t?.map_pool ?? []).includes(m.id));
  const [start, setStart] = useState(toLocal(t?.starts_at));
  const [regOpen, setRegOpen] = useState(toLocal(t?.registration_opens_at));
  const [regClose, setRegClose] = useState(toLocal(t?.registration_closes_at));
  const [checkinOpen, setCheckinOpen] = useState(toLocal(t?.checkin_opens_at));
  const [checkinClose, setCheckinClose] = useState(toLocal(t?.checkin_closes_at));
  const [prizePool, setPrizePool] = useState(t?.prize_pool ?? "");
  const [prizes, setPrizes] = useState<PrizeRow[]>(
    t?.prize_distribution?.length ? t.prize_distribution : [{ place: "1 место", prize: "" }, { place: "2 место", prize: "" }, { place: "3 место", prize: "" }],
  );
  const [cover, setCover] = useState<string | null>(t?.cover_url ?? null);
  const [overtime, setOvertime] = useState(t?.overtime ?? true);
  const [knife, setKnife] = useState(t?.knife_round ?? true);
  const [timeouts, setTimeouts] = useState(t?.timeouts_per_team ?? 4);
  const [timeoutSec, setTimeoutSec] = useState(t?.timeout_seconds ?? 30);
  const [techPauses, setTechPauses] = useState(t?.tech_pauses ?? 2);
  const [techSec, setTechSec] = useState(t?.tech_pause_seconds ?? 300);
  const [rulesText, setRulesText] = useState(t?.rules ?? DEFAULT_RULES);
  const [reqText, setReqText] = useState(t?.requirements ?? "");
  // вставка шаблона поверх своего текста — только после подтверждения
  const [pendingTemplate, setPendingTemplate] = useState<null | "rules" | "requirements">(null);
  const [freeEntry, setFreeEntry] = useState(!t?.entry_fee || t.entry_fee === "Бесплатно");
  const [entryFee, setEntryFee] = useState(t?.entry_fee && t.entry_fee !== "Бесплатно" ? t.entry_fee : "");
  const [sponsors, setSponsors] = useState<{ name: string; url?: string }[]>(t?.sponsors ?? []);

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const mapWarning =
    maps.length > 1 && maps.length < Math.max(bo, finalBo)
      ? `Для BO${Math.max(bo, finalBo)} нужно минимум ${Math.max(bo, finalBo)} карт (или одна карта — она сыграется несколько раз)`
      : maps.length !== 7 && format !== "1v1"
        ? "Стандартное вето рассчитано на 7 карт"
        : null;

  const [startMoved, setStartMoved] = useState<string | null>(null);
  const autoDates = () => {
    if (!start) return;
    // «сейчас» в часовом поясе Алматы (UTC+5), формат datetime-local
    const nowLocal = new Date(Date.now() + 5 * 3600 * 1000).toISOString().slice(0, 16);
    // старт уже прошёл или вот-вот — переносим на час вперёд, иначе даты не выстроить по порядку
    let st = start;
    if (st <= shift(nowLocal, 10)) {
      st = shift(nowLocal, 60);
      setStart(st);
      setStartMoved(`Старт ${human(start)} уже прошёл или слишком близко — перенесён на ${human(st)}. Поправьте, если нужно другое время.`);
    } else setStartMoved(null);
    // регистрация: с сейчас (или с уже указанного открытия) до старта; если старт далеко — закрывается за сутки
    const open = regOpen && regOpen >= nowLocal && regOpen < st ? regOpen : nowLocal;
    let close = shift(st, -24 * 60);
    if (close <= open) close = shift(st, -15);
    if (close <= open) close = st;
    // check-in: последний час перед стартом, но не раньше открытия регистрации; заканчивается за 15 минут до старта
    let ciOpen = shift(st, -60);
    if (ciOpen < open) ciOpen = open;
    let ciClose = shift(st, -15);
    if (ciClose <= ciOpen) ciClose = st;
    setRegOpen(open);
    setRegClose(close);
    setCheckinOpen(ciOpen);
    setCheckinClose(ciClose);
  };

  // проверка порядка дат прямо в форме — то же правило, что на сервере
  const dateIssues: string[] = [];
  if (regOpen && regClose && regClose <= regOpen) dateIssues.push(`Регистрация закрывается (${human(regClose)}) раньше, чем открывается (${human(regOpen)}).`);
  if (regClose && start && regClose > start) dateIssues.push(`Регистрация закрывается (${human(regClose)}) после старта (${human(start)}) — она должна закончиться до старта.`);
  if (checkinOpen && checkinClose && checkinClose <= checkinOpen) dateIssues.push(`Check-in заканчивается (${human(checkinClose)}) раньше, чем начинается (${human(checkinOpen)}).`);
  if (checkinClose && start && checkinClose > start) dateIssues.push(`Check-in заканчивается (${human(checkinClose)}) после старта (${human(start)}).`);

  const splitPrize = () => {
    const total = Number(prizePool.replace(/[^\d]/g, ""));
    if (!total) return;
    const parts = [0.5, 0.3, 0.2];
    setPrizes(parts.map((p, i) => ({ place: `${i + 1} место`, prize: `${Math.round(total * p).toLocaleString("ru-RU")} ₸` })));
  };

  const prizesText = useMemo(
    () => prizes.filter((p) => p.place.trim() && p.prize.trim()).map((p) => `${p.place} — ${p.prize}`).join("\n"),
    [prizes],
  );

  // что ещё не заполнено — по шагам
  const missing: Record<number, string | null> = {
    0: name.trim() ? null : "Нет названия",
    2: !start ? "Нет даты старта" : dateIssues.length ? "Даты не по порядку" : null,
    4: mapWarning && maps.length > 1 && maps.length < Math.max(bo, finalBo) ? mapWarning : null,
  };
  const canSubmit = !!name.trim();

  return (
    <ActionForm action={action}>
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="bracket_type" value={bracket} />
      <input type="hidden" name="max_teams" value={maxTeams} />
      <input type="hidden" name="groups_count" value={groupsCount} />
      <input type="hidden" name="advance_per_group" value={advance} />
      <input type="hidden" name="swiss_wins" value={swissWins} />
      <input type="hidden" name="playoff_type" value={playoffType} />
      <input type="hidden" name="default_best_of" value={bo} />
      <input type="hidden" name="final_best_of" value={finalBo} />
      <input type="hidden" name="match_format" value={`BO${bo}, финальная стадия — BO${finalBo}`} />
      {isLan && <input type="hidden" name="is_lan" value="on" />}
      <input type="hidden" name="map_pool" value={maps.join(",")} />
      <input type="hidden" name="prizes" value={prizesText} />
      <input type="hidden" name="starts_at" value={start} />
      <input type="hidden" name="registration_opens_at" value={regOpen} />
      <input type="hidden" name="registration_closes_at" value={regClose} />
      <input type="hidden" name="checkin_opens_at" value={checkinOpen} />
      <input type="hidden" name="checkin_closes_at" value={checkinClose} />
      {overtime && <input type="hidden" name="overtime" value="on" />}
      {knife && <input type="hidden" name="knife_round" value="on" />}
      <input type="hidden" name="timeouts_per_team" value={timeouts} />
      <input type="hidden" name="timeout_seconds" value={timeoutSec} />
      <input type="hidden" name="tech_pauses" value={techPauses} />
      <input type="hidden" name="tech_pause_seconds" value={techSec} />
      <input type="hidden" name="entry_fee" value={freeEntry ? "Бесплатно" : entryFee} />
      <input type="hidden" name="sponsors" value={JSON.stringify(sponsors.filter((x) => x.name.trim()))} />

      <div className="grid grid-cols-1 xl:grid-cols-[180px_minmax(0,1fr)_300px] gap-8 items-start">
        {/* шаги */}
        <nav className="flex xl:flex-col gap-0.5 overflow-x-auto xl:sticky xl:top-8">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "relative flex items-center gap-3 h-10 px-3 rounded-[8px] text-[13px] whitespace-nowrap text-left transition",
                step === i ? "bg-surface border border-line text-fg" : "border border-transparent text-fg-3 hover:text-fg-2",
              )}
            >
              <span className={cn("num text-[11px] w-5", step === i ? "text-accent" : "text-fg-3")}>{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{s}</span>
              {missing[i] && <span className="size-1.5 rounded-full bg-warn" title={missing[i] ?? ""} />}
            </button>
          ))}
        </nav>

        {/* активный шаг */}
        <div className="min-w-0 rounded-[12px] border border-line bg-surface p-6 sm:p-8">
          <Section show={step === 0} title="Основное" hint="Название, обложка и описание для страницы турнира">
            <div>
              <Label>Название</Label>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="F16 Cup #1"
                className="field h-12 text-lg font-semibold"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-fg-3">
                <span>Адрес:</span>
                {slugEdited ? (
                  <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} aria-label="Адрес страницы турнира" className="field h-8 w-64 num text-[13px]" />
                ) : (
                  <span className="num text-fg-2">/tournaments/{effectiveSlug || "…"}</span>
                )}
                {!slugEdited && (
                  <button
                    type="button"
                    onClick={() => {
                      setSlug(effectiveSlug);
                      setSlugEdited(true);
                    }}
                    className="text-accent hover:underline"
                  >
                    изменить
                  </button>
                )}
              </div>
            </div>
            <label className="block cursor-pointer">
              <Label>Обложка</Label>
              <div className="relative grid place-items-center overflow-hidden rounded-lg border border-dashed border-line-strong bg-bg-2 aspect-[3/1] transition hover:border-accent">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="text-center text-[13px] text-fg-3">
                    <div className="text-fg-2 font-medium">Загрузить обложку</div>
                    <div className="mt-1 text-xs">PNG, JPG или WEBP до 3 МБ · широкая и тёмная</div>
                  </div>
                )}
              </div>
              <input
                name="cover"
                type="file"
                aria-label="Обложка турнира"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) setCover(URL.createObjectURL(f));
                }}
              />
            </label>
            {t?.cover_url && (
              <label className="flex items-center gap-2 text-[13px] text-fg-2">
                <input type="checkbox" name="removeCover" className="size-4 accent-[#8ab8ff]" onChange={(e) => setCover(e.target.checked ? null : t.cover_url)} />
                Убрать обложку
              </label>
            )}
            <Field label="Описание турнира">
              <textarea name="description" rows={3} defaultValue={t?.description ?? ""} placeholder="Пара предложений для страницы турнира" className="field resize-y" />
            </Field>
          </Section>

          <Section show={step === 1} title="Формат" hint="Режим игры, система турнира и формат серий">
            <div>
              <Label>Режим игры</Label>
              <div className="grid sm:grid-cols-3 gap-2">
                {(Object.keys(MODES) as ModeKey[]).map((k) => (
                  <OptionCard
                    key={k}
                    active={format === k}
                    onClick={() => {
                      setFormat(k);
                      const aim = workshopMaps.filter((m) => /^aim/i.test(m));
                      setMaps(k === "1v1" && aim.length ? [aim[0]] : [...MODES[k].maps]);
                      if (k === "1v1") {
                        setKnife(!aim.length); // на aim-картах нож не нужен, на обычных — как обычно
                        setTimeouts(0);
                        setBracket("round_robin");
                        setMaxTeams(4);
                      }
                    }}
                    title={MODES[k].title}
                    text={MODES[k].text}
                  />
                ))}
              </div>
            </div>
            <div>
              <Label>Система турнира</Label>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(Object.keys(FORMATS) as FormatKind[]).map((k) => (
                  <OptionCard key={k} active={bracket === k} onClick={() => setBracket(k)} title={FORMATS[k].title} text={FORMATS[k].text} />
                ))}
              </div>
            </div>
            {(bracket === "groups_playoff" || bracket === "swiss" || bracket === "swiss_playoff" || bracket === "round_robin") && (
              <div className="grid sm:grid-cols-3 gap-5 rounded-[8px] bg-[#09111b] border border-white/[0.06] p-4">
                {bracket === "groups_playoff" && (
                  <>
                    <div>
                      <Label>Групп</Label>
                      <Segmented value={groupsCount} onChange={setGroupsCount} options={[2, 4, 8].map((n) => ({ value: n, label: String(n) }))} />
                    </div>
                    <div>
                      <Label>Выходят из группы</Label>
                      <Segmented value={advance} onChange={setAdvance} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} />
                    </div>
                  </>
                )}
                {(bracket === "swiss" || bracket === "swiss_playoff") && (
                  <div>
                    <Label>Побед для выхода / поражений для вылета</Label>
                    <Segmented value={swissWins} onChange={setSwissWins} options={[2, 3].map((n) => ({ value: n, label: `${n}–${n}` }))} />
                  </div>
                )}
                {(bracket === "groups_playoff" || bracket === "swiss_playoff") && (
                  <div>
                    <Label>Плей-офф</Label>
                    <Segmented
                      value={playoffType}
                      onChange={setPlayoffType}
                      options={[{ value: "single_elimination", label: "Single" }, { value: "double_elimination", label: "Double" }]}
                    />
                  </div>
                )}
                {bracket === "round_robin" && (
                  <p className="sm:col-span-3 text-[13px] text-fg-3">
                    {maxTeams} участников → {(maxTeams * (maxTeams - 1)) / 2} матчей, {maxTeams % 2 ? maxTeams : maxTeams - 1} туров. Места — по
                    победам, затем личная встреча, разница карт и раундов.
                  </p>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-5">
              <div>
                <Label>{format === "1v1" ? "Участников" : "Команд"}</Label>
                <Segmented
                  value={maxTeams}
                  onChange={setMaxTeams}
                  options={(bracket === "round_robin" ? [3, 4, 5, 6, 8] : [4, 8, 16, 32]).map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
              <div>
                <Label>Обычные матчи</Label>
                <Segmented value={bo} onChange={setBo} options={[1, 3].map((n) => ({ value: n, label: `BO${n}` }))} />
              </div>
              <div>
                <Label>Финальная стадия</Label>
                <Segmented value={finalBo} onChange={setFinalBo} options={[1, 3, 5].map((n) => ({ value: n, label: `BO${n}` }))} />
                {bracket === "double_elimination" && (
                  <p className="mt-2 text-[12px] text-fg-3">Гранд-финал Double Elimination всегда BO5: команда из верхней сетки начинает со счётом 1:0.</p>
                )}
                <p className="mt-1.5 text-xs text-fg-3">
                  {bracket === "double_elimination" || playoffType === "double_elimination"
                    ? "Финал верхней, два последних раунда нижней и гранд-финал"
                    : bracket === "round_robin" || bracket === "swiss"
                      ? "В этом формате нет финальной стадии"
                      : "Полуфиналы и финал плей-офф"}
                </p>
              </div>
            </div>
          </Section>

          <Section show={step === 2} title="Расписание" hint="Место проведения и даты. Время Алматы">
            <div>
              <Label>Место</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented value={isLan ? "lan" : "online"} onChange={(v) => setIsLan(v === "lan")} options={[{ value: "lan", label: "LAN" }, { value: "online", label: "Онлайн" }]} />
                <input
                  name="location"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  placeholder={isLan ? "Клуб, город" : "Регион"}
                  className="field flex-1 min-w-[220px]"
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
              <Field label="Старт турнира">
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="field" />
              </Field>
              <button type="button" onClick={autoDates} disabled={!start} className={ghostBtn}>
                Заполнить остальное по старту
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Регистрация открывается">
                <input type="datetime-local" value={regOpen} onChange={(e) => setRegOpen(e.target.value)} className="field" />
              </Field>
              <Field label="Регистрация закрывается" hint="по умолчанию — за сутки до старта">
                <input type="datetime-local" value={regClose} onChange={(e) => setRegClose(e.target.value)} className="field" />
              </Field>
              <Field label="Check-in с" hint="за час до старта">
                <input type="datetime-local" value={checkinOpen} onChange={(e) => setCheckinOpen(e.target.value)} className="field" />
              </Field>
              <Field label="Check-in до" hint="за 15 минут до старта">
                <input type="datetime-local" value={checkinClose} onChange={(e) => setCheckinClose(e.target.value)} className="field" />
              </Field>
            </div>
            {startMoved && <p className="text-[13px] text-warn">{startMoved}</p>}
            {dateIssues.length > 0 && (
              <div className="rounded-lg border border-danger/30 bg-danger/[0.06] px-4 py-3 text-[13px] text-danger">
                <div className="font-semibold">Даты не по порядку — турнир не сохранится:</div>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {dateIssues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <div className="mt-1.5 text-fg-2">Проще всего: поставьте старт и нажмите «Заполнить остальное по старту».</div>
              </div>
            )}
          </Section>

          <Section
            show={step === 3}
            title="Правила матча"
            hint={
              format === "1v1"
                ? "Дуэль: без тактических пауз. Уходит в MatchZy при загрузке матча"
                : "Уходят в MatchZy на сервер при загрузке каждого матча"
            }
          >
            <div className="grid sm:grid-cols-2 gap-6">
              {(
                <div>
                  <Label>Стороны на карте</Label>
                  <Segmented
                    value={knife ? "knife" : "fixed"}
                    onChange={(v) => setKnife(v === "knife")}
                    options={[{ value: "knife", label: "Ножевой раунд" }, { value: "fixed", label: "Фиксированные" }]}
                  />
                  <p className="mt-1.5 text-xs text-fg-3">
                    {knife ? "Победитель ножа выбирает .stay / .switch" : "Команда 1 начинает за CT, на следующей карте — наоборот"}
                  </p>
                </div>
              )}
              <div>
                <Label>Овертайм</Label>
                <Segmented
                  value={overtime ? "on" : "off"}
                  onChange={(v) => setOvertime(v === "on")}
                  options={[{ value: "on", label: "MR3 при 12:12" }, { value: "off", label: "Без овертайма" }]}
                />
              </div>
              {format !== "1v1" && (
                <div>
                  <Label>Тактические паузы на команду</Label>
                  <Segmented value={timeouts} onChange={setTimeouts} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
                  <div className="mt-2">
                    <Segmented value={timeoutSec} onChange={setTimeoutSec} options={[30, 45, 60].map((n) => ({ value: n, label: `${n} с` }))} />
                  </div>
                </div>
              )}
              <div>
                <Label>{format === "1v1" ? "Технические паузы на игрока" : "Технические паузы на команду"}</Label>
                <Segmented value={techPauses} onChange={setTechPauses} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
                <div className="mt-2">
                  <Segmented value={techSec} onChange={setTechSec} options={[180, 300, 600].map((n) => ({ value: n, label: `${n / 60} мин` }))} />
                </div>
              </div>
            </div>
            <p className="mt-4 text-xs text-fg-3">
              На турнирных картах de_* обе команды слышат друг друга только при смене сторон.
              {format === "5v5" && " Для карт 5×5: MR12, при включённом овертайме MR3, фризтайм 20 с и соревновательная экономика."}
            </p>
            {(() => {
              const size = (format === "1v1" ? 1 : format === "2v2" ? 2 : 5) as 1 | 2 | 5;
              const opts = {
                size,
                halftimeVoice: maps.some((map) => /^de_/i.test(map.split("@")[0])),
                bracket,
                bo,
                finalBo,
                knife,
                overtime,
                timeouts,
                timeoutSec,
                techPauses,
                techSec,
                isLan,
                singleMap: maps.length === 1,
                prizePool,
              };
              const apply = (which: "rules" | "requirements") => {
                if (which === "rules") setRulesText(rulesTemplate(opts));
                else setReqText(requirementsTemplate(opts));
              };
              const ask = (which: "rules" | "requirements") => {
                const current = which === "rules" ? rulesText : reqText;
                // пусто или стандартный текст — заменяем сразу, своё — спрашиваем
                if (!current.trim() || current === DEFAULT_RULES) apply(which);
                else setPendingTemplate(which);
              };
              const modeLabel = size === 1 ? "1×1" : size === 2 ? "2×2" : "5×5";
              return (
                <>
                  <Field label="Требования к участникам" hint="Если пусто — показываются стандартные">
                    <textarea name="requirements" rows={4} value={reqText} onChange={(e) => setReqText(e.target.value)} className="field resize-y" />
                  </Field>
                  <button type="button" onClick={() => ask("requirements")} className={buttonClass("outline", "sm", "-mt-2")}>
                    Вставить шаблон требований · {modeLabel}
                  </button>
                  <Field label="Регламент" hint="Шаблон подставит формат, BO, паузы, нож и овертайм из настроек выше — потом можно править">
                    <textarea name="rules" rows={14} value={rulesText} onChange={(e) => setRulesText(e.target.value)} className="field resize-y" />
                  </Field>
                  <button type="button" onClick={() => ask("rules")} className={buttonClass("outline", "sm", "-mt-2")}>
                    Вставить шаблон регламента · {modeLabel}
                  </button>
                  <ConfirmModal
                    open={pendingTemplate !== null}
                    message={
                      pendingTemplate === "rules"
                        ? "Заменить текущий регламент шаблоном? Ваш текст будет потерян."
                        : "Заменить текущие требования шаблоном? Ваш текст будет потерян."
                    }
                    confirmLabel="Заменить"
                    onCancel={() => setPendingTemplate(null)}
                    onConfirm={() => {
                      if (pendingTemplate) apply(pendingTemplate);
                      setPendingTemplate(null);
                    }}
                  />
                </>
              );
            })()}
          </Section>

          <Section show={step === 4} title="Карты" hint="Нажмите на карту, чтобы включить или убрать её">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
              {officialMaps.map((m) => {
                const on = maps.includes(m.id);
                const img = mapImages[m.id];
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMaps((list) => (on ? list.filter((x) => x !== m.id) : [...list, m.id]))}
                    className={cn(
                      "relative h-16 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition",
                      on ? "border-accent/50 bg-accent-dim" : "border-line bg-bg-2 opacity-50 hover:opacity-80",
                    )}
                  >
                    {img && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="absolute inset-0 size-full object-cover saturate-[0.55] brightness-[0.55]" />
                        <span className="absolute inset-0 bg-gradient-to-t from-[#070b12cc] to-transparent" />
                      </>
                    )}
                    <span className="relative text-[14px] font-semibold">{m.name}</span>
                    <span className={cn("absolute top-2.5 right-2.5 size-4 rounded grid place-items-center text-[10px]", on ? "bg-accent text-[#06101f]" : "border border-line-strong")}>
                      {on ? "✓" : ""}
                    </span>
                    {(MODES[format as ModeKey]?.maps as readonly string[] | undefined)?.includes(m.id) && (
                      <span className="absolute bottom-2 left-3 text-[10px] text-fg-3">пул режима</span>
                    )}
                  </button>
                );
              })}
            </div>
            {workshopMaps.length > 0 && (
              <div>
                <Label>Карты из Workshop</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {workshopMaps.map((w) => {
                    const on = maps.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setMaps((list) => (on ? list.filter((x) => x !== w) : [...list, w]))}
                        className={cn(
                          "relative h-16 overflow-hidden rounded-lg border px-3 py-2.5 text-left transition",
                          on ? "border-accent/50 bg-accent-dim" : "border-line bg-bg-2 opacity-50 hover:opacity-80",
                        )}
                      >
                        <span className="text-[14px] font-semibold">{w.split("@")[0]}</span>
                        <span className="absolute bottom-2 left-3 text-[10px] text-fg-3">workshop</span>
                        <span className={cn("absolute top-2.5 right-2.5 size-4 rounded grid place-items-center text-[10px]", on ? "bg-accent text-[#06101f]" : "border border-line-strong")}>
                          {on ? "✓" : ""}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {maps.filter((m) => m.includes("@") && !workshopMaps.includes(m)).length > 0 && (
              <div className="flex flex-wrap gap-2">
                {maps
                  .filter((m) => m.includes("@") && !workshopMaps.includes(m))
                  .map((m) => (
                    <span key={m} className="h-8 pl-3 pr-1 inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent-dim text-[13px]">
                      {m.split("@")[0]}
                      <span className="text-[10px] text-fg-3">Workshop</span>
                      <button
                        type="button"
                        onClick={() => setMaps((l) => l.filter((x) => x !== m))}
                        className="size-6 grid place-items-center rounded text-fg-3 hover:text-danger"
                        aria-label="Убрать"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="rounded-[8px] bg-[#09111b] border border-white/[0.06] p-4">
              <div className="text-[13px] font-medium text-fg-2">Своя карта из Steam Workshop</div>
              <p className="mt-1 text-xs text-fg-3">
                Только для этого турнира. Чтобы карта была всегда под рукой и прошла проверку на сервере — добавьте её в Настройки → Workshop-карты.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="aim_map" className="field w-40" />
                <input
                  value={wsId}
                  onChange={(e) => setWsId(e.target.value)}
                  placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…"
                  className="field flex-1 min-w-[220px]"
                />
                <button
                  type="button"
                  onClick={() => {
                    const id = (wsId.match(/id=(\d+)/)?.[1] ?? wsId.match(/^\d+$/)?.[0]) || "";
                    const n = wsName.trim().replace(/[@,\s]+/g, "_");
                    if (!id || !n) return;
                    setMaps((l) => [...l.filter((x) => !x.endsWith(`@${id}`)), `${n}@${id}`]);
                    setWsName("");
                    setWsId("");
                  }}
                  className={ghostBtn}
                >
                  Добавить
                </button>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-xs">
              <span className={mapWarning ? "text-warn" : "text-fg-3"}>
                Выбрано {maps.length}
                {mapWarning ? ` · ${mapWarning}` : ""}
              </span>
              <button type="button" onClick={() => setMaps([...(MODES[format as ModeKey]?.maps ?? ACTIVE_POOL)])} className="text-accent hover:underline">
                Стандартный пул режима
              </button>
            </div>
          </Section>

          <Section show={step === 5} title="Регистрация" hint="Взнос, призы и контакты для участников">
            <div>
              <Label>Взнос за участие</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  value={freeEntry ? "free" : "paid"}
                  onChange={(v) => setFreeEntry(v === "free")}
                  options={[{ value: "free", label: "Бесплатно" }, { value: "paid", label: "Платно" }]}
                />
                {!freeEntry && <input value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="10 000 ₸ с команды" className="field w-64" />}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Призовой фонд" className="flex-1 min-w-[200px]">
                <input name="prize_pool" value={prizePool} onChange={(e) => setPrizePool(e.target.value)} placeholder="500 000 ₸" className="field font-semibold" />
              </Field>
              <button type="button" onClick={splitPrize} className={ghostBtn}>
                Разделить 50 / 30 / 20
              </button>
            </div>
            <div className="space-y-2">
              {prizes.map((p, i) => (
                <div key={i} className="flex gap-2">
                  <input
                    value={p.place}
                    onChange={(e) => setPrizes((list) => list.map((x, j) => (j === i ? { ...x, place: e.target.value } : x)))}
                    aria-label={`Место ${i + 1}`}
                    className="field w-36"
                  />
                  <input
                    value={p.prize}
                    onChange={(e) => setPrizes((list) => list.map((x, j) => (j === i ? { ...x, prize: e.target.value } : x)))}
                    placeholder="Сумма или приз"
                    aria-label={`Приз за ${p.place || `место ${i + 1}`}`}
                    className="field flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))}
                    className="size-10 shrink-0 rounded-lg border border-line text-fg-3 hover:text-danger"
                    aria-label="Убрать место"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPrizes((list) => [...list, { place: `${list.length + 1} место`, prize: "" }])} className="text-[13px] text-accent hover:underline">
                + Добавить место
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Трансляция" hint="Twitch или YouTube — встроится в страницу турнира">
                <input name="stream_url" defaultValue={t?.stream_url ?? ""} placeholder="https://twitch.tv/f16arena" className="field" />
              </Field>
              <Field label="Discord" hint="Сервер для участников">
                <input name="discord_url" defaultValue={t?.discord_url ?? ""} placeholder="https://discord.gg/…" className="field" />
              </Field>
              <Field label="Связь с организатором" hint="Telegram, WhatsApp или телефон">
                <input name="contact" defaultValue={t?.contact ?? ""} placeholder="@f16arena или +7 …" className="field" />
              </Field>
            </div>
            <div>
              <Label>Спонсоры и партнёры</Label>
              <div className="space-y-2">
                {sponsors.map((sp, i) => (
                  <div key={i} className="flex gap-2">
                    <input
                      value={sp.name}
                      onChange={(e) => setSponsors((l) => l.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
                      placeholder="Название"
                      className="field w-48"
                    />
                    <input
                      value={sp.url ?? ""}
                      onChange={(e) => setSponsors((l) => l.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))}
                      placeholder="Сайт (необязательно)"
                      className="field flex-1"
                    />
                    <button
                      type="button"
                      onClick={() => setSponsors((l) => l.filter((_, j) => j !== i))}
                      className="size-10 shrink-0 rounded-lg border border-line text-fg-3 hover:text-danger"
                      aria-label="Убрать"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setSponsors((l) => [...l, { name: "", url: "" }])} className="text-[13px] text-accent hover:underline">
                  + Добавить спонсора
                </button>
              </div>
            </div>
          </Section>

          <Section show={step === 6} title="Публикация" hint="Проверьте турнир перед сохранением">
            <div className="text-[14px] text-fg-2 leading-relaxed max-w-xl">
              {t
                ? "Изменения сразу появятся на странице турнира."
                : "Турнир сохранится как черновик и не будет виден игрокам. Регистрацию открывают на странице турнира — переключением этапа."}
            </div>
            {Object.entries(missing).filter(([, v]) => v).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(missing)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setStep(Number(k))} className="block text-[13px] text-warn hover:underline">
                      {STEPS[Number(k)]}: {v} →
                    </button>
                  ))}
              </div>
            )}
          </Section>

          <div className="mt-10 pt-5 border-t border-white/[0.06] flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={ghostBtn}>
              ← Назад
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} className={buttonClass("secondary")}>
                {STEPS[step + 1]} →
              </button>
            ) : null}
          </div>
        </div>

        {/* сводка */}
        <aside className="xl:sticky xl:top-8 rounded-[12px] border border-line bg-surface p-5">
          <div className="text-[11px] font-medium uppercase tracking-[0.26em] text-[#7f93b0]">Сводка</div>
          <div className="mt-2 text-[18px] font-semibold tracking-[-0.015em] truncate">{name || "Новый турнир"}</div>
          <div className="mt-4">
            <SummaryRow label="Режим" value={MODES[format as ModeKey]?.title ?? format} />
            <SummaryRow label="Система" value={FORMATS[bracket].title} />
            <SummaryRow label={format === "1v1" ? "Участников" : "Команд"} value={maxTeams} />
            <SummaryRow label="Серии" value={`BO${bo} · финал BO${finalBo}`} />
            <SummaryRow label="Карты" value={maps.length} warn={!!mapWarning} />
            <SummaryRow label="Стороны" value={knife ? "нож" : "фиксированные"} />
            <SummaryRow label="Место" value={isLan ? `LAN · ${location || "—"}` : "Онлайн"} />
            <SummaryRow label="Старт" value={human(start)} warn={!start} />
            <SummaryRow label="Призовой" value={prizePool || "—"} />
            <SummaryRow label="Взнос" value={freeEntry ? "бесплатно" : entryFee || "—"} />
          </div>
          <div className="mt-5">
            {canSubmit ? (
              <SubmitButton className="w-full" pendingText="Сохраняем…">
                {t ? "Сохранить" : "Создать турнир"}
              </SubmitButton>
            ) : (
              <button type="button" onClick={() => setStep(0)} className={buttonClass("primary", "md", "w-full opacity-50")}>
                Укажите название
              </button>
            )}
          </div>
        </aside>
      </div>
    </ActionForm>
  );
}
