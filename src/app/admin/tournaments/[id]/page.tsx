import type { Metadata } from "next";
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
import { formatDateTime, formatShortDateTime, registrationStatusLabel, tournamentStatusLabel } from "@/lib/format";
import { FORMATS, type FormatKind } from "@/lib/formats";
import { MODES, type ModeKey } from "@/lib/modes";
import type { MatchWithTeams } from "@/lib/matches";
import type { TournamentStatus } from "@/lib/types";
import { deleteBracketAction, generateBracketAction } from "@/app/actions/admin-match";
import { prefetchMaps, setAutopilot } from "@/app/actions/admin-server";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChipInput, PlayerPicker, type PickPlayer } from "@/components/pickers";
import { db } from "@/lib/supabase";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { MatchStatusBadge, visibleMatches } from "@/components/match-bits";
import { Avatar, EmptyState, FaceitLevel, Pill, TeamLogo, cn } from "@/components/ui";
import { AdminHeader, Dot, Metric, Panel, SubTabs, TableBox } from "@/components/admin/control";
import { getWorkshopMaps, getDisabledMaps, getMapImages } from "@/lib/settings";
import { workshopInfo } from "@/lib/server-control";
import { TournamentForm } from "../tournament-form";

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
  { key: "bracket", label: "Сетка" },
  { key: "matches", label: "Матчи" },
  { key: "settings", label: "Настройки" },
  { key: "rules", label: "Правила" },
  { key: "servers", label: "Серверы" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

export default async function AdminTournamentPage(props: PageProps<"/admin/tournaments/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  // старые ссылки ?tab=registrations ведут на регистрацию
  const raw = sp.tab === "registrations" ? "registration" : String(sp.tab ?? "overview");
  const tab: TabKey = (TABS.find((x) => x.key === raw)?.key ?? "overview") as TabKey;
  const t = await getTournamentById(id);
  if (!t) notFound();
  const regs = await getTournamentRegistrations(t.id);

  const pendingRegs = regs.filter((r) => r.status === "pending");
  const approved = regs.filter((r) => r.status === "approved");
  const checkedIn = approved.filter((r) => r.checked_in_at).length;
  const tabHref = (k: string) => (k === "overview" ? `/admin/tournaments/${t.id}` : `/admin/tournaments/${t.id}?tab=${k}`);

  return (
    <div className="space-y-6">
      <AdminHeader
        back={{ href: "/admin/tournaments", label: "Турниры" }}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t.name}
            <TournamentStatusPill status={t.status} />
          </span>
        }
        description={`${MODES[t.format as ModeKey]?.title ?? t.format} · ${FORMATS[t.bracket_type as FormatKind]?.title ?? t.bracket_type} · старт ${formatDateTime(t.starts_at)}`}
        actions={
          <Link href={`/tournaments/${t.slug}`} className="text-[12px] text-fg-3 hover:text-fg">
            {t.status === "draft" ? "Предпросмотр ↗" : "Публичная страница ↗"}
          </Link>
        }
      />

      <SubTabs
        active={tab}
        items={TABS.map((x) => ({
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
      {tab === "bracket" && <BracketTab t={t} approved={approved.length} checkedIn={checkedIn} />}
      {tab === "matches" && <MatchesTab tournamentId={t.id} />}
      {tab === "settings" && (
        <div className="space-y-8">
          <TournamentForm
            action={updateTournament}
            t={t}
            workshopMaps={await getWorkshopMaps()}
            disabledMaps={await getDisabledMaps()}
            mapImages={await getMapImages()}
          />
          <div id="danger" className="max-w-xl pt-6 border-t border-line scroll-mt-8">
            <div className="text-[13px] font-semibold text-danger">Опасная зона</div>
            <p className="mt-1 mb-3 text-[13px] text-fg-3">
              Удалятся сетка, матчи, заявки и статистика турнира. Это нельзя отменить.
              {t.status !== "draft" && " Матчи на серверах будут завершены. Для подтверждения введите название турнира."}
            </p>
            <ActionForm action={deleteTournament} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="id" value={t.id} />
              {t.status !== "draft" && (
                <input name="confirm" placeholder={t.name} autoComplete="off" className="field h-8 text-[13px] w-72" />
              )}
              <SubmitButton size="sm" variant="danger" confirm={`Удалить турнир «${t.name}» безвозвратно?`}>
                Удалить турнир
              </SubmitButton>
            </ActionForm>
          </div>
        </div>
      )}
      {tab === "rules" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          <Panel title="Регламент" action={<Link href={tabHref("settings")} className="text-[12px] text-accent hover:underline">Изменить</Link>}>
            {t.rules ? (
              <div className="rounded-xl border border-line bg-surface p-5 text-[13px] text-fg-2 leading-relaxed whitespace-pre-line">{t.rules}</div>
            ) : (
              <EmptyState compact title="Регламент не заполнен" description="Задаётся в Настройках → Правила матча." />
            )}
          </Panel>
          <Panel title="Требования к участникам">
            {t.requirements ? (
              <div className="rounded-xl border border-line bg-surface p-5 text-[13px] text-fg-2 leading-relaxed whitespace-pre-line">{t.requirements}</div>
            ) : (
              <EmptyState compact title="Стандартные требования" description="Свои требования задаются в Настройках → Правила матча." />
            )}
          </Panel>
          <Panel title="Параметры матча" className="lg:col-span-2">
            <div className="rounded-xl border border-line bg-surface grid grid-cols-2 md:grid-cols-5 divide-x divide-line">
              <div className="p-4"><Metric label="Серии" value={`BO${t.default_best_of}`} hint={`финал BO${t.final_best_of}`} /></div>
              <div className="p-4"><Metric label="Стороны" value={t.knife_round ? "Нож" : "Фикс."} /></div>
              <div className="p-4"><Metric label="Овертайм" value={t.overtime ? "MR3" : "Нет"} /></div>
              <div className="p-4"><Metric label="Тактические" value={t.timeouts_per_team} hint={`по ${t.timeout_seconds} с`} /></div>
              <div className="p-4"><Metric label="Технические" value={t.tech_pauses} hint={`по ${Math.round(t.tech_pause_seconds / 60)} мин`} /></div>
            </div>
          </Panel>
        </div>
      )}
      {tab === "servers" && <ServersTab t={t} />}
    </div>
  );
}

// ───────────────────────── Обзор

function OverviewTab({
  t,
  approved,
  checkedIn,
  pending,
}: {
  t: NonNullable<Awaited<ReturnType<typeof getTournamentById>>>;
  approved: number;
  checkedIn: number;
  pending: number;
}) {
  return (
    <div className="space-y-8">
      <div className="rounded-xl border border-line bg-surface grid grid-cols-2 md:grid-cols-4 divide-x divide-line">
        <div className="p-5"><Metric label="Одобрено" value={`${approved}/${t.max_teams}`} /></div>
        <div className="p-5"><Metric label="Ждут решения" value={pending} tone={pending ? "warn" : undefined} /></div>
        <div className="p-5"><Metric label="Check-in" value={`${checkedIn}/${approved}`} /></div>
        <div className="p-5"><Metric label="Сетка" value={t.bracket_published_at ? "Опубликована" : "Нет"} tone={t.bracket_published_at ? "ok" : undefined} /></div>
      </div>

      <Panel title="Этап турнира">
        <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-1.5">
          {FLOW.map((f) => (
            <ActionForm key={f.status} action={setTournamentStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={f.status} />
              <button
                type="submit"
                disabled={t.status === f.status}
                className={cn(
                  "w-full h-full text-left rounded-lg border px-3 py-2.5 transition",
                  t.status === f.status ? "border-accent/50 bg-accent-dim" : "border-line hover:border-line-strong hover:bg-white/[0.02]",
                  f.status === "cancelled" && t.status !== f.status && "hover:border-danger/40",
                )}
              >
                <div className={cn("text-[13px] font-semibold", t.status === f.status ? "text-accent" : "text-fg")}>
                  {tournamentStatusLabel[f.status]}
                </div>
                <div className="mt-0.5 text-[11px] text-fg-3 leading-snug">{f.hint}</div>
              </button>
            </ActionForm>
          ))}
        </div>
      </Panel>

      <Panel title="Автопилот">
        <div className="rounded-xl border border-line bg-surface p-5 flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2 text-[13px]">
              <Dot tone={t.autopilot ? "ok" : "muted"} />
              <span className={t.autopilot ? "text-ok font-medium" : "text-fg-3"}>{t.autopilot ? "Включён" : "Выключен"}</span>
            </div>
            <p className="mt-2 text-[13px] text-fg-2 leading-relaxed">
              Сайт сам запускает вето, как только соперники известны, и отправляет готовые матчи на свободные серверы — по расписанию
              (за 10 минут до начала) или по порядку номеров. Работает, пока турнир в статусе check-in или «идёт».
            </p>
          </div>
          <ActionForm action={setAutopilot}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <input type="hidden" name="on" value={t.autopilot ? "0" : "1"} />
            <SubmitButton size="sm" variant={t.autopilot ? "secondary" : "primary"}>
              {t.autopilot ? "Выключить автопилот" : "Включить автопилот"}
            </SubmitButton>
          </ActionForm>
        </div>
      </Panel>
    </div>
  );
}

// ───────────────────────── Сетка

function BracketTab({ t, approved, checkedIn }: { t: { id: string; slug: string; bracket_published_at: string | null }; approved: number; checkedIn: number }) {
  return (
    <div className="max-w-3xl">
      {t.bracket_published_at ? (
        <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
          <div className="flex items-center gap-2 text-[13px]">
            <Dot tone="ok" />
            <span className="text-fg">Сетка опубликована {formatShortDateTime(t.bracket_published_at)}</span>
          </div>
          <div className="flex flex-wrap gap-4 text-[13px]">
            <Link href={`/tournaments/${t.slug}?tab=bracket`} className="text-accent hover:underline">
              Смотреть на сайте ↗
            </Link>
            <Link href={`/admin/tournaments/${t.id}?tab=matches`} className="text-accent hover:underline">
              Матчи турнира
            </Link>
          </div>
          <div className="pt-4 border-t border-line">
            <ActionForm action={deleteBracketAction}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="sm" variant="danger" confirm="Удалить сетку? Можно только пока ни один матч не начат.">
                Удалить сетку
              </SubmitButton>
            </ActionForm>
          </div>
        </div>
      ) : (
        <ActionForm action={generateBracketAction}>
          <div className="rounded-xl border border-line bg-surface p-5 space-y-4">
            <input type="hidden" name="tournamentId" value={t.id} />
            <div className="text-[13px] text-fg-2">
              Одобрено <span className="num text-fg">{approved}</span>, прошли check-in <span className="num text-fg">{checkedIn}</span>. Пустые места
              заполнятся баями — команды проходят дальше автоматически.
            </div>
            <div className="flex flex-wrap items-center gap-4">
              <select name="seeding" className="field w-auto">
                <option value="elo">Посев: ручной seed, затем средний FACEIT ELO</option>
                <option value="random">Посев: случайный</option>
              </select>
              <label className="flex items-center gap-2 text-[13px] text-fg-2">
                <input type="checkbox" name="onlyCheckedIn" defaultChecked className="size-4 accent-[#8ab8ff]" />
                Только прошедшие check-in ({checkedIn})
              </label>
            </div>
            <SubmitButton size="sm" confirm="Создать и опубликовать сетку? Посев зафиксируется.">
              Создать сетку
            </SubmitButton>
          </div>
        </ActionForm>
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
  if (matches.length === 0) return <EmptyState compact title="Матчей нет" description="Матчи появятся после создания сетки." />;
  return (
    <TableBox minWidth={720}>
      <thead>
        <tr>
          <th>#</th>
          <th>Матч</th>
          <th>Статус</th>
          <th>Счёт</th>
          <th>Сервер</th>
          <th>Время</th>
        </tr>
      </thead>
      <tbody>
        {matches.map((m) => (
          <tr key={m.id} className={m.status === "live" ? "bg-danger/[0.04]" : undefined}>
            <td className="num text-fg-3">{m.number}</td>
            <td>
              <Link href={`/admin/matches/${m.id}`} className="font-medium text-fg hover:text-accent">
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
  );
}

// ───────────────────────── Серверы

async function ServersTab({ t }: { t: { id: string; map_pool: string[]; autopilot: boolean } }) {
  const info = await workshopInfo();
  const ws = t.map_pool.filter((m) => m.includes("@"));
  return (
    <div className="space-y-8 max-w-3xl">
      <Panel title="Карты турнира">
        <div className="rounded-xl border border-line bg-surface divide-y divide-line">
          {t.map_pool.map((m) => {
            const id = m.split("@")[1];
            const i = id ? info[id] : null;
            return (
              <div key={m} className="flex items-center gap-3 px-4 h-11 text-[13px]">
                <span className="flex-1 font-medium">{m.split("@")[0]}</span>
                {id ? (
                  <>
                    <span className="num text-[12px] text-fg-3">workshop {id}</span>
                    {!i ? (
                      <span className="text-[12px] text-warn">проверяется…</span>
                    ) : i.ok ? (
                      <span className="text-[12px] text-ok">✓ {i.map}</span>
                    ) : (
                      <span className="text-[12px] text-danger" title={i.note}>✕ не грузится в CS2</span>
                    )}
                  </>
                ) : (
                  <span className="text-[12px] text-fg-3">стандартная</span>
                )}
              </div>
            );
          })}
        </div>
      </Panel>
      {ws.length > 0 && (
        <Panel title="Прогрев Workshop-карт">
          <div className="rounded-xl border border-line bg-surface p-5 flex flex-wrap items-center justify-between gap-4">
            <p className="text-[13px] text-fg-2 max-w-lg">
              Карты из Workshop скачиваются на сервер автоматически при открытии check-in. Прогрев сейчас — чтобы к первому матчу они
              уже были в кэше.
            </p>
            <ActionForm action={prefetchMaps}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="sm" variant="secondary">Прогреть карты</SubmitButton>
            </ActionForm>
          </div>
        </Panel>
      )}
      <div className="text-[13px] text-fg-3">
        Автопилот {t.autopilot ? "включён" : "выключен"} · состояние инстансов —{" "}
        <Link href="/admin/servers" className="text-accent hover:underline">Серверы</Link>
      </div>
    </div>
  );
}

// ───────────────────────── Регистрация

async function RegistrationTab({
  t,
  regs,
}: {
  t: { status: TournamentStatus };
  regs: RegistrationWithTeam[];
}) {
  if (regs.length === 0) {
    return <EmptyState title="Заявок пока нет" description="Откройте регистрацию на вкладке «Обзор» — капитаны смогут подавать заявки." />;
  }
  const { data: playersData } = await db().from("players").select("steam_id, nickname").eq("is_banned", false).order("nickname").limit(1000);
  const players = (playersData ?? []) as PickPlayer[];
  const groups: { key: string; title: string; items: RegistrationWithTeam[] }[] = [
    { key: "pending", title: "На рассмотрении", items: regs.filter((r) => r.status === "pending") },
    { key: "approved", title: "Одобрены", items: regs.filter((r) => r.status === "approved") },
    { key: "other", title: "Отклонённые и отозванные", items: regs.filter((r) => r.status === "rejected" || r.status === "withdrawn") },
  ];
  return (
    <div className="space-y-8">
      {groups
        .filter((g) => g.items.length > 0)
        .map((g) => (
          <Panel key={g.key} title={<span>{g.title} <span className="num text-fg-3">{g.items.length}</span></span>}>
            <div className="rounded-xl border border-line bg-surface divide-y divide-line">
              {g.items.map((r) => (
                <RegistrationRow key={r.id} r={r} tournamentStatus={t.status} players={players} />
              ))}
            </div>
          </Panel>
        ))}
    </div>
  );
}

function RegistrationRow({
  r,
  tournamentStatus,
  players,
}: {
  r: RegistrationWithTeam;
  tournamentStatus: TournamentStatus;
  players: PickPlayer[];
}) {
  const mains = r.roster.filter((p) => p.role === "main");
  const elo = averageElo(r.roster);
  const tone = r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : r.status === "rejected" ? "danger" : "neutral";

  return (
    <div className="p-4">
      <div className="flex flex-wrap items-center gap-4">
        <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={`/teams/${r.team.tag}`} className="text-[14px] font-semibold hover:text-accent">
            {r.team.name}
          </Link>
          <div className="text-[12px] text-fg-3 mt-0.5">
            {r.team.tag} · основа {mains.length} · запас {r.roster.length - mains.length} · avg ELO {elo ?? "—"} · подана{" "}
            {formatDateTime(r.created_at)}
          </div>
        </div>
        <Pill tone={tone}>{registrationStatusLabel[r.status]}</Pill>
        {r.status === "approved" && (r.checked_in_at ? <Pill tone="ok">Check-in</Pill> : <Pill>Нет check-in</Pill>)}
      </div>

      {r.note && <p className="mt-2 text-[13px] text-fg-3">Комментарий: {r.note}</p>}

      <div className="mt-3 flex flex-wrap items-end gap-2">
        {r.status !== "approved" && (
          <ActionForm action={decideRegistration}>
            <input type="hidden" name="registrationId" value={r.id} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton size="sm">Одобрить</SubmitButton>
          </ActionForm>
        )}
        {r.status === "approved" && (
          <>
            <ActionForm action={adminCheckIn}>
              <input type="hidden" name="registrationId" value={r.id} />
              {r.checked_in_at && <input type="hidden" name="undo" value="1" />}
              <SubmitButton size="sm" variant="secondary">
                {r.checked_in_at ? "Снять check-in" : "Check-in вручную"}
              </SubmitButton>
            </ActionForm>
            <ActionForm action={setSeed} className="flex gap-2">
              <input type="hidden" name="registrationId" value={r.id} />
              <input name="seed" type="number" min={1} max={64} defaultValue={r.seed ?? ""} placeholder="Seed" className="field h-8 w-20 text-[13px] num" />
              <SubmitButton size="sm" variant="ghost">
                OK
              </SubmitButton>
            </ActionForm>
          </>
        )}
      </div>

      <details className="mt-3 group">
        <summary className="list-none cursor-pointer text-[12px] text-fg-3 hover:text-fg-2">
          Состав ({r.roster.length}) <span className="group-open:hidden">▾</span>
          <span className="hidden group-open:inline">▴</span>
        </summary>
        <div className="mt-2 divide-y divide-line border-t border-line">
          {r.roster
            .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2">
                <Avatar src={p.player.avatar_url} name={p.player.nickname} size={24} />
                <span className="text-[13px] font-medium flex-1 truncate">{p.player.nickname}</span>
                <span className="num text-[11px] text-fg-3 hidden sm:block">{p.player.steam_id}</span>
                <FaceitLevel level={p.player.faceit_level} />
                <span className="text-[12px] text-fg-3 w-14">{p.role === "main" ? "Основа" : "Запас"}</span>
                {p.player.is_banned && <Pill tone="danger">Бан</Pill>}
                <ActionForm action={adminRemoveRosterPlayer}>
                  <input type="hidden" name="rosterId" value={p.id} />
                  <SubmitButton size="sm" variant="ghost" confirm={`Убрать ${p.player.nickname} из состава?`}>
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
            <select name="role" className="field h-8 text-[13px] w-28">
              <option value="main">Основа</option>
              <option value="sub">Запас</option>
            </select>
            <SubmitButton size="sm" variant="secondary">
              Добавить
            </SubmitButton>
          </ActionForm>
        ) : (
          <p className="mt-2 text-[12px] text-fg-3">Пока регистрация открыта, состав заявки синхронизируется с составом команды автоматически.</p>
        )}
      </details>

      {/* отклонение — отдельно, ниже основных действий */}
      {r.status !== "rejected" && r.status !== "withdrawn" && (
        <ActionForm action={decideRegistration} className="mt-3 pt-3 border-t border-white/[0.05] flex flex-wrap items-end gap-2">
          <input type="hidden" name="registrationId" value={r.id} />
          <input type="hidden" name="decision" value="reject" />
          <ChipInput
            name="note"
            chips={["Неполный состав", "Нарушение правил", "Нет свободных мест", "Повторная заявка"]}
            placeholder="Причина отклонения (видна капитану)"
            className="w-full sm:w-[420px]"
          />
          <SubmitButton size="sm" variant="danger" confirm={`Отклонить заявку ${r.team.name}?`}>
            Отклонить
          </SubmitButton>
        </ActionForm>
      )}
    </div>
  );
}
