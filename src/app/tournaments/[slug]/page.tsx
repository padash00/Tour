import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCurrentPlayer } from "@/lib/auth";
import { getActiveMembership, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { bracketLabel, formatDateTime, mapName, registrationStatusLabel } from "@/lib/format";
import type { Registration, Team, Tournament } from "@/lib/types";
import { getTournamentMatches } from "@/lib/matches";
import { BracketView } from "@/components/bracket-view";
import { MatchRow, matchStage, visibleMatches } from "@/components/match-bits";
import { MapGraphic, TournamentStatusPill } from "@/components/tournament-bits";
import {
  Avatar,
  ButtonLink,
  Card,
  Container,
  EmptyState,
  FaceitLevel,
  IconArrow,
  IconBracket,
  IconUsers,
  KV,
  Notice,
  Pill,
  Tabs,
  TeamLogo,
} from "@/components/ui";

export async function generateMetadata(props: PageProps<"/tournaments/[slug]">): Promise<Metadata> {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  return { title: t?.name ?? "Турнир" };
}

const TABS = ["overview", "teams", "bracket", "matches", "rules"] as const;
type Tab = (typeof TABS)[number];

export default async function TournamentPage(props: PageProps<"/tournaments/[slug]">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const tab: Tab = TABS.includes(sp.tab as Tab) ? (sp.tab as Tab) : "overview";

  const t = await getTournamentBySlug(slug);
  if (!t) notFound();

  const [regs, player, matches] = await Promise.all([
    getTournamentRegistrations(t.id),
    getCurrentPlayer(),
    getTournamentMatches(t.id),
  ]);
  const approved = regs.filter((r) => r.status === "approved");
  const pending = regs.filter((r) => r.status === "pending");
  const membership = player ? await getActiveMembership(player.id) : null;
  const myReg = membership ? await getRegistration(t.id, membership.team.id) : null;

  const base = `/tournaments/${t.slug}`;

  return (
    <>
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <MapGraphic className="absolute right-0 top-0 h-full opacity-30 hidden md:block" />
        <Container className="relative pt-14 pb-10">
          <Link href="/tournaments" className="text-sm text-fg-3 hover:text-fg-2">
            ← Все турниры
          </Link>
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <TournamentStatusPill status={t.status} />
            <Pill>{t.game}</Pill>
            <Pill>{t.format}</Pill>
            <Pill>{t.is_lan ? "LAN" : "Онлайн"}</Pill>
          </div>
          <h1 className="mt-5 text-4xl md:text-[56px] font-bold tracking-[-0.04em] leading-[1]">{t.name}</h1>
          <div className="mt-8 grid grid-cols-2 md:grid-cols-4 gap-6 max-w-3xl">
            <HeroFact label="Старт" value={formatDateTime(t.starts_at)} />
            <HeroFact label="Призовой фонд" value={t.prize_pool ?? "—"} />
            <HeroFact label="Команды" value={`${approved.length} / ${t.max_teams}`} />
            <HeroFact label="Сетка" value={bracketLabel[t.bracket_type] ?? t.bracket_type} />
          </div>
        </Container>
        <Container className="relative">
          <Tabs
            active={tab}
            items={[
              { key: "overview", label: "Обзор", href: base },
              { key: "teams", label: `Команды · ${approved.length}`, href: `${base}?tab=teams` },
              { key: "bracket", label: "Сетка", href: `${base}?tab=bracket` },
              { key: "matches", label: "Матчи", href: `${base}?tab=matches` },
              { key: "rules", label: "Правила", href: `${base}?tab=rules` },
            ]}
          />
        </Container>
      </section>

      <Container className="pt-10">
        <div className={tab === "bracket" && matches.length ? "space-y-8" : "grid lg:grid-cols-[1fr_360px] gap-8 items-start"}>
          <div className="min-w-0">
            {tab === "overview" && <Overview t={t} />}
            {tab === "teams" && <TeamsTab approved={approved} pendingCount={pending.length} />}
            {tab === "bracket" &&
              (matches.length ? (
                <BracketView matches={matches} />
              ) : (
                <EmptyState
                  icon={<IconBracket />}
                  title="Сетка появится после check-in"
                  description={`${bracketLabel[t.bracket_type] ?? t.bracket_type} на ${t.max_teams} команд. Посев будет опубликован после завершения check-in.`}
                />
              ))}
            {tab === "matches" && <MatchesTab matches={matches} />}
            {tab === "rules" && (
              <Card className="p-6 sm:p-8">
                {t.rules ? (
                  <div className="prose-f16">{t.rules}</div>
                ) : (
                  <p className="text-fg-3">
                    Регламент турнира будет опубликован до начала регистрации. Общие правила — на странице{" "}
                    <Link href="/rules" className="text-accent hover:underline">
                      Правила
                    </Link>
                    .
                  </p>
                )}
              </Card>
            )}
          </div>

          <aside className={tab === "bracket" && matches.length ? "hidden" : "space-y-4 lg:sticky lg:top-24"}>
            <RegistrationBox
              t={t}
              loggedIn={!!player}
              team={membership?.team ?? null}
              isCaptain={!!membership && membership.team.captain_id === player?.id}
              reg={myReg}
              approvedCount={approved.length}
            />
            <Card className="p-6">
              <div className="label mb-2">Расписание</div>
              <KV label="Регистрация с">{formatDateTime(t.registration_opens_at)}</KV>
              <KV label="Регистрация до">{formatDateTime(t.registration_closes_at)}</KV>
              <KV label="Check-in">
                {t.checkin_opens_at ? `${formatDateTime(t.checkin_opens_at)}` : "—"}
              </KV>
              <KV label="Старт">{formatDateTime(t.starts_at)}</KV>
            </Card>
          </aside>
        </div>
      </Container>
    </>
  );
}

function HeroFact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className="mt-1.5 text-[15px] font-semibold">{value}</div>
    </div>
  );
}

function Overview({ t }: { t: Tournament }) {
  return (
    <div className="space-y-8">
      {t.description && (
        <section>
          <h2 className="text-xl font-bold tracking-tight mb-4">О турнире</h2>
          <div className="prose-f16">{t.description}</div>
        </section>
      )}

      <section className="grid sm:grid-cols-2 gap-4">
        <Card className="p-6">
          <div className="label mb-2">Формат</div>
          <KV label="Игра">{t.game}</KV>
          <KV label="Режим">{t.format}</KV>
          <KV label="Сетка">{bracketLabel[t.bracket_type] ?? t.bracket_type}</KV>
          <KV label="Матчи">{t.match_format ?? "—"}</KV>
          <KV label="Площадка">{t.is_lan ? `LAN${t.location ? ` · ${t.location}` : ""}` : (t.location ?? "Онлайн")}</KV>
          <KV label="Серверы">{t.is_lan ? "Серверы F16, локальная сеть" : "Серверы F16"}</KV>
        </Card>
        <Card className="p-6">
          <div className="label mb-2">Призовой фонд</div>
          <div className="text-3xl font-bold tracking-tight py-2">{t.prize_pool ?? "Будет объявлен"}</div>
          {t.prize_distribution.length > 0 && (
            <div className="mt-2">
              {t.prize_distribution.map((p) => (
                <KV key={p.place} label={p.place}>
                  <span className="font-semibold">{p.prize}</span>
                </KV>
              ))}
            </div>
          )}
        </Card>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">Маппул</h2>
        <div className="flex flex-wrap gap-2">
          {t.map_pool.map((m) => (
            <span key={m} className="h-9 px-4 inline-flex items-center rounded-lg border border-line bg-surface text-sm font-medium">
              {mapName(m)}
            </span>
          ))}
        </div>
      </section>

      <section>
        <h2 className="text-xl font-bold tracking-tight mb-4">Требования к участникам</h2>
        <Card className="p-6">
          {t.requirements ? (
            <div className="prose-f16">{t.requirements}</div>
          ) : (
            <ul className="space-y-2.5 text-sm text-fg-2">
              <li>— Вход на платформу через Steam у каждого игрока</li>
              <li>— 5 основных игроков, до 2 запасных</li>
              <li>— Один игрок — одна команда в рамках турнира</li>
              <li>— Check-in капитаном в отведённое время</li>
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

function TeamsTab({
  approved,
  pendingCount,
}: {
  approved: Awaited<ReturnType<typeof getTournamentRegistrations>>;
  pendingCount: number;
}) {
  if (approved.length === 0) {
    return (
      <EmptyState
        icon={<IconUsers />}
        title="Пока нет одобренных команд"
        description={
          pendingCount > 0
            ? `${pendingCount} ${pendingCount === 1 ? "заявка ожидает" : "заявки ожидают"} подтверждения администратора.`
            : "Станьте первой командой, подавшей заявку."
        }
      />
    );
  }
  return (
    <div className="grid gap-3">
      {pendingCount > 0 && (
        <p className="text-sm text-fg-3">Ещё на рассмотрении: {pendingCount}</p>
      )}
      {approved.map((r) => (
        <Card key={r.id} className="p-5">
          <div className="flex items-center gap-4">
            <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={44} />
            <div className="min-w-0 flex-1">
              <Link href={`/teams/${r.team.tag}`} className="font-semibold hover:text-accent">
                {r.team.name}
              </Link>
              <div className="text-xs text-fg-3 mt-0.5">
                {r.team.tag}
                {r.team.region ? ` · ${r.team.region}` : ""}
              </div>
            </div>
            {r.checked_in_at && <Pill tone="ok">Ready</Pill>}
            {r.seed && <span className="num text-sm text-fg-3">#{r.seed}</span>}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {r.roster
              .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
              .map((rp) => (
                <Link
                  key={rp.id}
                  href={`/players/${rp.player.steam_id}`}
                  className="flex items-center gap-2 h-9 pl-1 pr-3 rounded-lg border border-line bg-bg-2 hover:border-line-strong text-sm"
                >
                  <Avatar src={rp.player.avatar_url} name={rp.player.nickname} size={26} />
                  <span className="max-w-[120px] truncate">{rp.player.nickname}</span>
                  <FaceitLevel level={rp.player.faceit_level} />
                  {rp.role === "sub" && <span className="text-[10px] uppercase text-fg-3">sub</span>}
                </Link>
              ))}
          </div>
        </Card>
      ))}
    </div>
  );
}

function RegistrationBox({
  t,
  loggedIn,
  team,
  isCaptain,
  reg,
  approvedCount,
}: {
  t: Tournament;
  loggedIn: boolean;
  team: Team | null;
  isCaptain: boolean;
  reg: Registration | null;
  approvedCount: number;
}) {
  const base = `/tournaments/${t.slug}`;
  const active = reg && (reg.status === "pending" || reg.status === "approved");

  let body: React.ReactNode;
  if (active && reg) {
    body = (
      <>
        <div className="flex items-center gap-2">
          <Pill tone={reg.status === "approved" ? "ok" : "warn"} dot>
            {registrationStatusLabel[reg.status]}
          </Pill>
          {reg.checked_in_at && <Pill tone="ok">Check-in ✓</Pill>}
        </div>
        <p className="mt-3 text-sm text-fg-2">
          {team?.name} {reg.status === "approved" ? "участвует в турнире." : "ждёт решения администратора."}
        </p>
        {t.status === "checkin" && reg.status === "approved" && !reg.checked_in_at && (
          <ButtonLink href={`${base}/checkin`} className="mt-5 w-full">
            Пройти check-in
          </ButtonLink>
        )}
        {isCaptain && t.status === "registration" && (
          <ButtonLink href={`${base}/register`} variant="secondary" className="mt-5 w-full">
            Управлять заявкой
          </ButtonLink>
        )}
      </>
    );
  } else if (t.status === "registration") {
    body = (
      <>
        <p className="text-sm text-fg-2">
          Открыто мест: <span className="text-fg font-semibold">{Math.max(0, t.max_teams - approvedCount)}</span> из{" "}
          {t.max_teams}
        </p>
        {reg?.status === "rejected" && (
          <div className="mt-4">
            <Notice tone="danger">Предыдущая заявка отклонена{reg.note ? `: ${reg.note}` : "."}</Notice>
          </div>
        )}
        <ButtonLink
          href={!loggedIn ? `/login?next=${base}/register` : !team ? "/team/create" : `${base}/register`}
          className="mt-5 w-full"
          size="lg"
        >
          {!loggedIn ? "Войти и зарегистрироваться" : !team ? "Сначала создайте команду" : isCaptain ? "Зарегистрировать команду" : "Заявку подаёт капитан"}
          <IconArrow />
        </ButtonLink>
      </>
    );
  } else {
    body = (
      <p className="text-sm text-fg-2">
        {t.status === "finished"
          ? "Турнир завершён."
          : t.status === "cancelled"
            ? "Турнир отменён."
            : "Регистрация на турнир закрыта."}
      </p>
    );
  }

  return (
    <Card className="p-6">
      <div className="label mb-4">Участие</div>
      {body}
    </Card>
  );
}

function MatchesTab({ matches }: { matches: Awaited<ReturnType<typeof getTournamentMatches>> }) {
  const list = visibleMatches(matches);
  if (list.length === 0) {
    return <EmptyState title="Матчей пока нет" description="Расписание матчей появится вместе с сеткой турнира." />;
  }
  const groups = [
    { title: "Сейчас", items: list.filter((m) => ["veto", "ready", "live"].includes(m.status)) },
    { title: "Предстоящие", items: list.filter((m) => ["upcoming", "pending"].includes(m.status)) },
    { title: "Сыгранные", items: list.filter((m) => m.status === "finished").reverse() },
  ];
  return (
    <div className="space-y-8">
      {groups
        .filter((g) => g.items.length)
        .map((g) => (
          <section key={g.title}>
            <div className="label mb-3">{g.title}</div>
            <div className="grid gap-2">
              {g.items.map((m) => (
                <MatchRow key={m.id} m={m} stage={matchStage(m, matches)} />
              ))}
            </div>
          </section>
        ))}
    </div>
  );
}
