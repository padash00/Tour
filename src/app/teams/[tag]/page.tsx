import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Crown, Gamepad2, GraduationCap, Trophy, UserPlus } from "lucide-react";
import { MAX_MAIN, MAX_SUBS, averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations, getTeamTagByAlias } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getTeamMatches } from "@/lib/matches";
import { getOwnPost, roleLabel } from "@/lib/finder";
import { getCoach } from "@/lib/invites";
import { ORGANIZER, absolute, snippet } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { getHeadToHead, getPlayerLeaderboard } from "@/lib/stats";
import { HeadToHeadList } from "@/components/head-to-head";
import { getTeamAwards } from "@/lib/awards";
import { AwardsRow } from "@/components/public/awards";
import { FormStrip } from "@/components/public/form-strip";
import { ratingColor } from "@/components/stats-format";
import { MatchListRow } from "@/components/match-row";
import {
  Avatar,
  Button,
  Container,
  EmptyState,
  Eyebrow,
  FaceitLevel,
  Panel,
  RowList,
  Section,
  Stack,
  Status,
  TeamLogo,
  cn,
  registrationStatus,
  tournamentStatus,
} from "@/components/ds";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

// страницы собираются при первом запросе и дальше отдаются из кэша (ISR)
export async function generateStaticParams() {
  return [];
}

export async function generateMetadata(props: PageProps<"/teams/[tag]">): Promise<Metadata> {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team) return { title: "Команда" };
  const description = snippet(
    `${team.name} [${team.tag}] — команда по CS2${team.region ? ` из ${team.region}` : ""} на F16 Arena: состав, матчи, турниры и статистика игроков.${team.description ? ` ${team.description}` : ""}`,
  );
  return {
    title: `${team.name} [${team.tag}] — команда CS2`,
    description,
    alternates: { canonical: `/teams/${encodeURIComponent(team.tag)}` },
    openGraph: { title: team.name, description, ...(team.logo_url ? { images: [{ url: team.logo_url }] } : {}) },
  };
}

const ROLE: Record<string, string> = { captain: "Капитан", player: "Основа", substitute: "Запас" };

export default async function TeamPage(props: PageProps<"/teams/[tag]">) {
  const { tag } = await props.params;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team) {
    const current = await getTeamTagByAlias(decodeURIComponent(tag));
    if (current) permanentRedirect(`/teams/${encodeURIComponent(current)}`);
    notFound();
  }

  const [members, regs, matches, board, awards, h2h, recruiting, coach] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getTeamMatches(team.id),
    getPlayerLeaderboard(),
    getTeamAwards(team.id),
    getHeadToHead({ teamIds: [team.id] }),
    team.is_solo ? Promise.resolve(null) : getOwnPost("team", team.id),
    getCoach(team),
  ]);
  const canApply = !team.is_solo && team.accepts_applications && members.length < MAX_MAIN + MAX_SUBS;
  const finished = matches.filter((m) => m.status === "finished").reverse();
  const recent = finished.slice(0, 10);
  const participations = regs.filter((r) => r.status === "approved");
  const visibleRegs = regs.filter((r) => r.status !== "withdrawn");
  const captain = members.find((m) => m.role === "captain");
  const ratingByPlayer = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));
  const wins = finished.filter((m) => m.winner_id === team.id).length;
  const losses = finished.length - wins;
  const ordered = [...members].sort((a, b) => ["captain", "player", "substitute"].indexOf(a.role) - ["captain", "player", "substitute"].indexOf(b.role));
  const mains = ordered.filter((m) => m.role !== "substitute");
  const subs = ordered.filter((m) => m.role === "substitute");
  const ratings = members.map((m) => ratingByPlayer.get(m.player.id)?.rating).filter((r): r is number => r != null);
  const teamRating = ratings.length ? ratings.reduce((a, b) => a + b, 0) / ratings.length : null;
  const form = recent.slice(0, 5).map((m) => (m.winner_id === team.id ? "W" : "L") as "W" | "L");

  const apply = `/teams/${encodeURIComponent(team.tag)}/apply`;
  const quiet = !recent.length && !visibleRegs.length && !awards.length && !h2h.length;

  /** Карточка игрока состава: аватар, ник, роль и цифры */
  const playerCard = (m: (typeof members)[number], badge?: string) => {
    const r = ratingByPlayer.get(m.player.id);
    return (
      <Link
        key={m.id}
        href={`/players/${m.player.steam_id}`}
        className="group relative flex flex-col items-center rounded-surface border border-line-subtle bg-surface px-3 pb-4 pt-5 text-center transition-colors hover:border-line-hover"
      >
        {badge && <span className="absolute left-3 top-3 text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{badge}</span>}
        <span className="relative">
          <Avatar src={m.player.avatar_url} name={m.player.nickname} size="lg" />
          {m.role === "captain" && (
            <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full border border-line bg-surface-3 text-warn [&>svg]:size-3">
              <Crown aria-label="Капитан" />
            </span>
          )}
        </span>
        <span className="mt-3 w-full truncate text-[15px] font-semibold text-fg group-hover:text-accent">{m.player.nickname}</span>
        <span className="text-meta text-fg-3">{m.player.is_banned ? <span className="text-danger">Заблокирован</span> : ROLE[m.role] ?? m.role}</span>
        <span className="mt-3 flex items-center gap-3 border-t border-line-subtle pt-3 text-meta">
          <span className={cn("num font-semibold", r?.rating != null ? ratingColor(r.rating) : "text-fg-3")} title="F16 Rating">
            {r?.rating != null ? r.rating.toFixed(2) : "—"}
          </span>
          <span className="num text-fg-2" title="FACEIT ELO">
            {m.player.faceit_elo ?? "—"}
          </span>
          <FaceitLevel level={m.player.faceit_level} />
        </span>
      </Link>
    );
  };

  /** Свободное место: пунктир, а если команда принимает заявки — ссылка на заявку */
  const emptyCard = (key: string, label: string, icon: React.ReactNode, cta: boolean) => {
    const inner = (
      <>
        <span className="grid size-14 place-items-center rounded-full border border-dashed border-line-strong text-fg-3 [&>svg]:size-5">{icon}</span>
        <span className="mt-3 text-[14px] font-medium text-fg-3">{label}</span>
        {cta && <span className="mt-1 text-meta font-medium text-accent">Подать заявку →</span>}
      </>
    );
    const cls = "flex min-h-[188px] flex-col items-center justify-center rounded-surface border border-dashed border-line-subtle px-3 py-5 text-center";
    return cta ? (
      <Link key={key} href={apply} className={cn(cls, "transition-colors hover:border-accent/50 hover:bg-accent/[0.03]")}>
        {inner}
      </Link>
    ) : (
      <div key={key} className={cls}>
        {inner}
      </div>
    );
  };

  return (
    <Container className="pb-16 pt-8 sm:pt-10">
      <JsonLd
        data={{
          "@type": "SportsTeam",
          name: team.name,
          alternateName: team.tag,
          sport: "Counter-Strike 2",
          url: absolute(`/teams/${encodeURIComponent(team.tag)}`),
          ...(team.logo_url ? { logo: team.logo_url } : {}),
          ...(team.description ? { description: team.description } : {}),
          memberOf: ORGANIZER,
          athlete: members.map((m) => ({ "@type": "Person", name: m.player.nickname, url: absolute(`/players/${m.player.steam_id}`) })),
          ...(coach ? { coach: { "@type": "Person", name: coach.nickname } } : {}),
        }}
      />
      <Link href="/teams" className="inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> Команды
      </Link>

      {/* ── идентичность и цифры */}
      <header className="relative mt-2 overflow-hidden rounded-feature border border-line-subtle bg-surface p-5 sm:p-8">
        <span aria-hidden className="pointer-events-none absolute -right-24 -top-28 size-80 rounded-full bg-accent/[0.06] blur-3xl" />
        <div className="relative grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,380px)] lg:items-center">
          <div className="flex min-w-0 flex-col gap-5 sm:flex-row sm:items-center">
            <TeamLogo src={team.logo_url} tag={team.tag} size="xl" />
            <div className="min-w-0">
              <Eyebrow>Команда · {team.tag}</Eyebrow>
              <h1 className="mt-1 break-words text-page text-fg">{team.name}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-3">
                {[team.region, captain ? `Капитан — ${captain.player.nickname}` : null, coach ? `Тренер — ${coach.nickname}` : null, `С ${formatDate(team.created_at)}`]
                  .filter(Boolean)
                  .map((x, i) => (
                    <span key={i} className="flex items-center gap-3">
                      {i > 0 && <span aria-hidden>·</span>}
                      {x}
                    </span>
                  ))}
              </div>
              {team.description && <p className="mt-3 max-w-read text-[14px] leading-relaxed text-fg-2">{team.description}</p>}
              {canApply && (
                <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
                  <Button href={apply} size="lg" icon={<UserPlus />}>
                    Подать заявку в команду
                  </Button>
                  <span className="text-meta text-fg-3">
                    {recruiting ? (
                      <>
                        <span className="font-medium text-accent">Ищет игроков</span>
                        {recruiting.roles.length ? ` · ${recruiting.roles.map(roleLabel).join(", ")}` : ""}
                      </>
                    ) : (
                      `Свободных мест: ${MAX_MAIN + MAX_SUBS - members.length}`
                    )}
                  </span>
                </div>
              )}
            </div>
          </div>

          <div>
            <dl className="grid grid-cols-2 gap-2">
              {[
                { label: "Игроков", value: `${members.length}/${MAX_MAIN + MAX_SUBS}`, cls: "text-fg" },
                { label: "Средний ELO", value: averageElo(mains) ?? "—", cls: "text-fg" },
                { label: "F16 Rating", value: teamRating ? teamRating.toFixed(2) : "—", cls: teamRating ? ratingColor(teamRating) : "text-fg-3" },
                { label: "Турниров", value: participations.length, cls: "text-fg" },
              ].map((f) => (
                <div key={f.label} className="rounded-control border border-line-subtle bg-white/[0.02] px-4 py-3">
                  <dt className="text-micro text-fg-3">{f.label}</dt>
                  <dd className={cn("num mt-1 text-[20px] font-semibold leading-none", f.cls)}>{f.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-2 flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-white/[0.02] px-4 py-3">
              <span className="text-micro text-fg-3">Форма</span>
              {form.length ? (
                <span className="flex items-center gap-3">
                  <FormStrip results={form} />
                  <span className="num text-meta">
                    <span className="text-ok">{wins}W</span> · <span className="text-danger">{losses}L</span>
                  </span>
                </span>
              ) : (
                <span className="text-meta text-fg-3">Первый матч впереди</span>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ── состав: основа в ряд, ниже запас и тренер */}
      <Section title="Состав" className="pt-12" action={<span className="num text-meta text-fg-3">Основа {mains.length}/{MAX_MAIN}</span>}>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {mains.map((m) => playerCard(m))}
          {Array.from({ length: Math.max(0, MAX_MAIN - mains.length) }, (_, i) => emptyCard(`m${i}`, "Свободно", <UserPlus />, canApply && i === 0))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {subs.map((m) => playerCard(m, "Запас"))}
          {Array.from({ length: Math.max(0, MAX_SUBS - subs.length) }, (_, i) => emptyCard(`s${i}`, "Запас · свободно", <UserPlus />, false))}
          {coach ? (
            <Link
              href={`/players/${coach.steam_id}`}
              className="group relative flex flex-col items-center rounded-surface border border-line-subtle bg-surface px-3 pb-4 pt-5 text-center transition-colors hover:border-line-hover"
            >
              <span className="absolute left-3 top-3 text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">Тренер</span>
              <Avatar src={coach.avatar_url} name={coach.nickname} size="lg" />
              <span className="mt-3 w-full truncate text-[15px] font-semibold text-fg group-hover:text-accent">{coach.nickname}</span>
              <span className="text-meta text-fg-3">Не играет</span>
            </Link>
          ) : (
            emptyCard("coach", "Тренер не назначен", <GraduationCap />, false)
          )}
        </div>
      </Section>

      {/* ── история: пока её нет — один блок вместо трёх пустых */}
      {quiet ? (
        <EmptyState
          compact
          className="mt-12"
          icon={<Trophy />}
          title="Команда ещё не играла турниров"
          text="Матчи, турниры и трофеи появятся здесь после первого участия."
          action={
            <Button href="/tournaments" variant="secondary" size="sm">
              Ближайшие турниры
            </Button>
          }
        />
      ) : (
        <div className="grid items-start gap-12 pt-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
          <Section title="Последние матчи">
            {recent.length ? (
              <RowList>
                {recent.map((m) => (
                  <MatchListRow key={m.id} m={m} highlight={team.id} meta={m.tournament.name} />
                ))}
              </RowList>
            ) : (
              <EmptyState compact icon={<Gamepad2 />} title="Матчей пока нет" text="История появится после первого участия в турнире." />
            )}
          </Section>

          <Stack className="!gap-12">
            {h2h.length > 0 && (
              <Section title="Личные встречи">
                <Panel className="py-2">
                  <HeadToHeadList items={h2h} />
                </Panel>
              </Section>
            )}
            {visibleRegs.length > 0 && (
              <Section title="Турниры">
                <RowList>
                  {visibleRegs.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <Link href={`/tournaments/${r.tournament.slug}`} className="min-w-0 flex-1 truncate text-[14px] font-medium text-fg hover:text-accent">
                        {r.tournament.name}
                      </Link>
                      <Status info={r.status === "approved" ? tournamentStatus[r.tournament.status] : registrationStatus[r.status]} size="sm" />
                    </div>
                  ))}
                </RowList>
              </Section>
            )}
            {awards.length > 0 && (
              <Section title="Трофеи">
                <Panel>
                  <AwardsRow awards={awards} />
                </Panel>
              </Section>
            )}
          </Stack>
        </div>
      )}
    </Container>
  );
}
