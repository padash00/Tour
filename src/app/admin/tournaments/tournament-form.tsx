"use client";

import { useMemo, useState } from "react";
import { ACTIVE_POOL, CS2_MAPS, slugify } from "@/lib/maps";
import type { PrizeRow, Tournament } from "@/lib/types";
import { ActionForm, SubmitButton, type FormAction } from "@/components/forms";
import { Card, Field, cn } from "@/components/ui";

const DEFAULT_RULES = `Вето проходит на странице матча до подключения к серверу.
На сервер допускаются только заявленные игроки (по SteamID).
Разминка: .ready / .r — матч стартует при 10/10 готовых.
Ножевой раунд: победитель выбирает сторону командой .stay или .switch.
Тактические паузы — .tac, технические — .tech.
Каждая карта записывается в демо. Споры — через страницу матча.`;

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
    <div className="inline-flex flex-wrap gap-1 rounded-xl border border-line bg-bg-2 p-1">
      {options.map((o) => (
        <button
          key={String(o.value)}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "h-9 min-w-12 px-3.5 rounded-lg text-sm font-medium transition",
            value === o.value ? "bg-surface-3 text-fg shadow-[inset_0_0_0_1px_#2a3850]" : "text-fg-3 hover:text-fg-2",
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
        "text-left rounded-xl border p-4 transition",
        active ? "border-[#8bb8ff66] bg-accent-dim" : "border-line bg-bg-2 hover:border-line-strong",
      )}
    >
      <div className="flex items-center justify-between">
        <span className={cn("font-semibold", active ? "text-accent" : "text-fg")}>{title}</span>
        <span className={cn("size-4 rounded-full border-2", active ? "border-accent bg-accent" : "border-line-strong")} />
      </div>
      <p className="mt-1.5 text-xs text-fg-3 leading-relaxed">{text}</p>
    </button>
  );
}

function Section({ step, title, hint, children }: { step: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <Card className="p-6 sm:p-7">
      <div className="flex items-baseline gap-3 mb-5">
        <span className="num text-xs text-fg-3">0{step}</span>
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          {hint && <p className="mt-0.5 text-xs text-fg-3">{hint}</p>}
        </div>
      </div>
      <div className="space-y-5">{children}</div>
    </Card>
  );
}

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

// ───────────────────────── форма

export function TournamentForm({ action, t }: { action: FormAction; t?: Tournament }) {
  const [name, setName] = useState(t?.name ?? "");
  const [slug, setSlug] = useState(t?.slug ?? "");
  const [slugEdited, setSlugEdited] = useState(!!t);
  const [format, setFormat] = useState(t?.format ?? "5v5");
  const [bracket, setBracket] = useState(t?.bracket_type ?? "double_elimination");
  const [maxTeams, setMaxTeams] = useState(t?.max_teams ?? 16);
  const [bo, setBo] = useState(t?.default_best_of ?? 1);
  const [finalBo, setFinalBo] = useState(t?.final_best_of ?? 3);
  const [isLan, setIsLan] = useState(t?.is_lan ?? true);
  const [location, setLocation] = useState(t?.location ?? "F16 Arena");
  const [maps, setMaps] = useState<string[]>(t?.map_pool ?? [...ACTIVE_POOL]);
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

  const effectiveSlug = slugEdited ? slug : slugify(name);
  const mapWarning =
    maps.length < Math.max(bo, finalBo)
      ? `Для BO${Math.max(bo, finalBo)} нужно минимум ${Math.max(bo, finalBo)} карт`
      : maps.length !== 7
        ? "Стандартное вето рассчитано на 7 карт"
        : null;

  const autoDates = () => {
    if (!start) return;
    setRegClose(shift(start, -24 * 60));
    setCheckinOpen(shift(start, -60));
    setCheckinClose(shift(start, -15));
    if (!regOpen) {
      const now = new Date(Date.now() + 5 * 3600 * 1000);
      setRegOpen(now.toISOString().slice(0, 16));
    }
  };

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

  return (
    <ActionForm action={action} className="space-y-5 pb-28">
      {t && <input type="hidden" name="id" value={t.id} />}
      <input type="hidden" name="slug" value={effectiveSlug} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="bracket_type" value={bracket} />
      <input type="hidden" name="max_teams" value={maxTeams} />
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

      {/* 1 */}
      <Section step={1} title="Название">
        <input
          name="name"
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="F16 Open Cup #1"
          className="field h-14 text-xl font-semibold"
        />
        <div className="flex flex-wrap items-center gap-2 text-sm text-fg-3">
          <span>Адрес:</span>
          {slugEdited ? (
            <input
              value={slug}
              onChange={(e) => setSlug(slugify(e.target.value))}
              className="field h-8 py-0 w-64 num text-[13px]"
            />
          ) : (
            <span className="num text-fg-2">/tournaments/{effectiveSlug || "…"}</span>
          )}
          {!slugEdited && (
            <button type="button" onClick={() => { setSlug(effectiveSlug); setSlugEdited(true); }} className="text-accent hover:underline">
              изменить
            </button>
          )}
        </div>
      </Section>

      {/* 2 */}
      <Section step={2} title="Формат">
        <div className="grid sm:grid-cols-2 gap-3">
          <OptionCard
            active={bracket === "double_elimination"}
            onClick={() => setBracket("double_elimination")}
            title="Double Elimination"
            text="Команда выбывает после двух поражений. Верхняя и нижняя сетка, гранд-финал."
          />
          <OptionCard
            active={bracket === "single_elimination"}
            onClick={() => setBracket("single_elimination")}
            title="Single Elimination"
            text="Проиграл — выбыл. Быстрее, подходит для коротких турниров."
          />
        </div>
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Команд</div>
            <Segmented value={maxTeams} onChange={setMaxTeams} options={[4, 8, 16, 32].map((n) => ({ value: n, label: String(n) }))} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Режим</div>
            <Segmented value={format} onChange={setFormat} options={[{ value: "5v5", label: "5 на 5" }, { value: "2v2", label: "2 на 2" }]} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Обычные матчи</div>
            <Segmented value={bo} onChange={setBo} options={[1, 3].map((n) => ({ value: n, label: `BO${n}` }))} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Финальная стадия</div>
            <Segmented value={finalBo} onChange={setFinalBo} options={[1, 3, 5].map((n) => ({ value: n, label: `BO${n}` }))} />
            <p className="mt-1.5 text-xs text-fg-3">
              {bracket === "double_elimination" ? "Финал верхней, два последних раунда нижней и гранд-финал" : "Полуфиналы и финал"}
            </p>
          </div>
        </div>
      </Section>

      {/* 3 */}
      <Section step={3} title="Маппул" hint="Нажмите на карту, чтобы включить или убрать её">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
          {CS2_MAPS.map((m) => {
            const on = maps.includes(m.id);
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMaps((list) => (on ? list.filter((x) => x !== m.id) : [...list, m.id]))}
                className={cn(
                  "relative h-20 overflow-hidden rounded-xl border p-3 text-left transition",
                  on ? "border-[#8bb8ff55]" : "border-line opacity-50 hover:opacity-80",
                )}
                style={{ background: on ? `linear-gradient(135deg, ${m.tint}2a, transparent 70%), var(--color-bg-2)` : "var(--color-bg-2)" }}
              >
                <span className="font-semibold">{m.name}</span>
                <span className={cn("absolute bottom-2.5 right-2.5 size-5 rounded-md grid place-items-center text-[11px]", on ? "bg-accent text-[#06101f]" : "border border-line-strong")}>
                  {on ? "✓" : ""}
                </span>
                {!m.active && <span className="absolute bottom-2.5 left-3 text-[10px] uppercase tracking-wider text-fg-3">резерв</span>}
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <span className={mapWarning ? "text-warn" : "text-fg-3"}>
            Выбрано {maps.length} {mapWarning ? `· ${mapWarning}` : "· вето 7 карт"}
          </span>
          <button type="button" onClick={() => setMaps([...ACTIVE_POOL])} className="text-accent hover:underline">
            Активный пул
          </button>
        </div>
      </Section>

      {/* 4 */}
      <Section step={4} title="Где и когда" hint="Время Алматы">
        <div className="flex flex-wrap items-end gap-3">
          <Segmented value={isLan ? "lan" : "online"} onChange={(v) => setIsLan(v === "lan")} options={[{ value: "lan", label: "LAN" }, { value: "online", label: "Онлайн" }]} />
          <input
            name="location"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder={isLan ? "Клуб, город" : "Регион"}
            className="field flex-1 min-w-[220px]"
          />
        </div>
        <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
          <Field label="Старт турнира">
            <input type="datetime-local" value={start} onChange={(e) => setStart(e.target.value)} className="field" />
          </Field>
          <button
            type="button"
            onClick={autoDates}
            disabled={!start}
            className="h-[42px] px-4 rounded-[10px] border border-line text-sm text-fg-2 hover:text-fg hover:border-line-strong disabled:opacity-40"
          >
            Заполнить остальное по старту
          </button>
        </div>
        <div className="grid sm:grid-cols-2 gap-3">
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
      </Section>

      {/* 5 */}
      <Section step={5} title="Призы">
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Призовой фонд" className="flex-1 min-w-[200px]">
            <input name="prize_pool" value={prizePool} onChange={(e) => setPrizePool(e.target.value)} placeholder="500 000 ₸" className="field text-lg font-semibold" />
          </Field>
          <button
            type="button"
            onClick={splitPrize}
            className="h-[42px] px-4 rounded-[10px] border border-line text-sm text-fg-2 hover:text-fg hover:border-line-strong"
          >
            Разделить 50 / 30 / 20
          </button>
        </div>
        <div className="space-y-2">
          {prizes.map((p, i) => (
            <div key={i} className="flex gap-2">
              <input
                value={p.place}
                onChange={(e) => setPrizes((list) => list.map((x, j) => (j === i ? { ...x, place: e.target.value } : x)))}
                className="field w-36"
              />
              <input
                value={p.prize}
                onChange={(e) => setPrizes((list) => list.map((x, j) => (j === i ? { ...x, prize: e.target.value } : x)))}
                placeholder="Сумма или приз"
                className="field flex-1"
              />
              <button
                type="button"
                onClick={() => setPrizes((list) => list.filter((_, j) => j !== i))}
                className="size-[42px] shrink-0 rounded-[10px] border border-line text-fg-3 hover:text-danger hover:border-[#ef7a7a44]"
                aria-label="Убрать место"
              >
                ✕
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPrizes((list) => [...list, { place: `${list.length + 1} место`, prize: "" }])}
            className="text-sm text-accent hover:underline"
          >
            + Добавить место
          </button>
        </div>
      </Section>

      {/* 6 */}
      <Section step={6} title="Оформление и тексты">
        <label className="block cursor-pointer">
          <div
            className={cn(
              "relative grid place-items-center overflow-hidden rounded-xl border border-dashed border-line-strong bg-bg-2 aspect-[3/1] transition hover:border-accent",
            )}
          >
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={cover} alt="" className="absolute inset-0 h-full w-full object-cover" />
            ) : (
              <div className="text-center text-sm text-fg-3">
                <div className="text-fg-2 font-medium">Загрузить обложку</div>
                <div className="mt-1 text-xs">PNG, JPG или WEBP до 3 МБ · лучше широкая и тёмная</div>
              </div>
            )}
          </div>
          <input
            name="cover"
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) setCover(URL.createObjectURL(f));
            }}
          />
        </label>
        {t?.cover_url && (
          <label className="flex items-center gap-2 text-sm text-fg-2">
            <input type="checkbox" name="removeCover" className="size-4 accent-[#8bb8ff]" onChange={(e) => setCover(e.target.checked ? null : t.cover_url)} />
            Убрать обложку
          </label>
        )}
        <Field label="Описание турнира">
          <textarea name="description" rows={3} defaultValue={t?.description ?? ""} placeholder="Пара предложений для страницы турнира" className="field resize-y" />
        </Field>
        <details className="group">
          <summary className="cursor-pointer list-none text-sm text-fg-2 hover:text-fg">
            <span className="group-open:hidden">▸</span>
            <span className="hidden group-open:inline">▾</span> Требования и регламент
          </summary>
          <div className="mt-4 space-y-4">
            <Field label="Требования к участникам" hint="Если пусто — показываются стандартные">
              <textarea name="requirements" rows={3} defaultValue={t?.requirements ?? ""} className="field resize-y" />
            </Field>
            <Field label="Регламент">
              <textarea name="rules" rows={8} defaultValue={t?.rules ?? DEFAULT_RULES} className="field resize-y" />
            </Field>
          </div>
        </details>
      </Section>

      {/* sticky bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
          <div className="min-w-0 text-sm">
            <div className="truncate font-semibold">{name || "Новый турнир"}</div>
            <div className="truncate text-xs text-fg-3">
              {bracket === "double_elimination" ? "Double Elim" : "Single Elim"} · {maxTeams} команд · BO{bo} / финал BO{finalBo} · {maps.length} карт
            </div>
          </div>
          <SubmitButton size="lg" pendingText="Сохраняем…">
            {t ? "Сохранить" : "Создать турнир"}
          </SubmitButton>
        </div>
      </div>
    </ActionForm>
  );
}
