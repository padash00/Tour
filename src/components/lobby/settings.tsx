"use client";

import { useMemo, useState, useTransition } from "react";
import { deleteTemplate, lookupWorkshop, saveTemplate } from "@/app/actions/lobby";
import { mapLabel } from "@/lib/maps";
import { MODES, type ModeKey } from "@/lib/modes";
import { BOT_DIFFICULTY, LIMITS, mapsProblem, PRESETS, withMode, type LobbySettings } from "@/lib/lobby-settings";
import { tint } from "../competition/map-tile";
import { btnClass } from "../primitives";
import { useToast } from "../toast";
import { cn } from "../ui";
import { Choice, Icon, NewBadge, Row, Section, Segments, Sheet, Slider, Toggle } from "./ui";

export type MapOption = { id: string; image?: string | null };
export type Template = { id: string; name: string; settings: LobbySettings };
type Patch = (p: Partial<LobbySettings>) => void;

const MAP_CHOICE = [
  { value: "host" as const, label: "Выбирает хост" },
  { value: "veto" as const, label: "Вето капитанов" },
  { value: "random" as const, label: "Случайно" },
];
const START = [
  { value: "host" as const, label: "Начинает хост" },
  { value: "all_ready" as const, label: "Когда все готовы" },
];
const PICK = [
  { value: "free" as const, label: "Без пика игроков" },
  { value: "captains" as const, label: "Пик капитанов" },
];
const NETWORK = [
  { value: "lan" as const, label: "LAN (в клубе)" },
  { value: "internet" as const, label: "Интернет" },
];
const VOICE = [
  { value: "all" as const, label: "Все слышат всех" },
  { value: "team" as const, label: "Только союзники" },
  { value: "off" as const, label: "Выключен" },
];
const ARMOR = [
  { value: "default" as const, label: "По умолчанию" },
  { value: "kevlar" as const, label: "Бесплатный бронежилет" },
  { value: "helmet" as const, label: "Броня + шлем" },
];

/** Картинка карты: из «Настройки → Карты», иначе фирменный оттенок */
export function MapThumb({ map, image, className, children }: { map: string; image?: string | null; className?: string; children?: React.ReactNode }) {
  const [a, b] = tint(map);
  return (
    <div className={cn("relative overflow-hidden", className)} style={{ background: `linear-gradient(135deg, ${a}, ${b})` }}>
      {image && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="absolute inset-0 h-full w-full object-cover saturate-[0.7] brightness-[0.75]" />
      )}
      <span className="absolute inset-0 bg-gradient-to-t from-[#070b12d9] via-transparent to-transparent" />
      {children}
    </div>
  );
}

/** Короткая панель настроек справа (как в лобби CyberShoke) */
export function QuickSettings({ s, editable, patch, maps, images, onAdvanced }: { s: LobbySettings; editable: boolean; patch: Patch; maps: MapOption[]; images: Record<string, string>; onAdvanced: () => void }) {
  const ro = !editable;
  const pool = useMemo(() => [...new Set([...maps.map((m) => m.id), ...s.maps])], [maps, s.maps]);
  return (
    <div className="space-y-1.5">
      <Row icon={Icon.layers()} label="Best of">
        <Segments value={s.best_of} disabled={ro} onChange={(v) => patch({ best_of: v })} options={[1, 3, 5].map((n) => ({ value: n as 1 | 3 | 5, label: n }))} />
      </Row>
      <Row icon={Icon.swords()} label="Режим">
        <Choice value={s.mode} disabled={ro} onChange={(v) => patch(withMode(s, v))} options={(Object.keys(MODES) as ModeKey[]).map((k) => ({ value: k, label: MODES[k].label.replace(" на ", "×") }))} />
      </Row>
      <Row icon={Icon.map()} label="Выбор карты">
        <Choice value={s.map_choice} disabled={ro} onChange={(v) => patch({ map_choice: v })} options={MAP_CHOICE} />
      </Row>
      {s.map_choice === "host" && s.best_of === 1 ? (
        <Row icon={Icon.map()} label="Карта">
          <Choice value={s.maps[0] ?? ""} disabled={ro} onChange={(v) => patch({ maps: [v] })} options={pool.map((m) => ({ value: m, label: mapLabel(m) }))} />
        </Row>
      ) : (
        <button type="button" onClick={onAdvanced} className="flex min-h-[52px] w-full items-center gap-3 rounded-[10px] bg-white/[0.03] px-4 py-2 text-left hover:bg-white/[0.05]">
          <span className="text-fg-3">{Icon.map()}</span>
          <span className="flex-1 text-[14px]">{s.map_choice === "host" ? "Карты серии" : "Пул карт"}</span>
          <span className="flex -space-x-2">
            {s.maps.slice(0, 5).map((m) => (
              <MapThumb key={m} map={m} image={images[m]} className="size-7 rounded-full border border-surface-2" />
            ))}
          </span>
          <span className="num text-[13px] text-fg-3">{s.maps.length}</span>
        </button>
      )}
      <Row icon={Icon.signal()} label="Сеть">
        <Choice value={s.network} disabled={ro} onChange={(v) => patch({ network: v })} options={NETWORK} />
      </Row>
      <Row icon={Icon.play()} label="Запуск матча">
        <Choice value={s.start} disabled={ro} onChange={(v) => patch({ start: v })} options={START} />
      </Row>
      <Row icon={Icon.users()} label="Разрешить вход в команду">
        <Toggle on={s.allow_join_team} disabled={ro} onChange={(v) => patch({ allow_join_team: v })} />
      </Row>
      <Row icon={Icon.bot()} label="Сложность ботов">
        <Choice value={s.bot_difficulty} disabled={ro} onChange={(v) => patch({ bot_difficulty: v })} options={BOT_DIFFICULTY.map((l, i) => ({ value: i as 0 | 1 | 2 | 3, label: l }))} />
      </Row>
    </div>
  );
}

/** Окно «Расширенные настройки»: все разделы, сетка карт, шаблоны */
export function AdvancedSettings({
  open,
  onClose,
  s,
  editable,
  patch,
  maps,
  images,
  templates,
  onTemplatesChange,
}: {
  open: boolean;
  onClose: () => void;
  s: LobbySettings;
  editable: boolean;
  patch: Patch;
  maps: MapOption[];
  images: Record<string, string>;
  templates: Template[];
  onTemplatesChange: () => void;
}) {
  const ro = !editable;
  const problem = mapsProblem(s);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      width={700}
      title={
        <span className="flex items-center gap-3">
          {Icon.gear("size-6")} Настройки
        </span>
      }
      subtitle={ro ? "Менять настройки может только хост лобби" : undefined}
      footer={
        problem ? (
          <div className="flex items-center justify-center gap-2 rounded-[10px] bg-warn px-4 py-3 text-[14px] font-medium text-[#1a1203]">
            {Icon.map("size-4")} {problem}
          </div>
        ) : (
          <button type="button" onClick={onClose} className={btnClass("primary", "md", "w-full")}>
            Готово
          </button>
        )
      }
    >
      <div className="space-y-4">
        {editable && <Templates s={s} patch={patch} templates={templates} onChange={onTemplatesChange} />}

        <Section title="Основные">
          <Row icon={Icon.swords()} label="Режим">
            <Choice value={s.mode} disabled={ro} onChange={(v) => patch(withMode(s, v))} options={(Object.keys(MODES) as ModeKey[]).map((k) => ({ value: k, label: MODES[k].title }))} />
          </Row>
          <Row icon={Icon.users()} label="Игроков в команде">
            <Segments value={s.team_size} disabled={ro} onChange={(v) => patch({ team_size: v })} options={[1, 2, 3, 4, 5].map((n) => ({ value: n, label: n }))} />
          </Row>
          <Row icon={Icon.signal()} label="Сеть" hint={s.network === "lan" ? "Игрокам выдаётся адрес сервера в клубе" : "Внешний адрес — для игроков из дома"}>
            <Choice value={s.network} disabled={ro} onChange={(v) => patch({ network: v })} options={NETWORK} />
          </Row>
          <Row icon={Icon.users()} label="Выбор игроков" badge={<NewBadge />}>
            <Choice value={s.player_pick} disabled={ro} onChange={(v) => patch({ player_pick: v })} options={PICK} />
          </Row>
          <Row icon={Icon.play()} label="Запуск матча">
            <Choice value={s.start} disabled={ro} onChange={(v) => patch({ start: v })} options={START} />
          </Row>
          <Row icon={Icon.tv()} label="GOTV" hint="Зрители смотрят матч через GOTV (порт сервера + 5)">
            <Toggle on={s.gotv} disabled={ro} onChange={(v) => patch({ gotv: v })} />
          </Row>
        </Section>

        <Section title="Карты">
          <Row icon={Icon.layers()} label="Best of">
            <Segments value={s.best_of} disabled={ro} onChange={(v) => patch({ best_of: v })} options={[1, 3, 5].map((n) => ({ value: n as 1 | 3 | 5, label: n }))} />
          </Row>
          <Row icon={Icon.map()} label="Выбор карты">
            <Choice value={s.map_choice} disabled={ro} onChange={(v) => patch({ map_choice: v })} options={MAP_CHOICE} />
          </Row>
          <MapGrid s={s} ro={ro} patch={patch} maps={maps} images={images} />
        </Section>

        <Section title="Лобби">
          <Row icon={Icon.users()} label="Разрешить вход в команду">
            <Toggle on={s.allow_join_team} disabled={ro} onChange={(v) => patch({ allow_join_team: v })} />
          </Row>
          <Row icon={Icon.rotate()} label="Пересоздание матча" hint="После матча лобби остаётся с тем же составом — можно сыграть ещё. Выключено — лобби закрывается.">
            <Toggle on={s.rematch} disabled={ro} onChange={(v) => patch({ rematch: v })} />
          </Row>
          <Row icon={Icon.mic()} label="Голосовой чат" badge={<NewBadge />}>
            <Choice value={s.voice} disabled={ro} onChange={(v) => patch({ voice: v })} options={VOICE} />
          </Row>
          <Row icon={Icon.users()} label="Максимум ожидающих">
            <Slider value={s.max_waiting} min={LIMITS.max_waiting[0]} max={LIMITS.max_waiting[1]} disabled={ro} onChange={(v) => patch({ max_waiting: v })} />
          </Row>
          <Row icon={Icon.tv()} label="Максимум наблюдателей">
            <Slider value={s.max_spectators} min={LIMITS.max_spectators[0]} max={LIMITS.max_spectators[1]} disabled={ro} onChange={(v) => patch({ max_spectators: v })} />
          </Row>
          <Row icon={Icon.filter()} label="Фильтрация игроков" badge={<NewBadge />} hint="Кого пускать в лобби">
            <Toggle on={s.filter} disabled={ro} onChange={(v) => patch({ filter: v })} />
          </Row>
          {s.filter && (
            <>
              <Row label="FACEIT уровень от">
                <Slider value={s.filter_faceit_min} min={0} max={10} disabled={ro} onChange={(v) => patch({ filter_faceit_min: v })} />
              </Row>
              <Row label="FACEIT уровень до">
                <Slider value={s.filter_faceit_max} min={0} max={10} disabled={ro} onChange={(v) => patch({ filter_faceit_max: v })} />
              </Row>
              <Row label="Минимум сыгранных матчей на сайте">
                <Slider value={s.filter_min_matches} min={0} max={100} disabled={ro} onChange={(v) => patch({ filter_min_matches: v })} />
              </Row>
            </>
          )}
        </Section>

        <Section title="Геймплей">
          <Row icon={Icon.knife()} label="Ножевой раунд">
            <Toggle on={s.knife} disabled={ro} onChange={(v) => patch({ knife: v })} />
          </Row>
          <Row icon={Icon.shuffle()} label="Всего раундов">
            <Segments value={s.max_rounds} disabled={ro} onChange={(v) => patch({ max_rounds: v })} options={[16, 24, 30, 60].map((n) => ({ value: n as 16 | 24 | 30 | 60, label: n }))} />
          </Row>
          <Row icon={Icon.rotate()} label="Бекапы" hint="Откат раунда при сбое или по просьбе">
            <Toggle on={s.backups} disabled={ro} onChange={(v) => patch({ backups: v })} />
          </Row>
          <Row icon={Icon.layers()} label="Овертаймы">
            <Toggle on={s.overtime} disabled={ro} onChange={(v) => patch({ overtime: v })} />
          </Row>
          <Row icon={Icon.money()} label="Начальные деньги">
            <Slider value={s.start_money} min={0} max={16000} step={100} prefix="$" disabled={ro} onChange={(v) => patch({ start_money: v })} />
          </Row>
          <Row icon={Icon.money()} label="Макс. деньги">
            <Slider value={s.max_money} min={800} max={60000} step={100} prefix="$" disabled={ro} onChange={(v) => patch({ max_money: v })} />
          </Row>
          {s.overtime && (
            <Row icon={Icon.money()} label="Деньги на овертайме">
              <Slider value={s.ot_money} min={0} max={60000} step={100} prefix="$" disabled={ro} onChange={(v) => patch({ ot_money: v })} />
            </Row>
          )}
          <Row icon={Icon.shield()} label="Броня">
            <Choice value={s.armor} disabled={ro} onChange={(v) => patch({ armor: v })} options={ARMOR} />
          </Row>
          <Row icon={Icon.skull()} label="Только в голову">
            <Toggle on={s.headshot_only} disabled={ro} onChange={(v) => patch({ headshot_only: v })} />
          </Row>
        </Section>

        <Section title="Время и паузы">
          <Row icon={Icon.pause()} label="Количество пауз">
            <Slider value={s.timeouts} min={0} max={10} disabled={ro} onChange={(v) => patch({ timeouts: v })} />
          </Row>
          <Row icon={Icon.clock()} label="Длительность паузы, с">
            <Slider value={s.timeout_seconds} min={10} max={120} disabled={ro} onChange={(v) => patch({ timeout_seconds: v })} />
          </Row>
          <Row icon={Icon.clock()} label="Фризтайм, с">
            <Slider value={s.freezetime} min={0} max={30} disabled={ro} onChange={(v) => patch({ freezetime: v })} />
          </Row>
        </Section>

        <Section title="Модификаторы">
          <Row icon={Icon.radar()} label="Отключить радар">
            <Toggle on={s.disable_radar} disabled={ro} onChange={(v) => patch({ disable_radar: v })} />
          </Row>
          <Row icon={Icon.flask()} label="Низкая гравитация">
            <Toggle on={s.low_gravity} disabled={ro} onChange={(v) => patch({ low_gravity: v })} />
          </Row>
          <Row icon={Icon.flask()} label="Бесконечные патроны">
            <Toggle on={s.infinite_ammo} disabled={ro} onChange={(v) => patch({ infinite_ammo: v })} />
          </Row>
          <Row icon={Icon.flask()} label="Без гранат" hint="Гранаты нельзя купить">
            <Toggle on={s.no_grenades} disabled={ro} onChange={(v) => patch({ no_grenades: v })} />
          </Row>
          <Row icon={Icon.flask()} label="Автобхоп">
            <Toggle on={s.autobhop} disabled={ro} onChange={(v) => patch({ autobhop: v })} />
          </Row>
        </Section>

        <Section title="Боты">
          <Row icon={Icon.bot()} label="Сложность ботов" hint="Боты добавляются в пустые слоты команд">
            <Choice value={s.bot_difficulty} disabled={ro} onChange={(v) => patch({ bot_difficulty: v })} options={BOT_DIFFICULTY.map((l, i) => ({ value: i as 0 | 1 | 2 | 3, label: l }))} />
          </Row>
        </Section>
      </div>
    </Sheet>
  );
}

/** Сетка карт с поиском и картами из мастерской по ссылке */
function MapGrid({ s, ro, patch, maps, images }: { s: LobbySettings; ro: boolean; patch: Patch; maps: MapOption[]; images: Record<string, string> }) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [extra, setExtra] = useState<MapOption[]>([]);
  const [pending, start] = useTransition();
  const all = useMemo(() => {
    const seen = new Map<string, MapOption>();
    for (const m of [...maps, ...extra, ...s.maps.map((id) => ({ id }))]) if (!seen.has(m.id)) seen.set(m.id, m);
    return [...seen.values()];
  }, [maps, extra, s.maps]);
  const looksLikeWorkshop = /\d{6,}/.test(q);
  const list = q && !looksLikeWorkshop ? all.filter((m) => m.id.toLowerCase().includes(q.toLowerCase()) || mapLabel(m.id).toLowerCase().includes(q.toLowerCase())) : all;

  const toggle = (id: string) => {
    if (ro) return;
    const has = s.maps.includes(id);
    if (s.map_choice === "host" && s.best_of === 1) return patch({ maps: [id] });
    if (has) {
      if (s.maps.length === 1) return;
      return patch({ maps: s.maps.filter((m) => m !== id) });
    }
    if (s.map_choice === "host" && s.maps.length >= s.best_of) return toast.info(`Для BO${s.best_of} — ровно ${s.best_of} карт. Сначала уберите лишнюю.`);
    patch({ maps: [...s.maps, id] });
  };

  const addWorkshop = () =>
    start(async () => {
      const r = await lookupWorkshop(q);
      if (r.error || !r.map) return void toast.error(r.error ?? "Карта не найдена");
      setExtra((x) => [...x, { id: r.map!, image: r.image }]);
      setQ("");
      if (!s.maps.includes(r.map)) toggle(r.map);
      toast.success(`Добавлена ${r.title}. Перед первой игрой сервер её скачает — это займёт пару минут.`);
    });

  return (
    <div className="pt-2">
      {!ro && (
        <div className="mb-3 flex gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && looksLikeWorkshop && addWorkshop()}
            placeholder="Название карты или ссылка на мастерскую"
            className="h-11 min-w-0 flex-1 rounded-[8px] border border-white/[0.1] bg-surface-3 px-3 text-[14px] text-fg outline-none focus:border-accent/50"
          />
          {looksLikeWorkshop ? (
            <button type="button" disabled={pending} onClick={addWorkshop} className={btnClass("secondary", "md")}>
              {pending ? "Ищем…" : "Мастерская +"}
            </button>
          ) : (
            q && (
              <button type="button" onClick={() => setQ("")} className={btnClass("ghost", "md")} aria-label="Очистить">
                {Icon.x("size-4")}
              </button>
            )
          )}
        </div>
      )}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {list.map((m) => {
          const idx = s.maps.indexOf(m.id);
          const on = idx >= 0;
          return (
            <button key={m.id} type="button" onClick={() => toggle(m.id)} disabled={ro} className={cn("group text-left disabled:cursor-default", !on && ro && "opacity-40")}>
              <MapThumb
                map={m.id}
                image={m.image ?? images[m.id]}
                className={cn("h-[78px] rounded-[8px] border transition-all", on ? "border-accent ring-1 ring-accent" : "border-white/[0.06] group-hover:border-white/25")}
              >
                <span className="absolute bottom-1.5 left-1.5 rounded-[4px] bg-black/60 px-1.5 py-0.5 text-[12px] font-medium text-fg">{mapLabel(m.id)}</span>
                {on && s.map_choice === "host" && s.best_of > 1 && (
                  <span className="num absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-[11px] font-bold text-accent-ink">{idx + 1}</span>
                )}
                {m.id.includes("@") && <span className="absolute left-1.5 top-1.5 rounded-[4px] bg-black/60 px-1 text-[10px] text-fg-2">мастерская</span>}
              </MapThumb>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Templates({ s, patch, templates, onChange }: { s: LobbySettings; patch: Patch; templates: Template[]; onChange: () => void }) {
  const toast = useToast();
  const [name, setName] = useState("");
  const [pending, start] = useTransition();
  return (
    <div className="rounded-[12px] bg-gradient-to-r from-accent/[0.12] to-warm/[0.1] p-4">
      <div className="mb-3 text-[13px] font-medium text-fg-2">Шаблоны настроек</div>
      <div className="flex flex-wrap gap-2">
        {PRESETS.map((p) => (
          <button key={p.key} type="button" title={p.text} onClick={() => patch(p.settings)} className={btnClass("secondary", "sm")}>
            {p.name}
          </button>
        ))}
        {templates.map((t) => (
          <span key={t.id} className="inline-flex items-center rounded-[7px] border border-accent/30 bg-accent/[0.08]">
            <button type="button" onClick={() => patch(t.settings)} className="h-9 px-3 text-[13px] font-semibold text-fg">
              {t.name}
            </button>
            <button
              type="button"
              aria-label="Удалить шаблон"
              onClick={() => start(async () => void (await deleteTemplate(t.id), onChange()))}
              className="h-9 pr-2.5 text-fg-3 hover:text-danger"
            >
              {Icon.x("size-3.5")}
            </button>
          </span>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Сохранить текущие как…"
          maxLength={40}
          className="h-9 min-w-0 flex-1 rounded-[7px] border border-white/[0.1] bg-surface-3 px-3 text-[13px] text-fg outline-none"
        />
        <button
          type="button"
          disabled={pending || name.trim().length < 2}
          onClick={() =>
            start(async () => {
              const r = await saveTemplate(name, s);
              if (r?.error) return void toast.error(r.error);
              setName("");
              toast.success("Шаблон сохранён");
              onChange();
            })
          }
          className={btnClass("primary", "sm")}
        >
          Сохранить
        </button>
      </div>
    </div>
  );
}
