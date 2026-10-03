import type { Metadata } from "next";
import type { ReactNode } from "react";
import {
  ArrowRight,
  Bell,
  Bot,
  CalendarDays,
  Check,
  Crosshair,
  Ellipsis,
  ExternalLink,
  Gamepad2,
  Lock,
  Medal,
  Plus,
  Search,
  Server,
  Settings,
  Shield,
  Swords,
  Timer as TimerIcon,
  Trophy,
  TriangleAlert,
  Users,
} from "lucide-react";
import { requireAdmin } from "@/lib/auth";
import {
  Button,
  Callout,
  CriticalSurface,
  DataRow,
  EmptyState,
  Eyebrow,
  Facts,
  FaceitLevel,
  FeatureSurface,
  IconButton,
  InteractivePanel,
  Knife,
  Label,
  MapSheet,
  Meta,
  PageTitle,
  Panel,
  PlayerIdentity,
  Region,
  RowList,
  Score,
  Section,
  SectionTitle,
  SkeletonRows,
  Stack,
  Status,
  SteamMark,
  Steps,
  SubsectionTitle,
  TeamIdentity,
  lobbyStatus,
  matchStatus,
  registrationStatus,
  tournamentStatus,
  type LobbyPhase,
  type StepState,
} from "@/components/ds";
import type { MatchStatus, RegistrationStatus, TournamentStatus } from "@/lib/types";
import { MatchListRow } from "@/components/match-row";
import { ActivityDemo, ParticipationDemo, RegistrationDemo, ButtonStatesDemo, FieldsDemo, OverlaysDemo, TimerDemo } from "./demos";

export const metadata: Metadata = { title: "Дизайн-система — F16 Control" };

const COLORS: { group: string; items: { token: string; hex: string; role: string }[] }[] = [
  {
    group: "Поверхности",
    items: [
      { token: "bg", hex: "#080B10", role: "Canvas — фон страницы" },
      { token: "shell", hex: "#0B0F15", role: "Шапка, подвал, поля ввода" },
      { token: "section", hex: "#0E131B", role: "Фон области страницы (Region)" },
      { token: "surface", hex: "#121925", role: "Объект: матч, команда, панель" },
      { token: "surface-2", hex: "#17202E", role: "Наведение на объект" },
      { token: "elevated", hex: "#1B2533", role: "Поднятое: диалог, панель настроек" },
      { token: "surface-4", hex: "#222D3D", role: "Меню, тултип" },
    ],
  },
  {
    group: "Текст и рамки",
    items: [
      { token: "fg", hex: "#F4F7FB", role: "Основной текст" },
      { token: "fg-2", hex: "#AEB8C7", role: "Второстепенный текст" },
      { token: "fg-3", hex: "#758194", role: "Приглушённый: подписи, мета" },
      { token: "fg-4", hex: "#4A5566", role: "Только неактивное и декор" },
      { token: "line-subtle", hex: "rgba(255,255,255,.06)", role: "Разделители строк" },
      { token: "line", hex: "rgba(255,255,255,.10)", role: "Обычная рамка" },
      { token: "line-strong", hex: "rgba(255,255,255,.17)", role: "Наведение, активная рамка" },
    ],
  },
  {
    group: "Акцент и смысл",
    items: [
      { token: "accent", hex: "#6EA8FF", role: "Действие и выбранное. Только там" },
      { token: "accent-strong", hex: "#8BBAFF", role: "Наведение на действие" },
      { token: "ok", hex: "#58C99B", role: "Готово, одобрено, победа" },
      { token: "warn", hex: "#E7B45F", role: "Ждёт, скоро, внимание" },
      { token: "danger / live", hex: "#FF5B64", role: "Ошибка, отказ · LIVE" },
      { token: "warm", hex: "#FF8A43", role: "Только знак бренда" },
    ],
  },
];

const SPACING = [
  { px: 4, use: "внутри мелкого элемента" },
  { px: 8, use: "иконка и подпись" },
  { px: 12, use: "связанные элементы" },
  { px: 16, use: "поля внутри объекта" },
  { px: 24, use: "группы в разделе" },
  { px: 32, use: "крупные группы" },
  { px: 48, use: "между разделами (телефон)" },
  { px: 64, use: "между разделами (десктоп)" },
  { px: 96, use: "крупные области страницы" },
];

const RADII = [
  { name: "tiny", px: 4, use: "флажок, мелкий контрол" },
  { name: "chip", px: 6, use: "статус, чип" },
  { name: "control", px: 8, use: "кнопка, поле" },
  { name: "popover", px: 10, use: "меню, поповер" },
  { name: "surface", px: 12, use: "объект, список" },
  { name: "feature", px: 16, use: "главный объект, диалог" },
];

function Swatch({ token, hex, role }: { token: string; hex: string; role: string }) {

  return (
    <div className="flex items-center gap-3">
      <span className="size-10 shrink-0 rounded-control border border-line" style={{ background: hex }} />
      <div className="min-w-0">
        <div className="text-[14px] font-medium text-fg">{token}</div>
        <div className="num text-micro text-fg-3">{hex}</div>
        <div className="text-meta text-fg-3">{role}</div>
      </div>
    </div>
  );
}

function Demo({ title, children, note }: { title: string; children: ReactNode; note?: ReactNode }) {
  return (
    <div>
      <SubsectionTitle>{title}</SubsectionTitle>
      {note && <p className="-mt-1 mb-3 text-meta text-fg-3">{note}</p>}
      {children}
    </div>
  );
}

const TOURNAMENT_STATES = Object.keys(tournamentStatus) as TournamentStatus[];
const MATCH_STATES: { s: MatchStatus; server?: boolean; review?: boolean }[] = [
  { s: "pending" },
  { s: "upcoming" },
  { s: "veto" },
  { s: "ready" },
  { s: "ready", server: true },
  { s: "live" },
  { s: "finished" },
  { s: "finished", review: true },
  { s: "cancelled" },
];
const REG_STATES = Object.keys(registrationStatus) as RegistrationStatus[];
const LOBBY_STATES = Object.keys(lobbyStatus) as LobbyPhase[];

const MATCH_PATH = ["Расписание", "Вето", "Сервер", "Live", "Итог"];
const pathFor = (current: number): { title: string; state: StepState }[] =>
  MATCH_PATH.map((title, i) => ({ title, state: i < current ? "done" : i === current ? "current" : "todo" }));

const STATE_MATRIX = [
  {
    flow: "Команда",
    rows: [
      ["Нет команды", "Игрок", "Создать команду или найти существующую"],
      ["Состав неполный", "Капитан", "Пригласить игроков / перевести в основу"],
      ["Состав готов", "Капитан", "Выбрать турнир и подать заявку"],
      ["Roster locked", "Все", "Показать причину блокировки; изменения недоступны"],
    ],
  },
  {
    flow: "Турнир",
    rows: [
      ["Гость", "Гость", "Войти через Steam"],
      ["Нет команды", "Игрок", "Создать / найти команду"],
      ["Состав неполный", "Капитан", "Дособрать основу"],
      ["Команда готова", "Капитан", "Подать заявку"],
      ["Pending", "Организатор", "Игрок ждёт решения"],
      ["Approved", "Капитан", "Ждать окно check-in"],
      ["Rejected", "Капитан", "Причина + исправить, если регистрация открыта"],
      ["Check-in открыт", "Капитан", "Подтвердить участие"],
      ["Checked-in", "Все", "Ждать сетку / первый матч"],
      ["Live", "Все", "Сетка и текущие матчи"],
      ["Finished", "Все", "Итоги и статистика"],
    ],
  },
  {
    flow: "Матч",
    rows: [
      ["Pending", "Все", "Ждать определения команд"],
      ["Upcoming", "Все", "Расписание / ожидание вето"],
      ["Veto", "Капитан текущей команды", "Выбрать карту до дедлайна"],
      ["Server ready", "Игроки матча", "Подключиться"],
      ["Live", "Все", "Счёт, раунды, статистика"],
      ["Finished", "Все", "Итог серии / следующий матч"],
      ["Cancelled", "Все", "Понятная причина без активного CTA"],
    ],
  },
  {
    flow: "Лобби",
    rows: [
      ["Waiting", "Хост / игроки", "Собрать команды и настроить матч"],
      ["Draft", "Текущий капитан", "Выбрать игрока"],
      ["Ready check", "Игроки команд", "Подтвердить готовность"],
      ["Veto", "Текущий капитан", "Выбрать карту"],
      ["Server", "Игроки", "Дождаться адреса / подключиться"],
      ["Live", "Все", "Счёт / GOTV / сервер"],
      ["Finished", "Хост", "Рематч или завершение"],
      ["Closed", "Все", "Вернуться к списку лобби"],
    ],
  },
] as const;

export default async function DesignSystemPage() {
  await requireAdmin("/admin/design-system");
  return (
    <div className="ds-public min-h-screen rounded-feature p-4 text-fg sm:p-6 lg:p-10">
      <div className="mx-auto max-w-product">
        <header className="mb-12 border-b border-line-subtle pb-8">
          <Eyebrow tone="accent">F16 DS</Eyebrow>
          <PageTitle className="mt-2">Дизайн-система</PageTitle>
          <p className="mt-3 max-w-read text-[15px] leading-relaxed text-fg-2">
            Контрольная точка публичной части: новые экраны собираются только из этих частей (<code className="num text-fg">@/components/ds</code>). Если на экране нужно
            что-то, чего здесь нет, — сначала добавляем сюда.
          </p>
        </header>

        <Stack>
          {/* ───────── основы */}
          <Section title="Цвета" description="Значения хранятся токенами в globals.css. HEX в компонентах не пишем.">
            <div className="grid gap-10 lg:grid-cols-3">
              {COLORS.map((g) => (
                <div key={g.group}>
                  <Label className="mb-4 block">{g.group}</Label>
                  <div className="space-y-4">
                    {g.items.map((c) => (
                      <Swatch key={c.token} {...c} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Типографика" description="Onest — интерфейс. JetBrains Mono (.num) — только цифры и машинные данные.">
            <div className="divide-y divide-line-subtle">
              {[
                ["text-display", "Маркетинговый заголовок", "Только главная"],
                ["text-page", "Название страницы", "PageTitle, одно на страницу"],
                ["text-heading", "Формат турнира", "SectionTitle — обычный регистр"],
                ["text-title", "Заголовок объекта", "SubsectionTitle, карточка, диалог"],
                ["text-body", "Основной текст интерфейса и описаний.", "15px / 1.55"],
                ["text-meta", "10 октября · 11:00 · 12/16 команд", "Label, Meta"],
              ].map(([cls, sample, note]) => (
                <div key={cls} className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:items-baseline">
                  <div>
                    <div className="num text-meta text-fg-2">{cls}</div>
                    <div className="text-micro text-fg-3">{note}</div>
                  </div>
                  <div className={`${cls} text-fg`}>{sample}</div>
                </div>
              ))}
              <div className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:items-baseline">
                <div>
                  <div className="num text-meta text-fg-2">Eyebrow</div>
                  <div className="text-micro text-fg-3">служебная метка, не заголовок</div>
                </div>
                <div className="flex gap-4">
                  <Eyebrow tone="live">Live</Eyebrow>
                  <Eyebrow>Карта 2</Eyebrow>
                  <Eyebrow>Сервер</Eyebrow>
                  <Eyebrow>Раунд 16</Eyebrow>
                </div>
              </div>
              <div className="grid gap-2 py-4 sm:grid-cols-[180px_1fr] sm:items-baseline">
                <div>
                  <div className="num text-meta text-fg-2">.num</div>
                  <div className="text-micro text-fg-3">цифры и машинные данные</div>
                </div>
                <div className="num flex flex-wrap gap-6 text-[15px] text-fg">
                  <span>13:9</span>
                  <span>1854 ELO</span>
                  <span>00:12:42</span>
                  <span>192.168.0.159:27015</span>
                  <span>16/32</span>
                </div>
              </div>
            </div>
          </Section>

          <Section title="Отступы и радиусы" description="Расстояние между разделами всегда заметно больше, чем внутри раздела.">
            <div className="grid gap-10 lg:grid-cols-2">
              <div className="space-y-2.5">
                {SPACING.map((s) => (
                  <div key={s.px} className="flex items-center gap-4">
                    <span className="num w-8 text-right text-meta text-fg-2">{s.px}</span>
                    <span className="h-3 rounded-tiny bg-accent/60" style={{ width: s.px * 2 }} />
                    <span className="text-meta text-fg-3">{s.use}</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                {RADII.map((r) => (
                  <div key={r.name} className="flex flex-col items-start gap-2">
                    <span className="h-14 w-full border border-line-strong bg-surface" style={{ borderRadius: r.px }} />
                    <span className="text-meta text-fg">
                      rounded-{r.name} <span className="num text-fg-3">{r.px}</span>
                    </span>
                    <span className="text-micro text-fg-3">{r.use}</span>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          <Section title="Иконки" description="lucide-react, толщина 1.75 для всех, размер классом: size-4 · size-5 · size-6. Свои — только для игровых сущностей.">
            <div className="flex flex-wrap gap-5 text-fg-2">
              {[Trophy, Swords, Users, Server, Bell, Search, Settings, Shield, Lock, CalendarDays, TimerIcon, Crosshair, Gamepad2, Medal, Bot, TriangleAlert, Check, Plus, Ellipsis, ArrowRight, ExternalLink].map((I, i) => (
                <I key={i} className="size-5" />
              ))}
              <span className="mx-2 w-px self-stretch bg-line" />
              <Knife className="size-5 text-fg" />
              <MapSheet className="size-5 text-fg" />
              <SteamMark className="size-5 text-fg" />
            </div>
          </Section>

          {/* ───────── компоненты */}
          <Section title="Кнопки" description="Одна главная кнопка на область. Опасное — danger и подтверждение.">
            <div className="space-y-6">
              {(["primary", "secondary", "ghost", "danger", "quiet"] as const).map((v) => (
                <div key={v} className="flex flex-wrap items-center gap-3">
                  <span className="num w-24 text-meta text-fg-3">{v}</span>
                  <Button variant={v} size="sm">
                    Маленькая
                  </Button>
                  <Button variant={v}>Обычная</Button>
                  <Button variant={v} size="lg" iconRight={v === "quiet" ? <ArrowRight /> : undefined}>
                    {v === "primary" ? "Подать заявку" : v === "danger" ? "Покинуть команду" : "Большая"}
                  </Button>
                </div>
              ))}
              <div className="flex flex-wrap items-center gap-3">
                <span className="num w-24 text-meta text-fg-3">icon</span>
                <Button icon={<Plus />}>Создать лобби</Button>
                <Button variant="secondary" icon={<SteamMark />}>
                  Войти через Steam
                </Button>
                <IconButton label="Настройки">
                  <Settings />
                </IconButton>
                <IconButton label="Ещё" variant="secondary">
                  <Ellipsis />
                </IconButton>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <span className="num w-24 text-meta text-fg-3">states</span>
                <ButtonStatesDemo />
              </div>
            </div>
          </Section>

          <Section title="Поля ввода" description="Ошибка поля — под полем, а не тостом. Проверка на сервере при отправке остаётся главной.">
            <FieldsDemo />
          </Section>

          <Section title="Статусы" description="Подпись есть всегда — цвет не единственный носитель смысла. Пульсирует только то, что идёт сейчас.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo title="Турнир">
                <div className="flex flex-wrap gap-2">
                  {TOURNAMENT_STATES.map((s) => (
                    <Status key={s} info={tournamentStatus[s]} />
                  ))}
                </div>
              </Demo>
              <Demo title="Матч">
                <div className="flex flex-wrap gap-2">
                  {MATCH_STATES.map((m, i) => (
                    <Status key={i} info={matchStatus(m.s, m.server, m.review)} />
                  ))}
                </div>
              </Demo>
              <Demo title="Заявка">
                <div className="flex flex-wrap gap-2">
                  {REG_STATES.map((s) => (
                    <Status key={s} info={registrationStatus[s]} />
                  ))}
                </div>
              </Demo>
              <Demo title="Лобби">
                <div className="flex flex-wrap gap-2">
                  {LOBBY_STATES.map((s) => (
                    <Status key={s} info={lobbyStatus[s]} />
                  ))}
                </div>
              </Demo>
            </div>
          </Section>

          <Section title="Поверхности" description="Объект ≠ раздел. Рамка — только у объекта. Раздел — заголовок, отступ и содержимое.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo title="Section — раздел без рамки" note="Так оформляются «О турнире», «Формат», «Требования».">
                <div>
                  <SectionTitle as="h3" description="Как будет проходить соревнование">
                    Формат турнира
                  </SectionTitle>
                  <Facts
                    columns={3}
                    items={[
                      { label: "Режим", value: "5 на 5" },
                      { label: "Сетка", value: "Double Elimination" },
                      { label: "Серии", value: "BO1 → BO3" },
                    ]}
                  />
                </div>
              </Demo>
              <Demo title="Panel — объект" note="Матч, команда, сервер, уведомление.">
                <Panel>
                  <div className="flex items-center justify-between gap-4">
                    <TeamIdentity name="Next Level" tag="NEXT" meta="Казахстан · 5/5" />
                    <Status info={registrationStatus.approved} size="sm" />
                  </div>
                </Panel>
              </Demo>
              <Demo title="InteractivePanel — объект-ссылка" note="При наведении поднимается фон, карточка не «летит».">
                <InteractivePanel href="/admin/design-system">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="text-title">F16 Open #01</div>
                      <Meta>5×5 · Double Elimination · 10 октября</Meta>
                    </div>
                    <ArrowRight className="size-5 text-fg-3 transition-transform group-hover:translate-x-0.5" />
                  </div>
                </InteractivePanel>
              </Demo>
              <Demo title="FeatureSurface — главный объект экрана" note="Состояние матча, сервер готов.">
                <FeatureSurface>
                  <Eyebrow tone="live">Live · Карта 1/3 · Mirage</Eyebrow>
                  <div className="mt-3 flex items-center justify-between gap-4">
                    <span className="text-title">Next Level</span>
                    <Score a={8} b={7} size="lg" />
                    <span className="text-title">F16 Wolves</span>
                  </div>
                </FeatureSurface>
              </Demo>
              <Demo title="CriticalSurface — нужно действие сейчас">
                <div className="space-y-3">
                  <CriticalSurface tone="accent">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <div className="font-semibold">Ваш ход: забаньте карту</div>
                        <Meta>Вето BO3 · осталось 24 с</Meta>
                      </div>
                      <Button size="sm">К вето</Button>
                    </div>
                  </CriticalSurface>
                  <CriticalSurface tone="ok">
                    <div className="font-semibold">Сервер готов — подключайтесь</div>
                  </CriticalSurface>
                  <CriticalSurface tone="danger">
                    <div className="font-semibold">Сервер не запустился</div>
                    <Meta>Админы уже знают, пробуем другой сервер.</Meta>
                  </CriticalSurface>
                </div>
              </Demo>
              <Demo title="Region — область страницы" note="Фон во всю ширину отделяет крупные части страницы.">
                <div className="overflow-hidden rounded-surface border border-line-subtle">
                  <div className="bg-bg p-4 text-meta text-fg-3">canvas</div>
                  <Region className="!py-6 px-4">
                    <span className="text-meta text-fg-2">section region</span>
                  </Region>
                  <div className="bg-bg p-4 text-meta text-fg-3">canvas</div>
                </div>
              </Demo>
            </div>
          </Section>

          <Section title="Строка матча" description="MatchListRow — одна для списков матчей, «Моей игры», команды и турнира. Длинные названия обрезаются, статус на телефоне скрыт.">
            <RowList className="max-w-3xl">
              {SAMPLE_MATCHES.map((s, i) => (
                <MatchListRow key={i} m={s.m} meta={s.meta} highlight={s.m.team1_id} />
              ))}
            </RowList>
          </Section>

          <Section title="Строки" description="Списки — строками с разделителями, а не стопкой карточек.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo title="Состав">
                <RowList>
                  <DataRow title={<PlayerIdentity name="padash00" captain meta="1854 ELO · капитан" />} trailing={<FaceitLevel level={9} />} />
                  <DataRow title={<PlayerIdentity name="ALTX_F4" meta="2118 ELO" />} trailing={<FaceitLevel level={10} />} />
                  <DataRow title={<PlayerIdentity name="Bot Victor" bot meta="Эксперт" />} />
                  <div className="flex min-h-14 items-center gap-3 px-4 text-fg-3">
                    <span className="grid size-8 place-items-center rounded-full border border-dashed border-line">
                      <Plus className="size-4" />
                    </span>
                    <span className="text-[14px]">Занять место</span>
                  </div>
                </RowList>
              </Demo>
              <Demo title="Матчи">
                <RowList>
                  <DataRow href="/admin/design-system" title="Next Level — F16 Wolves" meta="Верхняя сетка · раунд 2 · BO3" trailing={<><Score a={8} b={7} size="sm" /><Status info={matchStatus("live")} size="sm" /></>} />
                  <DataRow href="/admin/design-system" title="Aurora — Pulse" meta="Сегодня, 13:40" trailing={<Status info={matchStatus("upcoming")} size="sm" />} />
                  <DataRow href="/admin/design-system" title="Next Level — Pulse" meta="Вчера" trailing={<><Score a={2} b={1} winner={1} size="sm" /><Status info={matchStatus("finished")} size="sm" /></>} />
                </RowList>
              </Demo>
            </div>
          </Section>

          <Section title="Обратная связь" description="Пустое состояние объясняет, почему пусто и что делать. Загрузка — скелетоном. Ошибка — в своём блоке.">
            <div className="grid gap-8 lg:grid-cols-2">
              <Demo title="Пустое состояние">
                <EmptyState icon={<Swords />} title="Матчей пока нет" text="Сетка будет опубликована после check-in." next="10 октября, 11:00" action={<Button variant="secondary" size="sm">Правила турнира</Button>} />
              </Demo>
              <Demo title="Загрузка">
                <SkeletonRows rows={3} />
              </Demo>
              <Demo title="Сообщения в контексте">
                <div className="space-y-3">
                  <Callout title="Заявка отправлена">Администратор рассмотрит её до начала check-in.</Callout>
                  <Callout tone="ok" title="Check-in пройден">Сетку опубликуют после закрытия check-in — мы сообщим о сопернике.</Callout>
                  <Callout tone="warn" title="Не хватает игрока">В составе 4 из 5 — пригласите ещё одного.</Callout>
                  <Callout tone="danger" title="Заявку нужно исправить" action={<Button size="sm" variant="secondary">Исправить состав</Button>}>
                    Игрок ALTX_F4 уже заявлен за другую команду.
                  </Callout>
                </div>
              </Demo>
              <Demo title="Процесс по шагам">
                <Steps
                  steps={[
                    { title: "Команда", meta: "Next Level", state: "done" },
                    { title: "Состав", meta: "Основа 5/5 · запас 1/2", state: "current" },
                    { title: "Подтверждение", state: "todo" },
                  ]}
                />
              </Demo>
              <Demo title="Таймер" note="Обратный отсчёт виден крупно; красный — когда времени мало.">
                <TimerDemo />
              </Demo>
            </div>
          </Section>

          <Section title="Всплывающие слои" description="Одна основа: портал, затемнение, Esc, фокус внутри и возврат. Тень — только здесь.">
            <OverlaysDemo />
          </Section>

          {/* ───────── состояния продукта */}
          <Section
            title="Глобальная активность"
            description="В шапке — только одно самое срочное действие (приоритет по времени на действие). Пассивное — в «Моей игре» и уведомлениях. Нет действия — места не занимает."
          >
            <ActivityDemo />
          </Section>

          <Section title="Состояния матча" description="Путь матча меняет главный блок комнаты — пользователь не переходит на другие страницы.">
            <div className="space-y-6">
              {[
                ["Скоро", 0],
                ["Вето", 1],
                ["Сервер", 2],
                ["Live", 3],
                ["Итог", 4],
              ].map(([label, i]) => (
                <div key={label as string} className="grid items-center gap-3 sm:grid-cols-[120px_1fr]">
                  <span className="text-meta text-fg-3">{label}</span>
                  <Steps direction="horizontal" steps={pathFor(i as number)} />
                </div>
              ))}
            </div>
          </Section>

          <Section title="Участие в турнире" description="ParticipationPanel — живой компонент страницы турнира: статус участника отдельно от статуса турнира, одно главное действие.">
            <ParticipationDemo />
          </Section>
          <Section title="Регистрация и check-in" description="Состав выбирает капитан; check-in — одна задача с окном, проверками и действием только для капитана. Отсчёт не озвучивается, смена состояния — один раз.">
            <RegistrationDemo />
          </Section>

          <Section
            title="State matrix"
            description="QA-контракт: в каждом состоянии интерфейс отвечает «что происходит, кто действует и что дальше». Это не backend state machine, а проверка представления."
          >
            <div className="grid gap-6 lg:grid-cols-2">
              {STATE_MATRIX.map((group) => (
                <div key={group.flow}>
                  <SubsectionTitle>{group.flow}</SubsectionTitle>
                  <RowList>
                    {group.rows.map(([state, actor, next]) => (
                      <DataRow
                        key={state}
                        title={state}
                        meta={next}
                        trailing={<span className="max-w-40 text-right text-meta text-fg-3">{actor}</span>}
                      />
                    ))}
                  </RowList>
                </div>
              ))}
            </div>
          </Section>

          <Section title="Лобби: слоты" description="Человек, бот и пустое место различаются с первого взгляда, не только цветом.">
            <RowList className="max-w-md">
              <DataRow title={<PlayerIdentity name="padash00" captain meta="Хост · 1854 ELO" />} trailing={<span className="text-meta font-medium text-ok">Готов</span>} />
              <DataRow title={<PlayerIdentity name="ALTX_F4" meta="2118 ELO" />} trailing={<span className="text-meta text-warn">Ждём…</span>} />
              <DataRow title={<PlayerIdentity name="Bot Victor" bot meta="Эксперт" />} />
              <div className="flex min-h-14 items-center gap-3 px-4 text-fg-3">
                <span className="grid size-8 place-items-center rounded-full border border-dashed border-line">
                  <Plus className="size-4" />
                </span>
                <span className="text-[14px]">Занять место</span>
              </div>
            </RowList>
          </Section>
        </Stack>
      </div>
    </div>
  );
}

const team = (name: string, tag: string) => ({ name, tag, logo_url: null });
const sm = (o: Partial<Parameters<typeof MatchListRow>[0]["m"]>): Parameters<typeof MatchListRow>[0]["m"] => ({
  id: "00000000-0000-0000-0000-000000000000",
  status: "upcoming",
  best_of: 1,
  team1_id: "a",
  team2_id: "b",
  team1_score: 0,
  team2_score: 0,
  winner_id: null,
  server_state: null,
  under_review: false,
  team1: team("Next Level", "NEXT"),
  team2: team("F16 Wolves", "F16W"),
  ...o,
});
const SAMPLE_MATCHES = [
  { m: sm({ status: "live", best_of: 3, team1_score: 1, team2_score: 0 }), meta: "F16 Open #01 · Верхняя сетка · BO3" },
  { m: sm({ team1: team("Очень длинное название команды для проверки обрезки", "LONG"), team2: team("Ещё одна команда с длинным именем", "LNG2") }), meta: "Сегодня, 13:40 · BO1" },
  { m: sm({ status: "pending", team2_id: null, team2: null }), meta: "Ждёт победителя матча #7 · BO1" },
  { m: sm({ status: "ready", server_state: "ready", best_of: 3 }), meta: "F16 Open #01 · Полуфинал · BO3" },
  { m: sm({ status: "finished", team1_score: 2, team2_score: 1, winner_id: "a", best_of: 3 }), meta: "Вчера · BO3" },
  { m: sm({ status: "finished", team1_score: 13, team2_score: 16, winner_id: "b", under_review: true }), meta: "Вчера · BO1" },
];
