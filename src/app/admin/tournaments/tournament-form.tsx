"use client";

import { useMemo, useState, type ReactNode } from "react";
import { ACTIVE_POOL, CS2_MAPS, slugify } from "@/lib/maps";
import { FORMATS, type FormatKind } from "@/lib/formats";
import { MODES, type ModeKey } from "@/lib/modes";
import type { PrizeRow, Tournament } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { ConfirmModal } from "@/components/modal";
import { requirementsTemplate, rulesTemplate } from "@/lib/rules-templates";
import { buttonClass, cn } from "@/components/ui";
import { ADMIN_CARD } from "@/components/admin/control";

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
    <div className="inline-flex flex-wrap gap-1 rounded-control border border-line bg-surface-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-10 min-w-11 px-4 rounded-[10px] text-[15px] font-semibold transition",
            value === o.value ? "bg-accent text-accent-ink shadow-sm" : "text-fg-2 hover:bg-ink/[0.06] hover:text-fg",
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
        "text-left rounded-control border-2 p-4 transition",
        active ? "border-accent bg-accent-dim" : "border-line bg-surface hover:border-line-hover hover:bg-surface-2",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={cn("text-[16px] font-bold", active ? "text-accent" : "text-fg")}>{title}</span>
        <span className={cn("size-4 rounded-full border-2 shrink-0", active ? "border-accent bg-accent" : "border-line-strong")} />
      </div>
      <p className="mt-1.5 text-[14px] text-fg-2 leading-relaxed">{text}</p>
    </button>
  );
}

function Label({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[15px] font-semibold text-fg">{children}</div>;
}

/** Подсказка под полем: простыми словами, 14 px */
function Hint({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("mt-2 text-[14px] leading-relaxed text-fg-3", className)}>{children}</p>;
}

/** Поле с подписью сверху (15 px, жирно) и подсказкой под ним */
function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-2 block text-[15px] font-semibold text-fg">{label}</span>
      {children}
      {hint && <span className="mt-2 block text-[14px] leading-relaxed text-fg-3">{hint}</span>}
    </label>
  );
}

function Section({ show, title, hint, children }: { show: boolean; title: string; hint?: string; children: ReactNode }) {
  // скрытые шаги остаются в DOM: их поля уходят вместе с формой
  return (
    <section className={cn(!show && "hidden")}>
      <div className="mb-7 pb-5 border-b border-ink/[0.06]">
        <h2 className="text-[26px] font-bold tracking-[-0.02em]">{title}</h2>
        {hint && <p className="mt-2 text-[15.5px] text-fg-2">{hint}</p>}
      </div>
      <div className="space-y-8">{children}</div>
    </section>
  );
}

function SummaryRow({ label, value, warn }: { label: string; value: ReactNode; warn?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-2.5 border-b border-ink/[0.06] last:border-0 text-[15px]">
      <span className="text-fg-3 shrink-0">{label}</span>
      <span className={cn("text-right min-w-0 truncate", warn ? "text-warn" : "text-fg")}>{value}</span>
    </div>
  );
}

const ghostBtn = "h-12 px-5 rounded-control border border-line-strong bg-surface text-[15px] font-semibold text-fg hover:bg-surface-2 disabled:opacity-40 disabled:pointer-events-none";

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
  const [thirdPlace, setThirdPlace] = useState(t?.third_place_match ?? false);
  // официальный турнир (городской, с акиматом): анкеты, возраст, город, тренер, без запасных
  const [official, setOfficial] = useState(t?.is_official ?? false);
  const [minAge, setMinAge] = useState(t?.min_age ?? 16);
  const [maxAge, setMaxAge] = useState(t?.max_age ?? 35);
  const [city, setCity] = useState(t?.city ?? "Усть-Каменогорск");
  const [requireCoach, setRequireCoach] = useState(t?.require_coach ?? true);
  const [allowSubs, setAllowSubs] = useState(t?.allow_substitutes ?? false);
  // матч за 3-е место — там, где плей-офф на выбывание с одной сеткой
  const singleElim = bracket === "single_elimination" || ((bracket === "groups_playoff" || bracket === "swiss_playoff") && playoffType === "single_elimination");

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
  const officialIssue = official && format === "1v1" ? "Официальный турнир — только командный режим" : official && maxAge < minAge ? "Возраст: максимум меньше минимума" : null;
  const missing: Record<number, string | null> = {
    0: name.trim() ? null : "Нет названия",
    5: officialIssue,
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
      {thirdPlace && <input type="hidden" name="third_place_match" value="on" />}
      {official && <input type="hidden" name="is_official" value="on" />}
      <input type="hidden" name="min_age" value={minAge} />
      <input type="hidden" name="max_age" value={maxAge} />
      <input type="hidden" name="city" value={city} />
      {requireCoach && <input type="hidden" name="require_coach" value="on" />}
      {allowSubs && <input type="hidden" name="allow_substitutes" value="on" />}

      <div className="grid grid-cols-1 xl:grid-cols-[210px_minmax(0,1fr)_320px] gap-8 items-start">
        {/* шаги */}
        <nav aria-label="Шаги формы" className="flex xl:flex-col gap-1 overflow-x-auto xl:sticky xl:top-8">
          {STEPS.map((s, i) => (
            <button
              key={s}
              type="button"
              onClick={() => setStep(i)}
              className={cn(
                "relative flex items-center gap-3 h-12 px-3.5 rounded-control text-[15.5px] font-semibold whitespace-nowrap text-left transition",
                step === i ? "bg-surface border border-line-strong text-fg shadow-sm" : "border border-transparent text-fg-3 hover:bg-ink/[0.04] hover:text-fg-2",
              )}
            >
              <span className={cn("num text-[13.5px] w-6", step === i ? "text-accent" : "text-fg-3")}>{String(i + 1).padStart(2, "0")}</span>
              <span className="flex-1">{s}</span>
              {missing[i] && <span className="size-1.5 rounded-full bg-warn" title={missing[i] ?? ""} />}
            </button>
          ))}
        </nav>

        {/* активный шаг */}
        <div className={cn(ADMIN_CARD, "min-w-0 p-6 sm:p-8")}>
          <Section show={step === 0} title="Основное" hint="Как называется турнир и как он выглядит на сайте. Начните с названия.">
            <div>
              <Label>Название турнира</Label>
              <input
                name="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="F16 Cup #1"
                className="field h-14 text-[20px] font-semibold"
              />
              <Hint>Так турнир увидят игроки. Например: «F16 Cup #1».</Hint>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[14.5px] text-fg-3">
                <span>Адрес страницы на сайте:</span>
                {slugEdited ? (
                  <input value={slug} onChange={(e) => setSlug(slugify(e.target.value))} aria-label="Адрес страницы турнира" className="field w-64 num" />
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
                    className="font-semibold text-accent hover:underline"
                  >
                    изменить
                  </button>
                )}
              </div>
            </div>
            <label className="block cursor-pointer">
              <Label>Обложка (картинка вверху страницы турнира)</Label>
              <div className="relative grid place-items-center overflow-hidden rounded-surface border-2 border-dashed border-line-strong bg-surface-2 aspect-[3/1] transition hover:border-accent">
                {cover ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
                ) : (
                  <div className="text-center text-[14.5px] text-fg-3">
                    <div className="text-[17px] font-bold text-fg">Нажмите, чтобы загрузить обложку</div>
                    <div className="mt-1.5 text-[14px]">Широкая картинка: PNG, JPG или WEBP до 3 МБ</div>
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
              <label className="flex items-center gap-2.5 text-[15px] text-fg-2">
                <input type="checkbox" name="removeCover" className="size-5 accent-[var(--color-accent)]" onChange={(e) => setCover(e.target.checked ? null : t.cover_url)} />
                Убрать обложку
              </label>
            )}
            <Field label="Описание турнира" hint="Пара предложений: о чём турнир и кому он подойдёт. Можно оставить пустым.">
              <textarea name="description" rows={3} defaultValue={t?.description ?? ""} placeholder="Пара предложений для страницы турнира" className="field resize-y" />
            </Field>
          </Section>

          <Section show={step === 1} title="Формат" hint="Сколько игроков в команде, как команды играют между собой и сколько карт в матче.">
            <div>
              <Label>Сколько игроков в команде</Label>
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
              <Label>Как проходит турнир</Label>
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {(Object.keys(FORMATS) as FormatKind[]).map((k) => (
                  <OptionCard key={k} active={bracket === k} onClick={() => setBracket(k)} title={FORMATS[k].title} text={FORMATS[k].text} />
                ))}
              </div>
            </div>
            {(bracket === "groups_playoff" || bracket === "swiss" || bracket === "swiss_playoff" || bracket === "round_robin") && (
              <div className="grid sm:grid-cols-3 gap-6 rounded-control bg-surface-2 border border-line-subtle p-5">
                {bracket === "groups_playoff" && (
                  <>
                    <div>
                      <Label>Сколько групп</Label>
                      <Segmented value={groupsCount} onChange={setGroupsCount} options={[2, 4, 8].map((n) => ({ value: n, label: String(n) }))} />
                    </div>
                    <div>
                      <Label>Сколько команд выходит из группы</Label>
                      <Segmented value={advance} onChange={setAdvance} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} />
                    </div>
                  </>
                )}
                {(bracket === "swiss" || bracket === "swiss_playoff") && (
                  <div>
                    <Label>Сколько побед до выхода и поражений до вылета</Label>
                    <Segmented value={swissWins} onChange={setSwissWins} options={[2, 3].map((n) => ({ value: n, label: `${n}–${n}` }))} />
                  </div>
                )}
                {(bracket === "groups_playoff" || bracket === "swiss_playoff") && (
                  <div>
                    <Label>Сетка плей-офф (после групп)</Label>
                    <Segmented
                      value={playoffType}
                      onChange={setPlayoffType}
                      options={[{ value: "single_elimination", label: "Single" }, { value: "double_elimination", label: "Double" }]}
                    />
                  </div>
                )}
                {bracket === "round_robin" && (
                  <p className="sm:col-span-3 text-[14.5px] text-fg-3">
                    {maxTeams} участников → {(maxTeams * (maxTeams - 1)) / 2} матчей, {maxTeams % 2 ? maxTeams : maxTeams - 1} туров. Места — по
                    победам, затем личная встреча, разница карт и раундов.
                  </p>
                )}
              </div>
            )}
            <div className="grid sm:grid-cols-3 gap-5">
              <div>
                <Label>{format === "1v1" ? "Сколько участников" : "Сколько команд"}</Label>
                <Segmented
                  value={maxTeams}
                  onChange={setMaxTeams}
                  options={(bracket === "round_robin" ? [3, 4, 5, 6, 8] : [4, 8, 16, 32]).map((n) => ({ value: n, label: String(n) }))}
                />
              </div>
              <div>
                <Label>Обычные матчи (сколько карт)</Label>
                <Segmented value={bo} onChange={setBo} options={[1, 3].map((n) => ({ value: n, label: `BO${n}` }))} />
                <Hint>BO1 — одна карта. BO3 — играют до двух побед на картах.</Hint>
              </div>
              <div>
                <Label>Финальные матчи (сколько карт)</Label>
                <Segmented value={finalBo} onChange={setFinalBo} options={[1, 3, 5].map((n) => ({ value: n, label: `BO${n}` }))} />
                {bracket === "double_elimination" && (
                  <p className="mt-2 text-[14px] text-fg-3">Гранд-финал Double Elimination всегда BO5: команда из верхней сетки начинает со счётом 1:0.</p>
                )}
                <p className="mt-1.5 text-[13.5px] text-fg-3">
                  {bracket === "double_elimination" || playoffType === "double_elimination"
                    ? "Финал верхней, два последних раунда нижней и гранд-финал"
                    : bracket === "round_robin" || bracket === "swiss"
                      ? "В этом формате нет финальной стадии"
                      : "Полуфиналы и финал плей-офф"}
                </p>
              </div>
            </div>
            {singleElim && (
              <div>
                <Label>Играть ли матч за 3-е место</Label>
                <Segmented
                  value={thirdPlace ? "on" : "off"}
                  onChange={(v) => setThirdPlace(v === "on")}
                  options={[{ value: "off", label: "Без матча" }, { value: "on", label: "Матч за 3-е место" }]}
                />
                <p className="mt-1.5 text-[13.5px] text-fg-3">
                  {thirdPlace ? "Проигравшие в полуфиналах сыграют за бронзу" : "Оба проигравших полуфиналиста делят 3–4 место"}
                </p>
              </div>
            )}
          </Section>

          <Section show={step === 2} title="Расписание" hint="Где и когда пройдёт турнир. Все даты указываются по времени Алматы. Сначала поставьте дату старта.">
            <div>
              <Label>Где проходит</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented value={isLan ? "lan" : "online"} onChange={(v) => setIsLan(v === "lan")} options={[{ value: "lan", label: "В клубе (LAN)" }, { value: "online", label: "Онлайн" }]} />
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
              <Field label="Когда начинается турнир" hint="Остальные даты можно заполнить одной кнопкой справа.">
                <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="field" />
              </Field>
              <button type="button" onClick={autoDates} disabled={!start} className={ghostBtn}>
                Заполнить остальные даты
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Регистрация открывается" hint="С этого момента команды могут подавать заявки">
                <input type="datetime-local" value={regOpen} onChange={(e) => setRegOpen(e.target.value)} className="field" />
              </Field>
              <Field label="Регистрация закрывается" hint="Обычно за сутки до старта">
                <input type="datetime-local" value={regClose} onChange={(e) => setRegClose(e.target.value)} className="field" />
              </Field>
              <Field label="Подтверждение участия (check-in): начало" hint="Капитаны подтверждают участие команды. Обычно за час до старта">
                <input type="datetime-local" value={checkinOpen} onChange={(e) => setCheckinOpen(e.target.value)} className="field" />
              </Field>
              <Field label="Подтверждение участия (check-in): конец" hint="Обычно за 15 минут до старта">
                <input type="datetime-local" value={checkinClose} onChange={(e) => setCheckinClose(e.target.value)} className="field" />
              </Field>
            </div>
            {startMoved && <p className="text-[15px] font-medium text-warn">{startMoved}</p>}
            {dateIssues.length > 0 && (
              <div className="rounded-control border border-danger/30 bg-danger-dim px-5 py-4 text-[15px] text-danger">
                <div className="font-semibold">Даты не по порядку — турнир не сохранится:</div>
                <ul className="mt-1 list-disc pl-5 space-y-0.5">
                  {dateIssues.map((x) => (
                    <li key={x}>{x}</li>
                  ))}
                </ul>
                <div className="mt-1.5 text-fg-2">Проще всего: поставьте старт и нажмите «Заполнить остальные даты».</div>
              </div>
            )}
          </Section>

          <Section
            show={step === 3}
            title="Правила матча"
            hint={
              format === "1v1"
                ? "Дуэль: без тактических пауз. Правила применяются на игровом сервере автоматически."
                : "Эти правила автоматически применяются на игровом сервере в каждом матче."
            }
          >
            <div className="grid sm:grid-cols-2 gap-6">
              {(
                <div>
                  <Label>Кто за какую сторону играет</Label>
                  <Segmented
                    value={knife ? "knife" : "fixed"}
                    onChange={(v) => setKnife(v === "knife")}
                    options={[{ value: "knife", label: "Решает ножевой раунд" }, { value: "fixed", label: "Заранее заданы" }]}
                  />
                  <p className="mt-1.5 text-[13.5px] text-fg-3">
                    {knife ? "Команды сыграют раунд на ножах — победитель выбирает сторону" : "Первая команда начинает за CT, на следующей карте стороны меняются"}
                  </p>
                </div>
              )}
              <div>
                <Label>Овертайм (если счёт 12:12)</Label>
                <Segmented
                  value={overtime ? "on" : "off"}
                  onChange={(v) => setOvertime(v === "on")}
                  options={[{ value: "on", label: "Играем овертайм" }, { value: "off", label: "Без овертайма" }]}
                />
              </div>
              {format !== "1v1" && (
                <div>
                  <Label>Тактические паузы (сколько и на сколько секунд)</Label>
                  <Segmented value={timeouts} onChange={setTimeouts} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
                  <div className="mt-2">
                    <Segmented value={timeoutSec} onChange={setTimeoutSec} options={[30, 45, 60].map((n) => ({ value: n, label: `${n} с` }))} />
                  </div>
                </div>
              )}
              <div>
                <Label>{format === "1v1" ? "Технические паузы на игрока: при сбое, сколько и на сколько" : "Технические паузы: при сбое, сколько и на сколько"}</Label>
                <Segmented value={techPauses} onChange={setTechPauses} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
                <div className="mt-2">
                  <Segmented value={techSec} onChange={setTechSec} options={[180, 300, 600].map((n) => ({ value: n, label: `${n / 60} мин` }))} />
                </div>
              </div>
            </div>
            <p className="mt-4 text-[13.5px] text-fg-3">
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
                  <Field label="Требования к участникам" hint="Кто может участвовать. Если оставить пустым — покажем стандартные требования.">
                    <textarea name="requirements" rows={4} value={reqText} onChange={(e) => setReqText(e.target.value)} className="field resize-y" />
                  </Field>
                  <button type="button" onClick={() => ask("requirements")} className={buttonClass("outline", "sm", "-mt-2 !h-11 !px-4 !text-[14.5px]")}>
                    Вставить шаблон требований · {modeLabel}
                  </button>
                  <Field label="Регламент (правила турнира)" hint="Игроки читают его на странице турнира. Кнопка под полем заполнит текст по вашим настройкам выше — потом его можно поправить.">
                    <textarea name="rules" rows={14} value={rulesText} onChange={(e) => setRulesText(e.target.value)} className="field resize-y" />
                  </Field>
                  <button type="button" onClick={() => ask("rules")} className={buttonClass("outline", "sm", "-mt-2 !h-11 !px-4 !text-[14.5px]")}>
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

          <Section show={step === 4} title="Карты" hint="Нажмите на карту, чтобы добавить её в турнир или убрать. Выбранные карты отмечены зелёным.">
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
                      "relative h-20 overflow-hidden rounded-control border-2 px-3.5 py-3 text-left transition",
                      on ? "border-accent bg-accent-dim" : "border-line bg-surface-2 opacity-60 hover:opacity-90",
                    )}
                  >
                    {img && (
                      <>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={img} alt="" className="absolute inset-0 size-full object-cover" />
                        <span className="absolute inset-0 bg-gradient-to-t from-black/75 to-transparent" />
                      </>
                    )}
                    <span className={cn("relative text-[16px] font-bold", img ? "text-white drop-shadow-sm" : "text-fg")}>{m.name}</span>
                    <span className={cn("absolute top-3 right-3 size-5 rounded grid place-items-center text-[12.5px] font-bold", on ? "bg-accent text-accent-ink" : "border border-line-strong")}>
                      {on ? "✓" : ""}
                    </span>
                    {(MODES[format as ModeKey]?.maps as readonly string[] | undefined)?.includes(m.id) && (
                      <span className="absolute bottom-2 left-3.5 text-[12.5px] font-medium text-fg-3">стандартная для режима</span>
                    )}
                  </button>
                );
              })}
            </div>
            {workshopMaps.length > 0 && (
              <div>
                <Label>Свои карты (из Steam Workshop)</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                  {workshopMaps.map((w) => {
                    const on = maps.includes(w);
                    return (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setMaps((list) => (on ? list.filter((x) => x !== w) : [...list, w]))}
                        className={cn(
                          "relative h-20 overflow-hidden rounded-control border-2 px-3.5 py-3 text-left transition",
                          on ? "border-accent bg-accent-dim" : "border-line bg-surface-2 opacity-60 hover:opacity-90",
                        )}
                      >
                        <span className="text-[16px] font-bold text-fg">{w.split("@")[0]}</span>
                        <span className="absolute bottom-2 left-3.5 text-[12.5px] font-medium text-fg-3">из Workshop</span>
                        <span className={cn("absolute top-3 right-3 size-5 rounded grid place-items-center text-[12.5px] font-bold", on ? "bg-accent text-accent-ink" : "border border-line-strong")}>
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
                    <span key={m} className="h-10 pl-3.5 pr-1 inline-flex items-center gap-2 rounded-control border border-accent/50 bg-accent-dim text-[15px]">
                      {m.split("@")[0]}
                      <span className="text-[12.5px] text-fg-3">Workshop</span>
                      <button
                        type="button"
                        onClick={() => setMaps((l) => l.filter((x) => x !== m))}
                        className="size-8 grid place-items-center rounded text-fg-3 hover:text-danger"
                        aria-label="Убрать карту"
                      >
                        ✕
                      </button>
                    </span>
                  ))}
              </div>
            )}
            <div className="rounded-control bg-surface-2 border border-line-subtle p-5">
              <div className="text-[16px] font-bold text-fg">Добавить свою карту из Steam Workshop</div>
              <p className="mt-1 text-[13.5px] text-fg-3">
                Карта добавится только в этот турнир. Чтобы она всегда была под рукой и её проверили на сервере, добавьте её в «Настройки» → «Workshop-карты».
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <input value={wsName} onChange={(e) => setWsName(e.target.value)} placeholder="Название, например aim_map" aria-label="Название карты" className="field w-60" />
                <input
                  value={wsId}
                  onChange={(e) => setWsId(e.target.value)}
                  placeholder="Ссылка на карту в Steam Workshop"
                  aria-label="Ссылка на карту в Steam Workshop"
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
            <div className="flex flex-wrap items-center gap-3 text-[15px]">
              <span className={mapWarning ? "font-medium text-warn" : "text-fg-2"}>
                Выбрано карт: {maps.length}
                {mapWarning ? ` · ${mapWarning}` : ""}
              </span>
              <button type="button" onClick={() => setMaps([...(MODES[format as ModeKey]?.maps ?? ACTIVE_POOL)])} className="font-semibold text-accent hover:underline">
                Вернуть стандартный набор карт
              </button>
            </div>
          </Section>

          <Section show={step === 5} title="Регистрация" hint="Что нужно знать участникам: взнос, призы, ссылки и контакты. Всё необязательно — заполняйте, что есть.">
            <div className="rounded-control bg-surface-2 border border-line-subtle p-5 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="max-w-lg">
                  <div className="text-[17px] font-bold text-fg">Официальный турнир (по положению, например с акиматом)</div>
                  <p className="mt-1 text-[13.5px] text-fg-3 leading-relaxed">
                    Включайте только для городских турниров: заявка подаётся от организации, анкеты игроков, проверка возраста, тренер,
                    отметки о бумажных документах, выгрузка в Excel и печать заявок (Приложение №1).
                  </p>
                </div>
                <Segmented
                  value={official ? "on" : "off"}
                  onChange={(v) => {
                    setOfficial(v === "on");
                    if (v === "on" && format === "1v1") setFormat("5v5");
                  }}
                  options={[{ value: "off", label: "Обычный" }, { value: "on", label: "Официальный" }]}
                />
              </div>
              {official && (
                <>
                  <div className="grid sm:grid-cols-3 gap-5">
                    <Field label="Возраст от" hint="включительно, на дату старта">
                      <input type="number" min={0} max={120} value={minAge} onChange={(e) => setMinAge(Number(e.target.value))} className="field num" />
                    </Field>
                    <Field label="Возраст до" hint="включительно">
                      <input type="number" min={0} max={120} value={maxAge} onChange={(e) => setMaxAge(Number(e.target.value))} className="field num" />
                    </Field>
                    <Field label="Город участников" hint="живут, учатся или работают">
                      <input value={city} onChange={(e) => setCity(e.target.value)} className="field" />
                    </Field>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div>
                      <Label>Тренер в заявке команды</Label>
                      <Segmented
                        value={requireCoach ? "on" : "off"}
                        onChange={(v) => setRequireCoach(v === "on")}
                        options={[{ value: "on", label: "Обязателен" }, { value: "off", label: "Не нужен" }]}
                      />
                    </div>
                    <div>
                      <Label>Запасные игроки</Label>
                      <Segmented
                        value={allowSubs ? "on" : "off"}
                        onChange={(v) => setAllowSubs(v === "on")}
                        options={[{ value: "off", label: "Без запасных" }, { value: "on", label: "Разрешены" }]}
                      />
                    </div>
                  </div>
                  <p className="text-[13.5px] text-fg-3">
                    {format === "1v1"
                      ? "Официальный турнир — только командный режим."
                      : `Команда: ${MODES[format as ModeKey]?.size ?? 5} игроков${requireCoach ? " + тренер" : ""}${allowSubs ? `, до ${MODES[format as ModeKey]?.subs ?? 0} запасных` : ", без запасных — состав в заявке окончательный"}. Игроки ${minAge}–${maxAge} лет.`}
                  </p>
                  {officialIssue && <p className="text-[15px] font-medium text-warn">{officialIssue}</p>}
                </>
              )}
            </div>
            <div>
              <Label>Сколько стоит участие</Label>
              <div className="flex flex-wrap items-center gap-3">
                <Segmented
                  value={freeEntry ? "free" : "paid"}
                  onChange={(v) => setFreeEntry(v === "free")}
                  options={[{ value: "free", label: "Бесплатно" }, { value: "paid", label: "Платно" }]}
                />
                {!freeEntry && <input value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="10 000 ₸ с команды" aria-label="Размер взноса" className="field w-72" />}
              </div>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Призовой фонд (всего)" hint="Например: 500 000 ₸. Кнопка справа сама разделит сумму по местам." className="flex-1 min-w-[240px]">
                <input name="prize_pool" value={prizePool} onChange={(e) => setPrizePool(e.target.value)} placeholder="500 000 ₸" className="field font-semibold" />
              </Field>
              <button type="button" onClick={splitPrize} className={ghostBtn}>
                Разделить на три места (50 / 30 / 20 %)
              </button>
            </div>
            <div className="space-y-3">
              <Label>Кто что получает</Label>
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
                    className="size-12 shrink-0 rounded-control border border-line-strong bg-surface text-fg-3 hover:text-danger"
                    aria-label="Убрать место"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setPrizes((list) => [...list, { place: `${list.length + 1} место`, prize: "" }])} className="text-[15px] font-semibold text-accent hover:underline">
                + Добавить место
              </button>
            </div>
            <div className="grid sm:grid-cols-2 gap-5">
              <Field label="Трансляция" hint="Twitch или YouTube — встроится в страницу турнира">
                <input name="stream_url" defaultValue={t?.stream_url ?? ""} placeholder="https://twitch.tv/f16arena" className="field" />
              </Field>
              <Field label="Discord" hint="Сервер для участников">
                <input name="discord_url" defaultValue={t?.discord_url ?? ""} placeholder="https://discord.gg/…" className="field" />
              </Field>
              <Field label="Как связаться с организатором" hint="Telegram, WhatsApp или телефон — для вопросов от участников">
                <input name="contact" defaultValue={t?.contact ?? ""} placeholder="@f16arena или +7 …" className="field" />
              </Field>
            </div>
            <div>
              <Label>Спонсоры и партнёры (по желанию)</Label>
              <div className="space-y-3">
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
                      className="size-12 shrink-0 rounded-control border border-line-strong bg-surface text-fg-3 hover:text-danger"
                      aria-label="Убрать спонсора"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => setSponsors((l) => [...l, { name: "", url: "" }])} className="text-[15px] font-semibold text-accent hover:underline">
                  + Добавить спонсора
                </button>
              </div>
            </div>
          </Section>

          <Section show={step === 6} title="Публикация" hint="Последний шаг: проверьте итог справа и нажмите зелёную кнопку.">
            <div className="text-[16px] text-fg-2 leading-relaxed max-w-xl">
              {t
                ? "Изменения сразу появятся на странице турнира. Нажмите «Сохранить изменения» справа."
                : "Турнир сохранится как черновик и пока не будет виден игрокам. Когда будете готовы, откройте регистрацию на странице турнира."}
            </div>
            {Object.entries(missing).filter(([, v]) => v).length > 0 && (
              <div className="space-y-1.5">
                {Object.entries(missing)
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <button key={k} type="button" onClick={() => setStep(Number(k))} className="block text-[15.5px] font-medium text-warn hover:underline">
                      Исправить в шаге «{STEPS[Number(k)]}»: {v} →
                    </button>
                  ))}
              </div>
            )}
          </Section>

          <div className="mt-10 pt-6 border-t border-ink/[0.06] flex items-center justify-between gap-3">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0} className={ghostBtn}>
              ← Назад
            </button>
            {step < STEPS.length - 1 ? (
              <button type="button" onClick={() => setStep((s) => s + 1)} className={buttonClass("primary", "md", "!h-12 !px-6 !text-[16px]")}>
                Дальше: {STEPS[step + 1]} →
              </button>
            ) : null}
          </div>
        </div>

        {/* сводка */}
        <aside className={cn(ADMIN_CARD, "p-6 xl:sticky xl:top-8")}>
          <div className="text-[14px] font-semibold text-fg-3">Коротко о турнире</div>
          <div className="mt-1.5 text-[20px] font-bold tracking-[-0.015em] truncate">{name || "Новый турнир"}</div>
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
            {official && <SummaryRow label="Официальный" value={`${minAge}–${maxAge} лет · ${city || "—"}`} warn={!!officialIssue} />}
            {singleElim && thirdPlace && <SummaryRow label="3-е место" value="матч за бронзу" />}
          </div>
          <div className="mt-6">
            {canSubmit ? (
              <SubmitButton size="lg" className="w-full !text-[16px]" pendingText="Сохраняем…">
                {t ? "Сохранить изменения" : "Создать турнир"}
              </SubmitButton>
            ) : (
              <button type="button" onClick={() => setStep(0)} className={buttonClass("primary", "lg", "w-full !text-[16px] opacity-50")}>
                Укажите название
              </button>
            )}
          </div>
        </aside>
      </div>
    </ActionForm>
  );
}
