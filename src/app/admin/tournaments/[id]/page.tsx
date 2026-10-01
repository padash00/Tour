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
import { formatDateTime, registrationStatusLabel, tournamentStatusLabel } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { Avatar, Card, EmptyState, FaceitLevel, Pill, Tabs, TeamLogo, cn } from "@/components/ui";
import { TournamentForm } from "../tournament-form";

export const metadata: Metadata = { title: "Турнир — админ" };

const FLOW: { status: TournamentStatus; hint: string }[] = [
  { status: "draft", hint: "Скрыт от всех" },
  { status: "registration", hint: "Команды подают заявки, составы меняются свободно" },
  { status: "registration_closed", hint: "Составы заблокированы" },
  { status: "checkin", hint: "Капитаны подтверждают участие" },
  { status: "live", hint: "Турнир идёт" },
  { status: "finished", hint: "Турнир завершён" },
  { status: "cancelled", hint: "Турнир отменён" },
];

export default async function AdminTournamentPage(props: PageProps<"/admin/tournaments/[id]">) {
  const { id } = await props.params;
  const sp = await props.searchParams;
  const tab = sp.tab === "settings" ? "settings" : "registrations";
  const t = await getTournamentById(id);
  if (!t) notFound();
  const regs = await getTournamentRegistrations(t.id);

  const groups: { key: string; title: string; items: RegistrationWithTeam[] }[] = [
    { key: "pending", title: "На рассмотрении", items: regs.filter((r) => r.status === "pending") },
    { key: "approved", title: "Одобрены", items: regs.filter((r) => r.status === "approved") },
    { key: "other", title: "Отклонённые и отозванные", items: regs.filter((r) => r.status === "rejected" || r.status === "withdrawn") },
  ];
  const approved = groups[1].items;
  const checkedIn = approved.filter((r) => r.checked_in_at).length;

  return (
    <div className="space-y-8">
      <div>
        <Link href="/admin/tournaments" className="text-sm text-fg-3 hover:text-fg-2">
          ← Турниры
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-3xl font-bold tracking-[-0.03em]">{t.name}</h1>
          <TournamentStatusPill status={t.status} />
        </div>
        <div className="mt-2 text-sm text-fg-3">
          Одобрено {approved.length}/{t.max_teams} · check-in {checkedIn}/{approved.length} ·{" "}
          {t.status !== "draft" ? (
            <Link href={`/tournaments/${t.slug}`} className="text-accent hover:underline">
              публичная страница ↗
            </Link>
          ) : (
            "черновик не виден публично"
          )}
        </div>
      </div>

      <Card className="p-6">
        <div className="label mb-4">Этап турнира</div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
          {FLOW.map((f) => (
            <ActionForm key={f.status} action={setTournamentStatus}>
              <input type="hidden" name="id" value={t.id} />
              <input type="hidden" name="status" value={f.status} />
              <button
                type="submit"
                disabled={t.status === f.status}
                className={cn(
                  "w-full text-left rounded-xl border p-3 transition",
                  t.status === f.status
                    ? "border-[#8bb8ff66] bg-accent-dim"
                    : "border-line hover:border-line-strong hover:bg-white/[0.02]",
                )}
              >
                <div className={cn("text-sm font-semibold", t.status === f.status ? "text-accent" : "text-fg")}>
                  {tournamentStatusLabel[f.status]}
                </div>
                <div className="mt-1 text-xs text-fg-3">{f.hint}</div>
              </button>
            </ActionForm>
          ))}
        </div>
      </Card>

      <Tabs
        active={tab}
        items={[
          { key: "registrations", label: `Заявки · ${regs.length}`, href: `/admin/tournaments/${t.id}` },
          { key: "settings", label: "Настройки", href: `/admin/tournaments/${t.id}?tab=settings` },
        ]}
      />

      {tab === "settings" ? (
        <div className="max-w-3xl space-y-6">
          <TournamentForm action={updateTournament} t={t} />
          {t.status === "draft" && (
            <Card className="p-6 border-[#ef7a7a33]">
              <div className="label mb-3">Опасная зона</div>
              <ActionForm action={deleteTournament}>
                <input type="hidden" name="id" value={t.id} />
                <SubmitButton variant="danger" confirm="Удалить черновик турнира безвозвратно?">
                  Удалить черновик
                </SubmitButton>
              </ActionForm>
            </Card>
          )}
        </div>
      ) : regs.length === 0 ? (
        <EmptyState title="Заявок пока нет" description="Откройте регистрацию — капитаны смогут подавать заявки." />
      ) : (
        <div className="space-y-10">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.key}>
                <h2 className="mb-4 text-lg font-semibold">
                  {g.title} <span className="text-fg-3 num">· {g.items.length}</span>
                </h2>
                <div className="space-y-3">
                  {g.items.map((r) => (
                    <RegistrationCard key={r.id} r={r} tournamentStatus={t.status} />
                  ))}
                </div>
              </section>
            ))}
        </div>
      )}
    </div>
  );
}

function RegistrationCard({ r, tournamentStatus }: { r: RegistrationWithTeam; tournamentStatus: TournamentStatus }) {
  const mains = r.roster.filter((p) => p.role === "main");
  const elo = averageElo(r.roster);
  const tone = r.status === "approved" ? "ok" : r.status === "pending" ? "warn" : r.status === "rejected" ? "danger" : "neutral";

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center gap-4">
        <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={44} />
        <div className="min-w-0 flex-1">
          <Link href={`/teams/${r.team.tag}`} className="font-semibold hover:text-accent">
            {r.team.name}
          </Link>
          <div className="text-xs text-fg-3 mt-0.5">
            {r.team.tag} · основа {mains.length} · запас {r.roster.length - mains.length} · avg ELO {elo ?? "—"} · подана{" "}
            {formatDateTime(r.created_at)}
          </div>
        </div>
        <Pill tone={tone}>{registrationStatusLabel[r.status]}</Pill>
        {r.status === "approved" && (r.checked_in_at ? <Pill tone="ok">Check-in ✓</Pill> : <Pill>Нет check-in</Pill>)}
      </div>

      {r.note && <p className="mt-3 text-sm text-fg-3">Комментарий: {r.note}</p>}

      <div className="mt-4 flex flex-wrap items-end gap-2">
        {r.status !== "approved" && (
          <ActionForm action={decideRegistration}>
            <input type="hidden" name="registrationId" value={r.id} />
            <input type="hidden" name="decision" value="approve" />
            <SubmitButton size="sm">Одобрить</SubmitButton>
          </ActionForm>
        )}
        {r.status !== "rejected" && r.status !== "withdrawn" && (
          <ActionForm action={decideRegistration} className="flex gap-2">
            <input type="hidden" name="registrationId" value={r.id} />
            <input type="hidden" name="decision" value="reject" />
            <input name="note" placeholder="Причина (видна капитану)" className="field h-8 py-0 text-[13px] w-56" />
            <SubmitButton size="sm" variant="danger" confirm={`Отклонить заявку ${r.team.name}?`}>
              Отклонить
            </SubmitButton>
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
              <input
                name="seed"
                type="number"
                min={1}
                max={64}
                defaultValue={r.seed ?? ""}
                placeholder="Seed"
                className="field h-8 py-0 w-20 text-[13px] num"
              />
              <SubmitButton size="sm" variant="ghost">
                OK
              </SubmitButton>
            </ActionForm>
          </>
        )}
      </div>

      <details className="mt-4 group">
        <summary className="list-none cursor-pointer text-sm text-fg-3 hover:text-fg-2">
          Состав ({r.roster.length}) <span className="group-open:hidden">▾</span>
          <span className="hidden group-open:inline">▴</span>
        </summary>
        <div className="mt-3 divide-y divide-line border-t border-line">
          {r.roster
            .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
            .map((p) => (
              <div key={p.id} className="flex items-center gap-3 py-2.5">
                <Avatar src={p.player.avatar_url} name={p.player.nickname} size={28} />
                <span className="text-sm font-medium flex-1 truncate">{p.player.nickname}</span>
                <span className="num text-xs text-fg-3 hidden sm:block">{p.player.steam_id}</span>
                <FaceitLevel level={p.player.faceit_level} />
                <Pill>{p.role === "main" ? "Основа" : "Запас"}</Pill>
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
        {tournamentStatus !== "registration" && (
          <ActionForm action={adminAddRosterPlayer} className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="registrationId" value={r.id} />
            <input name="steamId" placeholder="SteamID64 игрока" className="field h-8 py-0 text-[13px] num w-52" />
            <select name="role" className="field h-8 py-0 text-[13px] w-28">
              <option value="main">Основа</option>
              <option value="sub">Запас</option>
            </select>
            <SubmitButton size="sm" variant="secondary">
              Добавить
            </SubmitButton>
          </ActionForm>
        )}
        {tournamentStatus === "registration" && (
          <p className="mt-3 text-xs text-fg-3">
            Пока регистрация открыта, состав заявки синхронизируется с составом команды автоматически.
          </p>
        )}
      </details>
    </Card>
  );
}
