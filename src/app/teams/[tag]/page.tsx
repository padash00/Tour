import type { Metadata } from "next";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { ArrowLeft, Gamepad2, Trophy, UserPlus } from "lucide-react";
import { MAX_MAIN, MAX_SUBS, averageElo, getTeamByTag, getTeamMembers, getTeamRegistrations, getTeamTagByAlias } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { getTeamMatches } from "@/lib/matches";
import { getOwnPost, roleLabel } from "@/lib/finder";
import { getHeadToHead, getPlayerLeaderboard } from "@/lib/stats";
import { HeadToHeadList } from "@/components/head-to-head";
import { getTeamAwards } from "@/lib/awards";
import { AwardsRow } from "@/components/public/awards";
import { FormStrip } from "@/components/public/form-strip";
import { ratingColor } from "@/components/stats-format";
import { MatchListRow } from "@/components/match-row";
import {
  Button,
  Container,
  EmptyState,
  Eyebrow,
  FaceitLevel,
  Facts,
  Panel,
  PlayerIdentity,
  RowList,
  Section,
  Stack,
  Status,
  SubsectionTitle,
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
  return { title: team?.name ?? "Команда" };
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

  const [members, regs, matches, board, awards, h2h, recruiting] = await Promise.all([
    getTeamMembers(team.id),
    getTeamRegistrations(team.id),
    getTeamMatches(team.id),
    getPlayerLeaderboard(),
    getTeamAwards(team.id),
    getHeadToHead({ teamIds: [team.id] }),
    team.is_solo ? Promise.resolve(null) : getOwnPost("team", team.id),
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

  const playerRow = (m: (typeof members)[number]) => {
    const r = ratingByPlayer.get(m.player.id);
    return (
      <div key={m.id} className="flex min-h-16 items-center gap-4 px-4 py-2.5">
        <div className="min-w-0 flex-1">
          <PlayerIdentity
            name={m.player.nickname}
            avatar={m.player.avatar_url}
            href={`/players/${m.player.steam_id}`}
            captain={m.role === "captain"}
            size="md"
            meta={m.player.is_banned ? <span className="text-danger">Заблокирован</span> : ROLE[m.role] ?? m.role}
          />
        </div>
        <div className="w-16 text-right">
          <div className={cn("num text-[15px] font-semibold", r?.rating != null ? ratingColor(r.rating) : "text-fg-3")}>{r?.rating != null ? r.rating.toFixed(2) : "—"}</div>
          <div className="text-micro text-fg-3">Rating</div>
        </div>
        <div className="hidden w-16 text-right sm:block">
          <div className="num text-[15px] text-fg-2">{m.player.faceit_elo ?? "—"}</div>
          <div className="text-micro text-fg-3">ELO</div>
        </div>
        <FaceitLevel level={m.player.faceit_level} />
      </div>
    );
  };

  return (
    <Container className="pt-8 sm:pt-10">
      <Link href="/teams" className="inline-flex min-h-11 items-center gap-2 text-meta text-fg-3 hover:text-fg">
        <ArrowLeft className="size-4" /> Команды
      </Link>

      {/* ── идентичность */}
      <header className="mt-2 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
        <div className="flex min-w-0 items-center gap-5">
          <TeamLogo src={team.logo_url} tag={team.tag} size="xl" />
          <div className="min-w-0">
            <Eyebrow>Команда · {team.tag}</Eyebrow>
            <h1 className="mt-1 break-words text-page text-fg">{team.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-meta text-fg-3">
              {[team.region, captain ? `Капитан — ${captain.player.nickname}` : null, `С ${formatDate(team.created_at)}`]
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
                <Button href={`/teams/${encodeURIComponent(team.tag)}/apply`} size="lg" icon={<UserPlus />}>
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
        <div className="shrink-0">
          <div className="text-meta text-fg-3">Форма</div>
          {form.length ? (
            <>
              <FormStrip results={form} className="mt-2" />
              <div className="num mt-2 text-meta text-fg-2">
                <span className="text-ok">{wins}W</span> · <span className="text-danger">{losses}L</span>
                <span className="text-fg-3"> за всё время</span>
              </div>
            </>
          ) : (
            <p className="mt-1 text-meta text-fg-3">Первый официальный матч впереди</p>
          )}
        </div>
      </header>

      <Facts
        columns={4}
        className="mt-8 border-y border-line-subtle py-6"
        items={[
          { label: "Игроков", value: <span className="num">{members.length}</span> },
          { label: "Средний ELO основы", value: <span className="num">{averageElo(mains) ?? "—"}</span> },
          { label: "F16 Rating", value: <span className={cn("num", teamRating ? ratingColor(teamRating) : "text-fg-3")}>{teamRating ? teamRating.toFixed(2) : "—"}</span> },
          { label: "Турниров", value: <span className="num">{participations.length}</span> },
        ]}
      />

      <Stack className="pt-12">
        <Section title="Состав">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <SubsectionTitle action={<span className="num text-meta text-fg-3">{mains.length}/{MAX_MAIN}</span>}>Основа</SubsectionTitle>
              <RowList>
                {mains.map(playerRow)}
                {Array.from({ length: Math.max(0, MAX_MAIN - mains.length) }, (_, i) => (
                  <div key={i} className="flex min-h-16 items-center px-4 text-meta text-fg-3">
                    Свободное место
                  </div>
                ))}
              </RowList>
            </div>
            {subs.length > 0 && (
              <div>
                <SubsectionTitle>Запас</SubsectionTitle>
                <RowList>{subs.map(playerRow)}</RowList>
              </div>
            )}
          </div>
        </Section>

        <div className="grid items-start gap-12 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] lg:gap-10">
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
            <Section title="Турниры">
              {visibleRegs.length ? (
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
              ) : (
                <EmptyState compact icon={<Trophy />} title="Турниров пока нет" text="Команда ещё не участвовала в турнирах." />
              )}
            </Section>
            <Section title="Трофеи">
              {awards.length ? (
                <Panel>
                  <AwardsRow awards={awards} />
                </Panel>
              ) : (
                <EmptyState compact icon={<Trophy />} title="Трофеев пока нет" text="Призовые места F16 Arena появятся здесь." />
              )}
            </Section>
          </Stack>
        </div>
      </Stack>
    </Container>
  );
}
