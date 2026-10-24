import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  adminAddRosterPlayer,
  adminCheckIn,
  adminRemoveRosterPlayer,
  decideRegistration,
  deleteTournament,
  setSeed,
  setTournamentStatus,
  updateTournament,
} from "@/app/actions/admin";
import { averageElo, getTournamentById, getTournamentRegistrations, type RegistrationWithTeam } from "@/lib/data";
import { formatTime, formatDateTime, formatShortDateTime, registrationStatusLabel, tournamentStatusLabel } from "@/lib/format";
import { FORMATS, type FormatKind } from "@/lib/formats";
import { MODES, type ModeKey } from "@/lib/modes";
import type { MatchWithTeams } from "@/lib/matches";
import type { TournamentStatus } from "@/lib/types";
import { deleteBracketAction, generateBracketAction } from "@/app/actions/admin-match";
import { prefetchMaps, setAutoApprove, setAutopilot } from "@/app/actions/admin-server";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ActionToggle } from "@/components/admin/action-toggle";
import { ChipInput, PlayerPicker, type PickPlayer } from "@/components/pickers";
import { db } from "@/lib/supabase";
import { BTN, BTN_SM, BarCell, CARD } from "@/components/admin/tournament-kit";
import { TournamentStatusChip } from "@/components/primitives";
import { Lifecycle, type LifeStep } from "@/components/admin/kit";
import { MatchStatusBadge, visibleMatches } from "@/components/match-bits";
import { Avatar, EmptyState, FaceitLevel, TeamLogo, cn, buttonClass } from "@/components/ui";
import { AdminHeader, Dot, Panel, SubTabs, TableBox } from "@/components/admin/control";
import { getWorkshopMaps, getDisabledMaps, getMapImages } from "@/lib/settings";
import { workshopInfo } from "@/lib/server-control";
import { TournamentForm } from "../tournament-form";
import { requireAdmin } from "@/lib/auth";
import { tournamentEta } from "@/lib/schedule";
import { getLastDraw } from "@/lib/draw-log";
import { getTournamentNominations, type Nomination } from "@/lib/nominations";
import { getTournamentRecap } from "@/lib/recap";
import { getTournamentDays } from "@/lib/top-players";
import { TopDownloads } from "@/components/top-downloads";
import { clearNomination, setNomination } from "@/app/actions/admin-nominations";
import { drawOrderText } from "@/lib/draw";
import { approveWarningOf, loadOfficial } from "@/lib/official-data";
import { OfficialTab } from "./official-tab";
import { BroadcastPanel } from "@/components/admin/obs-overlay";

export const metadata: Metadata = { title: "Турнир — F16 Control" };

const FLOW: { status: TournamentStatus; hint: string }[] = [
  { status: "draft", hint: "Скрыт от всех" },
  { status: "registration", hint: "Команды подают заявки" },
  { status: "registration_closed", hint: "Составы заблокированы" },
  { status: "checkin", hint: "Капитаны подтверждают участие" },
  { status: "live", hint: "Турнир идёт" },
  { status: "finished", hint: "Турнир завершён" },
  { status: "cancelled", hint: "Турнир отменён" },
];

const TABS = [
  { key: "overview", label: "Обзор" },
  { key: "registration", label: "Регистрация" },
  // только у официального турнира: анкеты участников, документы, выгрузки
  { key: "official", label: "Участники" },
  { key: "bracket", label: "Сетка" },
  { key: "matches", label: "Матчи" },
  { key: "awards", label: "Награды" },
  { key: "settings", label: "Настройки" },
  { key: "rules", label: "Правила" },
  { key: "servers", label: "Серверы" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function AdminTournamentPage(props: PageProps<"/admin/tournaments/[id]">) {
  const admin = await requireAdmin(`/admin/tournaments/${(await props.params).id}`); // права проверяются в каждой странице, не только в layout
  const { id } = await props.params;
  const sp = await props.searchParams;
  const t = await getTournamentById(id);
  if (!t) notFound();
  const tabs = TABS.filter((x) => x.key !== "official" || t.is_official);
  // старые ссылки ?tab=registrations ведут на регистрацию
  const raw = sp.tab === "registrations" ? "registration" : String(sp.tab ?? "overview");
  const tab: TabKey = (tabs.find((x) => x.key === raw)?.key ?? "overview") as TabKey;
  const regs = await getTournamentRegistrations(t.id);

  const pendingRegs = regs.filter((r) => r.status === "pending");
  const approved = regs.filter((r) => r.status === "approved");
  const checkedIn = approved.filter((r) => r.checked_in_at).length;
  const tabHref = (k: string) => (k === "overview" ? `/admin/tournaments/${t.id}` : `/admin/tournaments/${t.id}?tab=${k}`);

  return (
    <div className="space-y-6">
      {/* новые заявки, check-in, счёт матчей — без перезагрузки; на вкладке настроек не мешаем вводу */}
      {/* на вкладке участников — персональные данные: без живого обновления (каждый показ пишется в журнал) */}
      {tab !== "settings" && tab !== "rules" && tab !== "awards" && tab !== "official" && <LiveRefresh watch={`tournament:${t.id}`} intervalMs={4000} />}
      <AdminHeader
        back={{ href: "/admin/tournaments", label: "Турниры" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            <TournamentStatusChip status={t.status} size="sm" />
          </span>
        }
        description={`${MODES[t.format as ModeKey]?.title ?? t.format} · ${FORMATS[t.bracket_type as FormatKind]?.title ?? t.bracket_type} · начало ${formatDateTime(t.starts_at)}`}
        actions={
          <Link href={t.status === "draft" ? `/tournaments/${t.slug}/preview` : `/tournaments/${t.slug}`} className={buttonClass("secondary", "md")}>
            {t.status === "draft" ? "Посмотреть, как увидят игроки ↗" : "Открыть страницу на сайте ↗"}
          </Link>
        }
      />

      <LifecyclePanel t={t} approved={approved.length} checkedIn={checkedIn} pending={pendingRegs.length} eta={await tournamentEta(t.id).catch(() => null)} />

      <SubTabs
        active={tab}
        items={tabs.map((x) => ({
          key: x.key,
          href: tabHref(x.key),
          label:
            x.key === "registration" ? (
              <span>
                Регистрация <span className="num text-fg-3">{regs.length}</span>
                {pendingRegs.length > 0 && <span className="ml-1.5 inline-block size-1.5 rounded-full bg-warn align-middle" />}
              </span>
            ) : (
              x.label
            ),
        }))}
      />

      {tab === "overview" && <OverviewTab t={t} approved={approved.length} checkedIn={checkedIn} pending={pendingRegs.length} />}
      {tab === "registration" && <RegistrationTab t={t} regs={regs} />}
      {tab === "official" && <OfficialTab t={t} admin={admin} />}
      {tab === "bracket" && <BracketTab t={t} approved={approved.length} checkedIn={checkedIn} draw={await getLastDraw(t.id)} />}
      {tab === "matches" && <MatchesTab tournamentId={t.id} />}
      {tab === "awards" && <AwardsTab t={t} regs={approved} />}
      {tab === "settings" && (
        <div className="space-y-8">
          <TournamentForm
            action={updateTournament}
            t={t}
            workshopMaps={await getWorkshopMaps()}
            disabledMaps={await getDisabledMaps()}
            mapImages={await getMapImages()}
          />
          <div id="danger" className="max-w-2xl scroll-mt-8 rounded-surface border border-danger/30 bg-danger-dim/60 p-6">
            <div className="text-[18px] font-bold text-danger">Удалить турнир</div>
            <p className="mt-2 mb-4 text-[15px] leading-relaxed text-fg-2">
              Вместе с турниром удалятся сетка, матчи, заявки и статистика. Вернуть их будет нельзя.
              {t.status !== "draft" && " Матчи на серверах будут завершены. Чтобы подтвердить, впишите название турнира в поле ниже."}
            </p>
            <ActionForm action={deleteTournament} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={t.id} />
              {t.status !== "draft" && (
                <input name="confirm" placeholder={t.name} autoComplete="off" className="field w-72" />
              )}
              <SubmitButton size="md" variant="danger" confirm={`Удалить турнир «${t.name}» безвозвратно?`}>
                Удалить турнир
              </SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}
      {tab === "rules" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Panel title="Регламент" action={<Link href={tabHref("settings")} className={buttonClass("secondary", "sm", BTN)}>Изменить в настройках</Link>}>
            {t.rules ? (
              <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-6 text-[15.5px] text-fg-2 leading-[1.7] whitespace-pre-line">{t.rules}</div>
            ) : (
              <EmptyState compact title="Регламент не заполнен" description="Впишите его во вкладке «Настройки», шаг «Правила матча»." />
            )}
          </Panel>
          <Panel title="Требования к участникам">
            {t.requirements ? (
              <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-6 text-[15.5px] text-fg-2 leading-[1.7] whitespace-pre-line">{t.requirements}</div>
            ) : (
              <EmptyState compact title="Стандартные требования" description="Свои требования можно вписать во вкладке «Настройки», шаг «Правила матча»." />
            )}
          </Panel>
          <Panel title="Правила игры в матче" className="lg:col-span-2">
            <div className={`${CARD} grid grid-cols-2 md:grid-cols-5 divide-x divide-ink/[0.06]`}>
              <BarCell label="Карт в матче" value={`BO${t.default_best_of}`} hint={`в финале BO${t.final_best_of}`} />
              <BarCell label="Выбор сторон" value={t.knife_round ? "Нож" : "Заданы"} />
              <BarCell label="Овертайм" value={t.overtime ? "Есть" : "Нет"} />
              <BarCell label="Тактические паузы" value={t.timeouts_per_team} hint={`по ${t.timeout_seconds} с`} />
              <BarCell label="Технические паузы" value={t.tech_pauses} hint={`по ${Math.round(t.tech_pause_seconds / 60)} мин`} />
            </div>
          </Panel>
        </div>
      )}
      {tab === "servers" && <ServersTab t={t} />}
    </div>
  );
}

// ───────────────────────── Этапы и следующий шаг

/** Этапы турнира; подсказки под этапами берут даты из настроек */
function lifeSteps(t: T): LifeStep[] {
  const day = (iso: string) => new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", timeZone: "Asia/Almaty" }).format(new Date(iso));
  const d = (iso: string | null) => (iso ? `${day(iso)} ${formatTime(iso)}` : null);
  // «2 окт. 15:46–16:31», если окно в один день
  const range = (a: string | null, b: string | null) =>
    a && b && day(a) === day(b) ? `${day(a)} ${formatTime(a)}–${formatTime(b)}` : `${d(a) ?? "…"} — ${d(b) ?? "…"}`;
  return [
    { key: "draft", label: "Черновик", hint: "виден только админам" },
    {
      key: "registration",
      label: "Регистрация",
      hint: t.registration_opens_at || t.registration_closes_at ? range(t.registration_opens_at, t.registration_closes_at) : "игроки подают заявки",
    },
    { key: "closed", label: "Закрыта", hint: "составы зафиксированы" },
    {
      key: "checkin",
      label: "Check-in",
      hint: t.checkin_opens_at || t.checkin_closes_at ? range(t.checkin_opens_at, t.checkin_closes_at) : t.is_lan ? "участники подтверждают, что придут" : "участники подтверждают участие",
    },
    { key: "bracket", label: "Сетка", hint: "из прошедших check-in" },
    { key: "live", label: "Идёт", hint: t.starts_at ? `старт ${d(t.starts_at)}` : "матчи на серверах" },
    { key: "finished", label: "Завершён", hint: "итоги и награды" },
  ];
}

function stepIndex(status: TournamentStatus, hasBracket: boolean) {
  switch (status) {
    case "draft":
      return 0;
    case "registration":
      return 1;
    case "registration_closed":
      return 2;
    case "checkin":
      return hasBracket ? 4 : 3;
    case "live":
      return 5;
    case "finished":
      return 7;
    default:
      return -1;
  }
}

type T = NonNullable<Awaited<ReturnType<typeof getTournamentById>>>;

/** Шапка управления: где турнир сейчас и одна главная кнопка следующего шага */
function LifecyclePanel({
  t,
  approved,
  checkedIn,
  pending,
  eta,
}: {
  t: T;
  approved: number;
  checkedIn: number;
  pending: number;
  eta: Awaited<ReturnType<typeof tournamentEta>>;
}) {
  const hasBracket = !!t.bracket_published_at;
  const status = (to: TournamentStatus, label: string, confirm?: string, variant: "primary" | "danger" = "primary") => (
    <ActionForm action={setTournamentStatus}>
      <input type="hidden" name="id" value={t.id} />
      <input type="hidden" name="status" value={to} />
      <SubmitButton size="lg" variant={variant} confirm={confirm} className="!text-[16px]">
        {label} →
      </SubmitButton>
    </ActionForm>
  );

  let now = "";
  let next = "";
  let hint = "";
  let action: React.ReactNode = null;
  switch (t.status) {
    case "draft":
      now = "Турнир пока скрыт: его видят только администраторы. Игроки не могут на него записаться.";
      next = "Откройте регистрацию";
      hint = "Страница турнира станет доступна всем, а команды смогут подавать заявки. Перед этим загляните во вкладку «Настройки» и проверьте даты и карты.";
      action = status("registration", "Открыть регистрацию");
      break;
    case "registration":
      now = `Игроки подают заявки. Одобрено ${approved} из ${t.max_teams}${pending ? `, ждут вашего решения ${pending}` : ""}.`;
      next = "Закройте регистрацию";
      hint = "Нажмите, когда команды набраны: новые заявки перестанут приниматься, а составы закроются для изменений.";
      action = status("registration_closed", "Закрыть регистрацию", "Закрыть регистрацию? Составы заблокируются.");
      break;
    case "registration_closed":
      now = "Регистрация закрыта, составы зафиксированы.";
      next = "Откройте check-in";
      hint = "Капитаны получат уведомление и подтвердят, что команда придёт. Карты из Workshop начнут скачиваться на сервер.";
      action = status("checkin", "Открыть check-in");
      break;
    case "checkin":
      if (!hasBracket) {
        now = `Идёт подтверждение участия (check-in): подтвердили ${checkedIn} из ${approved} одобренных команд.`;
        next = "Создайте сетку";
        hint = `В сетку попадут только команды, подтвердившие участие (${checkedIn}). Порядок: сначала ваши номера, затем по рейтингу.`;
        action = (
          <ActionForm action={generateBracketAction}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <input type="hidden" name="seeding" value="elo" />
            <input type="hidden" name="onlyCheckedIn" value="on" />
            <SubmitButton size="lg" className="!text-[16px]" confirm={`Создать и опубликовать сетку для ${checkedIn} участников? Посев зафиксируется.`}>
              Создать сетку →
            </SubmitButton>
          </ActionForm>
        );
      } else {
        now = "Сетка опубликована: команды уже видят своих соперников.";
        next = "Запустите турнир";
        hint = t.autopilot
          ? "Автопилот сам начнёт выбор карт и раздаст матчи по свободным серверам."
          : "Автопилот выключен: выбор карт и серверы запускайте вручную во вкладке «Матчи» или включите автопилот на вкладке «Обзор».";
        action = status("live", "Запустить турнир");
      }
      break;
    case "live":
      now = `Турнир идёт: матчи проходят на серверах.${eta?.finishAt ? ` Окончание ≈ в ${formatTime(new Date(eta.finishAt).toISOString())} (карта в среднем ~${eta.mapMinutes} мин).` : ""}`;
      next = "Завершите турнир после финала";
      hint = "Несыгранные матчи отменятся, серверы освободятся, а на сайте появятся итоги и награды.";
      action = status("finished", "Завершить турнир", "Завершить турнир? Несыгранные матчи будут отменены.", "danger");
      break;
    case "finished":
      now = "Турнир завершён.";
      next = "Готово";
      hint = "Итоги, награды и статистика — на публичной странице турнира.";
      break;
    case "cancelled":
      now = "Турнир отменён.";
      next = "—";
      break;
  }

  return (
    <div className={`${CARD} p-5 lg:p-7`}>
      <Lifecycle steps={lifeSteps(t)} current={stepIndex(t.status, hasBracket)} cancelled={t.status === "cancelled"} />
      <div className="mt-6 border-t border-line-subtle pt-5">
        <div className="text-[14px] font-semibold text-fg-3">Где мы сейчас</div>
        <p className="mt-1.5 text-[16px] leading-relaxed text-fg">{now}</p>
      </div>
      {t.status !== "cancelled" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-surface border border-accent/30 bg-accent-dim/60 p-5">
          <div className="min-w-0 flex-1 basis-80">
            <div className="text-[14px] font-bold text-accent">Что делать дальше</div>
            <div className="mt-1 text-[20px] font-bold tracking-[-0.01em] text-fg">{next}</div>
            {hint && <p className="mt-1.5 text-[15px] leading-relaxed text-fg-2">{hint}</p>}
            {t.status === "checkin" && !hasBracket && (
              <Link href={`/admin/tournaments/${t.id}?tab=bracket`} className="mt-2 inline-block text-[15px] font-semibold text-accent hover:underline">
                Жеребьёвка, другой посев или все одобренные →
              </Link>
            )}
          </div>
          {action}
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Обзор

function OverviewTab({ t, approved, checkedIn, pending }: { t: T; approved: number; checkedIn: number; pending: number }) {
  return (
    <div className="space-y-10">
      <div className={`${CARD} grid grid-cols-2 md:grid-cols-4 divide-x divide-ink/[0.06]`}>
        <BarCell label="Команд в турнире" value={`${approved} из ${t.max_teams}`} hint={approved >= t.max_teams ? "все места заняты" : `свободно мест: ${t.max_teams - approved}`} />
        <Link href={`/admin/tournaments/${t.id}?tab=registration`} className="block hover:bg-ink/[0.02] transition">
          <BarCell label="Заявки ждут вашего решения" value={pending} tone={pending ? "warn" : undefined} hint={pending ? "открыть и одобрить →" : "новых заявок нет"} />
        </Link>
        <BarCell label="Подтвердили участие" value={`${checkedIn} из ${approved}`} hint="только они попадут в сетку" />
        <BarCell
          label="Сетка"
          value={t.bracket_published_at ? "Создана" : "Не создана"}
          tone={t.bracket_published_at ? "ok" : undefined}
          hint={t.bracket_published_at ? "смотрите во вкладке «Сетка»" : "создаётся после подтверждения участия"}
        />
      </div>

      <Panel title="Автопилот">
        <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[17px] font-bold text-fg">Автопилот: матчи запускаются сами</div>
            <ul className="mt-2.5 space-y-1.5 text-[15px] text-fg-2 leading-relaxed list-disc pl-5">
              <li>сам начинает выбор карт, как только известны оба соперника;</li>
              <li>отправляет готовые матчи на свободные серверы;</li>
              <li>следит, чтобы команда не играла два матча одновременно.</li>
            </ul>
            <p className="mt-3 text-[14px] text-fg-3">
              {["checkin", "live"].includes(t.status)
                ? "Пока он включён, всё это происходит само."
                : "Заработает, когда турнир дойдёт до подтверждения участия или до начала игр."}
            </p>
          </div>
          <ActionToggle
            action={setAutopilot}
            fields={{ tournamentId: t.id }}
            on={t.autopilot}
            label="Автопилот турнира"
            onLabel="Включён"
            offLabel="Выключен"
          />
        </div>
        <div className="mt-3 rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="max-w-2xl">
            <div className="text-[17px] font-bold text-fg">Принимать заявки автоматически</div>
            <p className="mt-1.5 text-[15px] text-fg-2 leading-relaxed">
              Если у команды полный состав и есть свободные места (всего {t.max_teams}), заявка одобряется сразу, без вашего решения. Отклонить
              её можно потом во вкладке «Регистрация».
            </p>
          </div>
          <ActionToggle
            action={setAutoApprove}
            fields={{ tournamentId: t.id }}
            on={t.auto_approve}
            label="Автоодобрение заявок"
            onLabel="Включено"
            offLabel="Выключено"
          />
        </div>
      </Panel>

      <Panel title="Полезные инструменты">
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-6">
            <div className="text-[17px] font-bold text-fg">Показ на большом экране (ТВ)</div>
            <p className="mt-1.5 text-[15px] text-fg-2 leading-relaxed">Сетка и счёт матчей на телевизоре в клубе. Откройте на компьютере у телевизора и нажмите F11.</p>
            <a href={`/tournaments/${t.slug}/tv`} target="_blank" rel="noreferrer" className={buttonClass("primary", "md", "mt-4")}>
              Открыть для телевизора ↗
            </a>
          </div>
          <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5">
            <div className="text-[17px] font-bold text-fg">Скачать таблицы</div>
            <p className="mt-1.5 text-[15px] text-fg-2 leading-relaxed">Файлы открываются в Excel или Google Таблицах.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {[
                ["results", "Результаты матчей"],
                ["rosters", "Составы"],
                ["stats", "Статистика игроков"],
              ].map(([type, label]) => (
                <a key={type} href={`/admin/tournaments/${t.id}/export?type=${type}`} className={buttonClass("secondary", "md")} download>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-3 rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5">
          <div className="text-[17px] font-bold text-fg">Трансляция в OBS</div>
          <p className="mt-1.5 mb-4 text-[15px] text-fg-2">Ссылки для вставки в OBS: источник «Браузер», размер 1920×1080.</p>
          <BroadcastPanel slug={t.slug} />
        </div>
      </Panel>

      <details className="group">
        <summary className="list-none cursor-pointer text-[14.5px] font-medium text-fg-3 hover:text-fg-2">
          Для особых случаев: переключить этап вручную <span className="group-open:hidden">▾</span>
          <span className="hidden group-open:inline">▴</span>
        </summary>
        <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-2">
          {FLOW.map((f) => (
            <ActionForm key={f.status} action={setTournamentStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={f.status} />
              <button
                type="submit"
                disabled={t.status === f.status}
                className={cn(
                  "w-full h-full text-left rounded-control border px-3.5 py-3 transition",
                  t.status === f.status
                    ? "border-accent/50 bg-accent/[0.08]"
                    : "border-line-subtle bg-surface hover:border-line hover:bg-surface-2",
                  f.status === "cancelled" && t.status !== f.status && "hover:border-danger/40",
                )}
              >
                <div className={cn("text-[14.5px] font-semibold", t.status === f.status ? "text-accent" : "text-fg")}>
                  {tournamentStatusLabel[f.status]}
                </div>
                <div className="mt-0.5 text-[14.5px] text-fg-3 leading-snug">{f.hint}</div>
              </button>
            </ActionForm>
          ))}
        </div>
      </details>
    </div>
  );
}

// ───────────────────────── Сетка

/** Будет ли в сетке матч за 3-е место: Single Elimination (весь турнир или плей-офф) и флаг турнира */
function hasThirdPlaceMatch(t: Pick<T, "bracket_type" | "playoff_type" | "third_place_match">) {
  if (!t.third_place_match) return false;
  if (t.bracket_type === "single_elimination") return true;
  return FORMATS[t.bracket_type as FormatKind]?.playoff === true && t.playoff_type === "single_elimination";
}

function BracketTab({
  t,
  approved,
  checkedIn,
  draw,
}: {
  t: Pick<T, "id" | "slug" | "bracket_published_at" | "bracket_type" | "playoff_type" | "third_place_match">;
  approved: number;
  checkedIn: number;
  draw: Awaited<ReturnType<typeof getLastDraw>>;
}) {
  const elimination = t.bracket_type === "single_elimination" || FORMATS[t.bracket_type as FormatKind]?.playoff;
  const thirdPlaceNote =
    elimination && t.bracket_type !== "double_elimination" ? (
      <div className="text-[14.5px] text-fg-3">
        Матч за 3-е место: {hasThirdPlaceMatch(t) ? "будет сыгран (проигравшие полуфиналов, от 4 команд)" : "не проводится"} — меняется в
        «Настройках».
      </div>
    ) : null;
  const drawInfo = draw ? (
    <div className="rounded-control border border-line-subtle bg-surface-2 px-4 py-3 text-[14.5px] text-fg-2 leading-relaxed">
      <span className="text-fg">Жеребьёвка проведена {formatDateTime(draw.at)}</span>
      {draw.redo && <span className="text-fg-3"> (повторная)</span>}, порядок: {drawOrderText(draw)}
    </div>
  ) : null;
  const checkedInBox = (
    <label className="flex items-center gap-2.5 text-[15px] text-fg-2">
      <input type="checkbox" name="onlyCheckedIn" defaultChecked className="size-5 accent-[var(--color-accent)]" />
      Только команды, подтвердившие участие ({checkedIn})
    </label>
  );

  return (
    <div className="max-w-3xl">
      {t.bracket_published_at ? (
        <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5 space-y-4">
          <div className="flex items-center gap-2.5 text-[16px] font-semibold">
            <Dot tone="ok" />
            <span className="text-fg">Сетка опубликована {formatShortDateTime(t.bracket_published_at)}</span>
          </div>
          {drawInfo}
          {thirdPlaceNote}
          <div className="flex flex-wrap gap-5 text-[15px] font-semibold">
            <Link href={`/tournaments/${t.slug}?tab=bracket`} className="text-accent hover:underline">
              Открыть сетку на сайте ↗
            </Link>
            <Link href={`/admin/tournaments/${t.id}?tab=matches`} className="text-accent hover:underline">
              Перейти к матчам
            </Link>
          </div>
          <div className="pt-5 border-t border-ink/[0.06] flex flex-wrap items-center gap-4">
            <ActionForm action={generateBracketAction} className="flex flex-wrap items-center gap-3">
              <input type="hidden" name="tournamentId" value={t.id} />
              <input type="hidden" name="seeding" value="draw" />
              <input type="hidden" name="redo" value="on" />
              {checkedInBox}
              <SubmitButton
                size="sm"
                variant="secondary"
                className={BTN}
                confirm="Провести жеребьёвку заново? Текущая сетка удалится. Можно только пока ни один матч не начат."
              >
                Провести жеребьёвку заново
              </SubmitButton>
            </ActionForm>
            <ActionForm action={deleteBracketAction}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="sm" variant="danger" className={BTN} confirm="Удалить сетку? Можно только пока ни один матч не начат.">
                Удалить сетку
              </SubmitButton>
            </ActionForm>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="text-[15.5px] text-fg-2 leading-relaxed">
            Одобрено команд: <span className="num font-semibold text-fg">{approved}</span>, подтвердили участие: <span className="num font-semibold text-fg">{checkedIn}</span>. Если мест в сетке больше, чем команд,
            свободные места пропускаются — соперник проходит дальше автоматически.
          </div>
          {thirdPlaceNote}
          <ActionForm action={generateBracketAction}>
            <div className="rounded-surface border border-accent/30 bg-surface p-6 space-y-4">
              <input type="hidden" name="tournamentId" value={t.id} />
              <input type="hidden" name="seeding" value="draw" />
              <div className="text-[18px] font-bold text-fg">Жеребьёвка (случайный порядок)</div>
              <p className="text-[15px] text-fg-2 leading-relaxed">
                Команды расставляются в сетке случайно, честно и без возможности подкрутить. Результат сохраняется в журнале,
                виден здесь и на странице турнира. Пока ни один матч не начат, жеребьёвку можно провести заново.
              </p>
              {checkedInBox}
              <SubmitButton size="md" confirm="Провести жеребьёвку и опубликовать сетку?">
                Провести жеребьёвку
              </SubmitButton>
            </div>
          </ActionForm>
          <ActionForm action={generateBracketAction}>
            <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-6 space-y-4">
              <input type="hidden" name="tournamentId" value={t.id} />
              <input type="hidden" name="seeding" value="elo" />
              <div className="text-[18px] font-bold text-fg">По рейтингу</div>
              <p className="text-[15px] text-fg-2 leading-relaxed">Сильные команды разводятся по сетке. Сначала берутся номера, которые вы задали во вкладке «Регистрация», потом средний рейтинг FACEIT основного состава.</p>
              {checkedInBox}
              <SubmitButton size="md" variant="secondary" confirm="Создать и опубликовать сетку? Посев зафиксируется.">
                Создать сетку по рейтингу
              </SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}
    </div>
  );
}

// ───────────────────────── Матчи

async function MatchesTab({ tournamentId }: { tournamentId: string }) {
  const { data } = await db()
    .from("matches")
    .select("*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)")
    .eq("tournament_id", tournamentId)
    .order("number");
  const matches = visibleMatches((data ?? []) as MatchWithTeams[]);
  if (matches.length === 0) return <EmptyState compact title="Матчей пока нет" description="Они появятся, когда вы создадите сетку." />;
  return (
    <div className="[&_td]:!h-14 [&_td]:!px-4 [&_td]:!text-[15px] [&_th]:!px-4">
    <TableBox minWidth={720}>
      <thead>
        <tr>
          <th>№</th>
          <th>Матч</th>
          <th>Статус</th>
          <th>Счёт</th>
          <th>Сервер</th>
          <th>Когда</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => (
          <tr key={m.id} className={m.status === "live" ? "bg-danger/[0.04]" : undefined}>
            <td className="num text-fg-3">{m.number}</td>
            <td>
              <Link href={`/admin/matches/${m.id}`} className="font-semibold text-fg hover:text-accent">
                {m.team1?.name ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.name ?? "TBD"}
              </Link>
            </td>
            <td><MatchStatusBadge status={m.status} /></td>
            <td className="num">{["live", "finished"].includes(m.status) ? `${m.team1_score}:${m.team2_score}` : "—"}</td>
            <td className="num">{m.server_instance ?? "—"}</td>
            <td className="num">{formatShortDateTime(m.scheduled_at)}</td>
          </tr>
        ))}
      </tbody>
    </TableBox>
    </div>
  );
}

// ───────────────────────── Награды: места, номинации, дипломы

async function AwardsTab({ t, regs }: { t: T; regs: RegistrationWithTeam[] }) {
  const [recap, nominations, days] = await Promise.all([getTournamentRecap(t), getTournamentNominations(t.id), getTournamentDays(t.id)]);
  const podium = recap.placements;
  return (
    <div className="space-y-8 max-w-4xl">
      <Panel title="Картинки для соцсетей">
        <TopDownloads slug={t.slug} days={days} />
      </Panel>

      <Panel
        title="Места"
        action={
          <Link href={`/admin/tournaments/${t.id}/diplomas`} className={buttonClass("secondary", "sm", BTN)}>
            Дипломы для печати →
          </Link>
        }
      >
        {podium.length ? (
          <div className={`${CARD} divide-y divide-ink/[0.06]`}>
            {podium.map((p) => (
              <div key={`${p.place}-${p.team.id}`} className="flex items-center gap-3 px-5 h-14 text-[15.5px]">
                <span className="num w-10 text-fg-3">{p.place}</span>
                <TeamLogo src={p.team.logo_url} tag={p.team.tag} size={28} />
                <span className="font-medium text-fg">{p.team.name}</span>
                {p.place === "1" && <span className="text-[13.5px] text-fg-3">«Лучшая команда»</span>}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState compact title="Мест пока нет" description="Места появятся после финала (и матча за 3-е место, если он есть)." />
        )}
      </Panel>

      <Panel title="Номинации">
        <p className="mb-4 text-[15px] text-fg-2 leading-relaxed max-w-3xl">
          Система сама предлагает кандидата по статистике. Если судьи решили иначе (Положение, п. 5.5), впишите их решение — оно заменит
          подсказку и попадёт в итоги и дипломы. Снять решение можно в любой момент: тогда снова сработает расчёт.
        </p>
        <div className="space-y-4">
          {nominations.map((n) => (
            <NominationCard key={n.key} t={t} n={n} regs={regs} />
          ))}
        </div>
      </Panel>
    </div>
  );
}

function NominationCard({ t, n, regs }: { t: T; n: Nomination; regs: RegistrationWithTeam[] }) {
  const players = regs.flatMap((r) =>
    r.roster.filter((x) => x.player).map((x) => ({ id: x.player!.id, nickname: x.player!.nickname, team: r.team.name })),
  );
  const person = (p: { name: string; team: { name: string } | null }) => (
    <>
      <span className="font-medium text-fg">{p.name}</span>
      {p.team && <span className="text-fg-3"> · {p.team.name}</span>}
    </>
  );
  return (
    <div className={`${CARD} p-5 space-y-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold text-fg">{n.title}</div>
          <div className="mt-1 text-[14px] text-fg-3">{n.rule}</div>
        </div>
        {n.winner ? (
          <div className="text-right text-[14.5px]">
            <div>{person(n.winner)}</div>
            <div className="text-[13px] text-fg-3">{n.winner.source === "judges" ? "решение судей" : "по статистике"}</div>
          </div>
        ) : (
          <div className="text-[14.5px] text-fg-3">не определён</div>
        )}
      </div>
      {n.auto && (
        <div className="text-[13.5px] text-fg-2">
          Кандидат по статистике: {n.computed ? <>{person(n.computed)} <span className="text-fg-3">({n.computed.value})</span></> : <span className="text-fg-3">нет данных</span>}
        </div>
      )}
      <ActionForm action={setNomination} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="tournamentId" value={t.id} />
        <input type="hidden" name="key" value={n.key} />
        <select name="playerId" defaultValue={n.decision?.playerId ?? ""} className="field w-auto" aria-label="Игрок">
          <option value="">— игрок —</option>
          {players.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nickname} · {p.team}
            </option>
          ))}
        </select>
        <input
          name="name"
          defaultValue={n.decision && !n.decision.playerId ? n.decision.name : ""}
          placeholder="ФИО (необязательно)"
          maxLength={120}
          className="field w-64"
        />
        <select name="teamId" defaultValue={n.decision?.team?.id ?? ""} className="field w-auto" aria-label="Команда">
          <option value="">— команда игрока —</option>
          {regs.map((r) => (
            <option key={r.team_id} value={r.team_id}>
              {r.team.name}
            </option>
          ))}
        </select>
        <input name="note" defaultValue={n.decision?.note ?? ""} placeholder="Примечание" maxLength={300} className="field w-56" />
        <SubmitButton size="md" variant="secondary">
          Записать решение судей
        </SubmitButton>
      </ActionForm>
      {n.decision && (
        <ActionForm action={clearNomination}>
          <input type="hidden" name="tournamentId" value={t.id} />
          <input type="hidden" name="key" value={n.key} />
          <SubmitButton size="md" variant="ghost">
            Снять решение судей
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}

// ───────────────────────── Серверы

async function ServersTab({ t }: { t: { id: string; map_pool: string[]; autopilot: boolean } }) {
  const info = await workshopInfo();
  const ws = t.map_pool.filter((m) => m.includes("@"));
  return (
    <div className="space-y-10 max-w-3xl">
      <Panel title="Карты турнира">
        <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] divide-y divide-ink/[0.06]">
          {t.map_pool.map((m) => {
            const id = m.split("@")[1];
            const i = id ? info[id] : null;
            return (
              <div key={m} className="flex items-center gap-3 px-5 h-14 text-[15.5px]">
                <span className="flex-1 font-medium">{m.split("@")[0]}</span>
                {id ? (
                  <>
                    <span className="num text-[13.5px] text-fg-3">workshop {id}</span>
                    {!i ? (
                      <span className="text-[14px] font-medium text-warn">проверяется…</span>
                    ) : i.ok ? (
                      <span className="text-[14px] font-medium text-ok">✓ {i.map}</span>
                    ) : (
                      <span className="text-[14px] font-medium text-danger" title={i.note}>✕ не загружается в игру</span>
                    )}
                  </>
                ) : (
                  <span className="text-[14px] text-fg-3">стандартная</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      {ws.length > 0 && (
        <Panel title="Свои карты из Workshop">
          <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] p-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[15px] text-fg-2 leading-relaxed max-w-lg">
              Свои карты из Workshop скачиваются на сервер сами, когда открывается подтверждение участия. Скачайте их сейчас — тогда к
              первому матчу всё будет готово.
            </p>
            <ActionForm action={prefetchMaps}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="md" variant="secondary">Скачать карты на сервер</SubmitButton>
            </ActionForm>
          </div>
        </Panel>
      )}
      <div className="text-[15px] text-fg-2">
        Автопилот {t.autopilot ? "включён" : "выключен"}. Что сейчас с игровыми серверами — на странице{" "}
        <Link href="/admin/servers" className="font-semibold text-accent hover:underline">«Серверы»</Link>
      </div>
    </div>
  );
}

// ───────────────────────── Регистрация

async function RegistrationTab({
  t,
  regs,
}: {
  t: T;
  regs: RegistrationWithTeam[];
}) {
  if (regs.length === 0) {
    return <EmptyState title="Заявок пока нет" description="Откройте регистрацию на вкладке «Обзор» — после этого капитаны смогут подавать заявки." />;
  }
  const { data: playersData } = await db().from("players").select("steam_id, nickname").eq("is_banned", false).order("nickname").limit(1000);
  const players = (playersData ?? []) as PickPlayer[];
  // официальный турнир: одобрение без полного комплекта документов — только после подтверждения
  const official = t.is_official ? await loadOfficial(t) : null;
  const approveWarning = new Map((official?.teams ?? []).map((x) => [x.registration.id, approveWarningOf(x)]));
  const groups: { key: string; title: string; items: RegistrationWithTeam[] }[] = [
    { key: "pending", title: "Ждут вашего решения", items: regs.filter((r) => r.status === "pending") },
    { key: "approved", title: "Приняты в турнир", items: regs.filter((r) => r.status === "approved") },
    { key: "other", title: "Отклонены или отозваны", items: regs.filter((r) => r.status === "rejected" || r.status === "withdrawn") },
  ];
  return (
    <div className="space-y-10">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <Panel key={g.key} title={<span>{g.title} <span className="num text-fg-3">{g.items.length}</span></span>}>
            <div className="rounded-surface border border-line-subtle bg-surface shadow-[var(--shadow-soft)] divide-y divide-ink/[0.06] overflow-hidden">
              <RegistrationHead />
              {g.items.map((r) => (
                <RegistrationRow key={r.id} r={r} tournamentStatus={t.status} players={players} approveWarning={approveWarning.get(r.id)} />
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}

const REG_GRID = "grid grid-cols-[minmax(0,1fr)_auto] md:grid-cols-[minmax(0,2fr)_64px_76px_130px_120px_130px_minmax(210px,auto)] items-center gap-x-5 gap-y-2";

function RegistrationHead() {
  return (
    <div className={cn(REG_GRID, "hidden md:grid px-5 h-11 text-[14px] font-semibold text-fg-3")}>
      <span>Команда</span>
      <span className="text-right">Игроки</span>
      <span className="text-right">Рейтинг</span>
      <span>Статус</span>
      <span>Участие</span>
      <span>Номер в сетке</span>
      <span className="text-right">Действия</span>
    </div>
  );
}

function RegistrationRow({
  r,
  tournamentStatus,
  players,
  approveWarning,
}: {
  r: RegistrationWithTeam;
  tournamentStatus: TournamentStatus;
  players: PickPlayer[];
  /** официальный турнир: чего не хватает команде — одобрение спросит подтверждение */
  approveWarning?: string;
}) {
  const mains = r.roster.filter((p) => p.role === "main");
  const elo = averageElo(r.roster);
  const tone =
    r.status === "approved" ? "text-ok" : r.status === "pending" ? "text-warn" : r.status === "rejected" ? "text-danger" : "text-fg-3";

  return (
    <div className="px-5 py-4">
      <div className={REG_GRID}>
        <div className="flex items-center gap-3 min-w-0">
          <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={40} />
          <div className="min-w-0">
            <Link href={`/teams/${r.team.tag}`} className="block truncate text-[16px] font-bold hover:text-accent">
              {r.team.name}
            </Link>
            <div className="text-[13.5px] text-fg-3 num">
              {r.team.tag} · подана {formatShortDateTime(r.created_at)}
            </div>
          </div>
        </div>
        <span className="num text-right text-[15px] text-fg-2 max-md:hidden">
          {mains.length}
          <span className="text-fg-3">+{r.roster.length - mains.length}</span>
        </span>
        <span className="num text-right text-[15px] text-fg-2 max-md:hidden">{elo ?? "—"}</span>
        <span className={cn("flex items-center gap-2 text-[14.5px] font-semibold max-md:hidden", tone)}>
          <span className="size-2 rounded-full bg-current" />
          {registrationStatusLabel[r.status]}
        </span>
        <span className={cn("flex items-center gap-2 whitespace-nowrap text-[14.5px] max-md:hidden", r.checked_in_at ? "font-semibold text-ok" : "text-fg-3")}>
          {r.status !== "approved" ? "—" : r.checked_in_at ? (
            <>
              <span className="size-2 rounded-full bg-current" />
              Подтвердила
            </>
          ) : (
            "Не подтвердила"
          )}
        </span>
        <div className="max-md:hidden">
          {r.status === "approved" ? (
            <ActionForm action={setSeed} className="flex items-center gap-1.5">
              <input type="hidden" name="registrationId" value={r.id} />
              <input name="seed" type="number" min={1} max={64} defaultValue={r.seed ?? ""} placeholder="#" aria-label="Номер в сетке" title="Номер в сетке: 1 — самая сильная команда. Если пусто — по рейтингу" className="field !h-10 w-16 !px-2 !text-[15px] num" />
              <SubmitButton size="sm" variant="secondary" className={BTN_SM}>
                OK
              </SubmitButton>
            </ActionForm>
          ) : (
            <span className="text-[14.5px] text-fg-3">—</span>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {r.status !== "approved" && r.status !== "withdrawn" && (
            <ActionForm action={decideRegistration}>
              <input type="hidden" name="registrationId" value={r.id} />
              <input type="hidden" name="decision" value="approve" />
              <SubmitButton size="sm" className={BTN} confirm={approveWarning}>
                Принять
              </SubmitButton>
            </ActionForm>
          )}
          {r.status === "approved" && (
            <ActionForm action={adminCheckIn}>
              <input type="hidden" name="registrationId" value={r.id} />
              {r.checked_in_at && <input type="hidden" name="undo" value="1" />}
              <SubmitButton size="sm" variant="secondary" className={BTN}>
                {r.checked_in_at ? "Снять отметку" : "Отметить участие"}
              </SubmitButton>
            </ActionForm>
          )}
          {r.status === "pending" && (
            <ActionForm action={decideRegistration}>
              <input type="hidden" name="registrationId" value={r.id} />
              <input type="hidden" name="decision" value="reject" />
              <SubmitButton size="sm" variant="ghost" className={`${BTN} text-danger hover:text-danger`} confirm={`Отклонить заявку ${r.team.name} без комментария?`}>
                Отклонить
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </div>

      {r.note && <p className="mt-3 text-[14.5px] text-fg-3">Комментарий: {r.note}</p>}

      <details className="mt-3 group">
        <summary className="list-none cursor-pointer text-[14.5px] font-semibold text-accent hover:text-accent-strong">
          Показать состав команды ({r.roster.length}) и дополнительные действия <span className="group-open:hidden">▾</span>
          <span className="hidden group-open:inline">▴</span>
        </summary>
        <div className="mt-2 divide-y divide-ink/[0.06] border-t border-ink/[0.06]">
          {r.roster
            .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={p.player.avatar_url} name={p.player.nickname} size={32} />
                <Link href={`/players/${p.player.steam_id}`} className="text-[15px] font-semibold flex-1 truncate hover:text-accent">
                  {p.player.nickname}
                </Link>
                <span className="num text-[14.5px] text-fg-3 hidden sm:block">{p.player.steam_id}</span>
                <FaceitLevel level={p.player.faceit_level} />
                <span className="text-[14px] text-fg-3 w-16">{p.role === "main" ? "Основа" : "Запас"}</span>
                {p.player.is_banned && <span className="text-[14px] font-semibold text-danger">бан</span>}
                <ActionForm action={adminRemoveRosterPlayer}>
                  <input type="hidden" name="rosterId" value={p.id} />
                  <SubmitButton size="sm" variant="ghost" className={BTN_SM} confirm={`Убрать ${p.player.nickname} из состава?`}>
                    ✕
                  </SubmitButton>
                </ActionForm>
              </div>
            ))}
        </div>
        {tournamentStatus !== "registration" ? (
          <ActionForm action={adminAddRosterPlayer} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="registrationId" value={r.id} />
            <div className="w-full sm:w-72">
              <PlayerPicker name="steamId" players={players} />
            </div>
            <select name="role" className="field w-32" aria-label="Роль в составе">
              <option value="main">Основа</option>
              <option value="sub">Запас</option>
            </select>
            <SubmitButton size="sm" variant="secondary" className={BTN}>
              Добавить игрока
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="mt-3 text-[14.5px] text-fg-3">Пока регистрация открыта, состав заявки сам повторяет состав команды — менять его вручную не нужно.</p>
        )}

        {/* отклонение с причиной — отдельно, ниже */}
        {r.status !== "rejected" && r.status !== "withdrawn" && (
          <ActionForm action={decideRegistration} className="mt-4 pt-4 border-t border-ink/[0.06] flex flex-wrap items-end gap-3">
            <input type="hidden" name="registrationId" value={r.id} />
            <input type="hidden" name="decision" value="reject" />
            <ChipInput
              name="note"
              chips={["Неполный состав", "Нарушение правил", "Нет свободных мест", "Повторная заявка"]}
              placeholder="Причина отклонения (видна капитану)"
              className="w-full sm:w-[420px]"
            />
            <SubmitButton size="sm" variant="danger" className={BTN} confirm={`Отклонить заявку ${r.team.name}?`}>
              Отклонить с причиной
            </SubmitButton>
          </ActionForm>
        )}
      </details>
    </div>
  );
}
