"use client";

import { useMemo, useState } from "react";
import { ACTIVE_POOL, CS2_MAPS, slugify } from "@/lib/maps";
import { FORMATS, type FormatKind } from "@/lib/formats";
import { MODES, type ModeKey } from "@/lib/modes";
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

export function TournamentForm({
  action,
  t,
  workshopMaps = [],
}: {
  action: FormAction;
  t?: Tournament;
  /** библиотека карт из Steam Workshop (Админка → Настройки), формат «name@id» */
  workshopMaps?: string[];
}) {
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
  const [overtime, setOvertime] = useState(t?.overtime ?? true);
  const [knife, setKnife] = useState(t?.knife_round ?? true);
  const [timeouts, setTimeouts] = useState(t?.timeouts_per_team ?? 3);
  const [timeoutSec, setTimeoutSec] = useState(t?.timeout_seconds ?? 30);
  const [techPauses, setTechPauses] = useState(t?.tech_pauses ?? 2);
  const [techSec, setTechSec] = useState(t?.tech_pause_seconds ?? 300);
  const [freeEntry, setFreeEntry] = useState(!t?.entry_fee || t.entry_fee === "Бесплатно");
  const [entryFee, setEntryFee] = useState(t?.entry_fee && t.entry_fee !== "Бесплатно" ? t.entry_fee : "");
  const [sponsors, setSponsors] = useState<{ name: string; url?: string }[]>(t?.sponsors ?? []);

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
      <Section step={2} title="Режим и формат">
        <div>
          <div className="mb-2 text-[13px] font-medium text-fg-2">Режим игры</div>
          <div className="grid sm:grid-cols-3 gap-3">
            {(Object.keys(MODES) as ModeKey[]).map((k) => (
              <OptionCard
                key={k}
                active={format === k}
                onClick={() => {
                  setFormat(k);
                  const aim = workshopMaps.filter((m) => /^aim/i.test(m));
                  setMaps(k === "1v1" && aim.length ? [aim[0]] : [...MODES[k].maps]);
                  if (k === "1v1") {
                    setKnife(false);
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
        <div className="pt-1 text-[13px] font-medium text-fg-2">Формат турнира</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(FORMATS) as FormatKind[]).map((k) => (
            <OptionCard key={k} active={bracket === k} onClick={() => setBracket(k)} title={FORMATS[k].title} text={FORMATS[k].text} />
          ))}
        </div>
        {(bracket === "groups_playoff" || bracket === "swiss" || bracket === "swiss_playoff" || bracket === "round_robin") && (
          <div className="grid sm:grid-cols-3 gap-5 rounded-xl border border-line bg-bg-2/60 p-4">
            {bracket === "groups_playoff" && (
              <>
                <div>
                  <div className="mb-2 text-[13px] font-medium text-fg-2">Групп</div>
                  <Segmented value={groupsCount} onChange={setGroupsCount} options={[2, 4, 8].map((n) => ({ value: n, label: String(n) }))} />
                </div>
                <div>
                  <div className="mb-2 text-[13px] font-medium text-fg-2">Выходят из группы</div>
                  <Segmented value={advance} onChange={setAdvance} options={[1, 2, 4].map((n) => ({ value: n, label: String(n) }))} />
                </div>
              </>
            )}
            {(bracket === "swiss" || bracket === "swiss_playoff") && (
              <div>
                <div className="mb-2 text-[13px] font-medium text-fg-2">Побед для выхода / поражений для вылета</div>
                <Segmented value={swissWins} onChange={setSwissWins} options={[2, 3].map((n) => ({ value: n, label: `${n}–${n}` }))} />
              </div>
            )}
            {(bracket === "groups_playoff" || bracket === "swiss_playoff") && (
              <div>
                <div className="mb-2 text-[13px] font-medium text-fg-2">Плей-офф</div>
                <Segmented
                  value={playoffType}
                  onChange={setPlayoffType}
                  options={[{ value: "single_elimination", label: "Single" }, { value: "double_elimination", label: "Double" }]}
                />
              </div>
            )}
            {bracket === "round_robin" && (
              <p className="sm:col-span-3 text-sm text-fg-3">
                {maxTeams} участников → {(maxTeams * (maxTeams - 1)) / 2} матчей, {maxTeams % 2 ? maxTeams : maxTeams - 1} туров. Места — по
                победам, затем личная встреча, разница карт и раундов.
              </p>
            )}
          </div>
        )}
        <div className="grid sm:grid-cols-2 gap-5">
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">{format === "1v1" ? "Участников" : "Команд"}</div>
            <Segmented
              value={maxTeams}
              onChange={setMaxTeams}
              options={(bracket === "round_robin" ? [3, 4, 5, 6, 8] : [4, 8, 16, 32]).map((n) => ({ value: n, label: String(n) }))}
            />
          </div>

          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Обычные матчи</div>
            <Segmented value={bo} onChange={setBo} options={[1, 3].map((n) => ({ value: n, label: `BO${n}` }))} />
          </div>
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Финальная стадия</div>
            <Segmented value={finalBo} onChange={setFinalBo} options={[1, 3, 5].map((n) => ({ value: n, label: `BO${n}` }))} />
            <p className="mt-1.5 text-xs text-fg-3">
              {bracket === "double_elimination" || playoffType === "double_elimination"
                ? "Финал верхней, два последних раунда нижней и гранд-финал"
                : bracket === "round_robin" || bracket === "swiss"
                  ? "В этом формате нет финальной стадии — действует формат обычных матчей"
                  : "Полуфиналы и финал плей-офф"}
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
                {(MODES[format as ModeKey]?.maps as readonly string[] | undefined)?.includes(m.id) && (
                  <span className="absolute bottom-2.5 left-3 text-[10px] uppercase tracking-wider text-fg-3">пул режима</span>
                )}
              </button>
            );
          })}
        </div>
        {workshopMaps.length > 0 && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Карты из Workshop</div>
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {workshopMaps.map((w) => {
                const on = maps.includes(w);
                return (
                  <button
                    key={w}
                    type="button"
                    onClick={() => setMaps((list) => (on ? list.filter((x) => x !== w) : [...list, w]))}
                    className={cn(
                      "relative h-20 overflow-hidden rounded-xl border p-3 text-left transition",
                      on ? "border-[#8bb8ff55] bg-accent-dim" : "border-line bg-bg-2 opacity-50 hover:opacity-80",
                    )}
                  >
                    <span className="font-semibold">{w.split("@")[0]}</span>
                    <span className="absolute bottom-2.5 left-3 text-[10px] uppercase tracking-wider text-fg-3">workshop</span>
                    <span className={cn("absolute bottom-2.5 right-2.5 size-5 rounded-md grid place-items-center text-[11px]", on ? "bg-accent text-[#06101f]" : "border border-line-strong")}>
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
                <span key={m} className="h-9 pl-3 pr-1 inline-flex items-center gap-2 rounded-lg border border-[#8bb8ff55] bg-accent-dim text-sm">
                  {m.split("@")[0]}
                  <span className="text-[10px] text-fg-3 num">Workshop</span>
                  <button
                    type="button"
                    onClick={() => setMaps((l) => l.filter((x) => x !== m))}
                    className="size-7 grid place-items-center rounded-md text-fg-3 hover:text-danger"
                    aria-label="Убрать"
                  >
                    ✕
                  </button>
                </span>
              ))}
          </div>
        )}
        <div className="rounded-xl border border-line bg-bg-2/60 p-4">
          <div className="text-[13px] font-medium text-fg-2">Своя карта из Steam Workshop</div>
          <p className="mt-1 text-xs text-fg-3">
            Только для этого турнира. Чтобы карта была всегда под рукой — добавьте её в Админка → Настройки → Карты из Workshop.
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
                const name = wsName.trim().replace(/[@,\s]+/g, "_");
                if (!id || !name) return;
                setMaps((l) => [...l.filter((x) => !x.endsWith(`@${id}`)), `${name}@${id}`]);
                setWsName("");
                setWsId("");
              }}
              className="h-[42px] px-4 rounded-[10px] border border-line text-sm text-fg-2 hover:text-fg hover:border-line-strong"
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
          <button
            type="button"
            onClick={() => setMaps([...(MODES[format as ModeKey]?.maps ?? ACTIVE_POOL)])}
            className="text-accent hover:underline"
          >
            Стандартный пул режима
          </button>
        </div>
      </Section>

      {/* 4 */}
      <Section
        step={4}
        title="Правила игры"
        hint={
          format === "1v1"
            ? "Дуэль: стороны фиксированные, без ножа и тактических пауз. Уходит в MatchZy при загрузке матча"
            : "Уходят в MatchZy на сервер при загрузке каждого матча"
        }
      >
        <div className="grid sm:grid-cols-2 gap-5">
          {format !== "1v1" && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Стороны на карте</div>
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
            <div className="mb-2 text-[13px] font-medium text-fg-2">Овертайм</div>
            <Segmented
              value={overtime ? "on" : "off"}
              onChange={(v) => setOvertime(v === "on")}
              options={[{ value: "on", label: "MR3 при 12:12" }, { value: "off", label: "Без овертайма" }]}
            />
          </div>
          {format !== "1v1" && (
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">Тактические паузы на команду</div>
            <Segmented value={timeouts} onChange={setTimeouts} options={[0, 1, 2, 3, 4].map((n) => ({ value: n, label: String(n) }))} />
            <div className="mt-2">
              <Segmented value={timeoutSec} onChange={setTimeoutSec} options={[30, 45, 60].map((n) => ({ value: n, label: `${n} с` }))} />
            </div>
          </div>
          )}
          <div>
            <div className="mb-2 text-[13px] font-medium text-fg-2">{format === "1v1" ? "Технические паузы на игрока" : "Технические паузы на команду"}</div>
            <Segmented value={techPauses} onChange={setTechPauses} options={[0, 1, 2, 3].map((n) => ({ value: n, label: String(n) }))} />
            <div className="mt-2">
              <Segmented value={techSec} onChange={setTechSec} options={[180, 300, 600].map((n) => ({ value: n, label: `${n / 60} мин` }))} />
            </div>
          </div>
        </div>
      </Section>

      {/* 5 */}
      <Section step={5} title="Где и когда" hint="Время Алматы">
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

      {/* 6 */}
      <Section step={6} title="Призы и участие">
        <div>
          <div className="mb-2 text-[13px] font-medium text-fg-2">Взнос за участие</div>
          <div className="flex flex-wrap items-center gap-3">
            <Segmented
              value={freeEntry ? "free" : "paid"}
              onChange={(v) => setFreeEntry(v === "free")}
              options={[{ value: "free", label: "Бесплатно" }, { value: "paid", label: "Платно" }]}
            />
            {!freeEntry && (
              <input value={entryFee} onChange={(e) => setEntryFee(e.target.value)} placeholder="10 000 ₸ с команды" className="field w-64" />
            )}
          </div>
        </div>
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

      {/* 7 */}
      <Section step={7} title="Для зрителей и участников" hint="Показывается на странице турнира">
        <div className="grid sm:grid-cols-2 gap-3">
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
          <div className="mb-2 text-[13px] font-medium text-fg-2">Спонсоры и партнёры</div>
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
                  className="size-[42px] shrink-0 rounded-[10px] border border-line text-fg-3 hover:text-danger"
                  aria-label="Убрать"
                >
                  ✕
                </button>
              </div>
            ))}
            <button type="button" onClick={() => setSponsors((l) => [...l, { name: "", url: "" }])} className="text-sm text-accent hover:underline">
              + Добавить спонсора
            </button>
          </div>
        </div>
      </Section>

      {/* 8 */}
      <Section step={8} title="Оформление и тексты">
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
              {FORMATS[bracket].title} · {maxTeams} {format === "1v1" ? "участн." : "команд"} · BO{bo} / финал BO{finalBo} · {maps.length} карт · {knife ? "нож" : "фикс. стороны"}
              {overtime ? " · OT" : ""}
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
