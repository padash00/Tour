import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CalendarClock, ChevronLeft } from "lucide-react";
import { LiveRefresh } from "@/components/live-refresh";
import { requirePlayer } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { formatDateTime, formatTime } from "@/lib/format";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { Button, Container, EmptyState, Eyebrow, FaceitLevel, PageTitle, Panel, PlayerIdentity, TeamIdentity } from "@/components/ds";
import { CheckinTask, type CheckItem } from "@/components/competition/registration";
import { HelpHint } from "@/components/help-hint";

export const metadata: Metadata = { title: "Check-in", robots: { index: false } };

const STEAM_ID = /^\d{17}$/;

export default async function CheckinPage(props: PageProps<"/tournaments/[slug]/checkin">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/checkin`);
  const team = await getEntrantTeam(player, t);
  const [reg, all] = await Promise.all([team ? getRegistration(t.id, team.id) : null, getTournamentRegistrations(t.id)]);
  const mode = modeOf(t.format);
  const solo = mode.size === 1;
  const base = `/tournaments/${t.slug}`;
  const window_ = t.checkin_opens_at
    ? `${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? ` – ${formatTime(t.checkin_closes_at)}` : ""}`
    : null;

  const header = (
    <>
      <Link href={base} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-meta text-fg-3 hover:text-fg sm:min-h-0">
        <ChevronLeft className="size-4" aria-hidden />
        {t.name}
      </Link>
      <header className="mt-3">
        <Eyebrow tone={t.status === "checkin" ? "accent" : "muted"}>Check-in</Eyebrow>
        <PageTitle className="mt-1">{t.name}</PageTitle>
        {window_ && <p className="mt-2 text-meta text-fg-3">Окно: {window_}</p>}
      </header>
    </>
  );

  if (!team || !reg || reg.status !== "approved") {
    return (
      <Container width="read" className="pb-16 pt-6 sm:pt-8">
        {header}
        <EmptyState
          className="mt-6"
          icon={<CalendarClock />}
          title={reg?.status === "pending" ? "Заявка ещё на рассмотрении" : "Вы не участвуете в турнире"}
          text={
            reg?.status === "pending"
              ? "Check-in проходят участники с одобренной заявкой. О решении администратора придёт уведомление."
              : "Check-in проходят только участники с одобренной заявкой."
          }
          action={
            <Button href={base} variant="secondary">
              К турниру
            </Button>
          }
        />
        <HelpHint topics={["checkin"]} className="mt-6" />
      </Container>
    );
  }

  const isCaptain = solo || team.captain_id === player.id;
  const approved = all.filter((r) => r.status === "approved");
  const checked = approved.filter((r) => r.checked_in_at).length;
  const mains = reg.roster.filter((r) => r.role === "main");
  const badSteam = reg.roster.filter((r) => !STEAM_ID.test(r.player.steam_id));
  const banned = reg.roster.filter((r) => r.player.is_banned);
  const captain = reg.roster.find((r) => r.player_id === team.captain_id)?.player ?? null;

  // только реальные условия check-in
  const checks: CheckItem[] = [
    { label: "Заявка одобрена", ok: true },
    ...(solo
      ? []
      : [{ label: `Основа: ${mainPlayersLabel(mode.size)}`, ok: mains.length === mode.size, detail: `${mains.length}/${mode.size}` }]),
    { label: "SteamID у всех игроков", ok: badSteam.length === 0, detail: badSteam.length ? badSteam.map((r) => r.player.nickname).join(", ") : undefined },
    { label: "Нет заблокированных игроков", ok: banned.length === 0, detail: banned.length ? banned.map((r) => r.player.nickname).join(", ") : undefined },
  ];
  const roster = [...reg.roster].sort((a, b) =>
    a.player_id === team.captain_id ? -1 : b.player_id === team.captain_id ? 1 : a.role === b.role ? 0 : a.role === "main" ? -1 : 1,
  );

  return (
    <Container width="read" className="pb-16 pt-6 sm:pt-8">
      <LiveRefresh watch={`tournament:${t.id}`} intervalMs={5000} />
      {header}

      <div className="mt-6 space-y-5">
        {!solo && (
          <Panel className="flex flex-wrap items-center justify-between gap-4">
            <TeamIdentity
              name={team.name}
              tag={team.tag}
              logo={team.logo_url}
              size="lg"
              meta={`${team.tag}${captain ? ` · капитан ${captain.nickname}` : ""}`}
            />
            <TeamsProgress checked={checked} total={approved.length} />
          </Panel>
        )}

        <CheckinTask
          tournamentId={t.id}
          tournamentHref={base}
          status={t.status}
          opensAt={t.checkin_opens_at}
          closesAt={t.checkin_closes_at}
          checkedInAt={reg.checked_in_at}
          serverNow={serverNow()}
          isCaptain={isCaptain}
          captainName={captain?.nickname ?? null}
          checks={checks}
          solo={solo}
        />

        {solo ? (
          <Panel>
            <TeamsProgress checked={checked} total={approved.length} solo />
          </Panel>
        ) : (
          <section aria-labelledby="checkin-roster">
            <div className="mb-3 flex items-baseline justify-between gap-4">
              <h2 id="checkin-roster" className="text-heading text-fg">
                Состав
              </h2>
              <span className="num text-meta text-fg-3">
                Основа {mains.length}/{mode.size}
                {reg.roster.length > mains.length ? ` · запас ${reg.roster.length - mains.length}` : ""}
              </span>
            </div>
            <Panel padded={false}>
              <ul className="divide-y divide-line-subtle">
                {roster.map((r) => {
                  const issue = r.player.is_banned ? "Заблокирован" : !STEAM_ID.test(r.player.steam_id) ? "Неверный SteamID" : null;
                  return (
                    <li key={r.id} className="px-4 py-3 sm:px-5">
                      <PlayerIdentity
                        name={r.player.nickname}
                        avatar={r.player.avatar_url}
                        href={`/players/${r.player.steam_id}`}
                        size="md"
                        captain={r.player_id === team.captain_id}
                        meta={issue ? <span className="text-danger">{issue}</span> : `${r.role === "sub" ? "Запас" : "Основа"}${r.player_id === player.id ? " · это вы" : ""}`}
                        trailing={<FaceitLevel level={r.player.faceit_level} />}
                      />
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </section>
        )}
        <HelpHint topics={["checkin"]} />
      </div>
    </Container>
  );
}

/** Сколько участников уже прошли check-in */
function TeamsProgress({ checked, total, solo }: { checked: number; total: number; solo?: boolean }) {
  return (
    <div className="min-w-40">
      <div className="flex items-baseline justify-between gap-3 text-meta">
        <span className="text-fg-3">{solo ? "Участники готовы" : "Команды готовы"}</span>
        <span className="num font-medium text-fg">
          {checked} из {total}
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
        <div className="h-full rounded-full bg-ok/80" style={{ width: `${(checked / Math.max(1, total)) * 100}%` }} />
      </div>
    </div>
  );
}

/** Время сервера на момент отрисовки (динамическая страница) */
function serverNow() {
  return Date.now();
}
