import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkIn } from "@/app/actions/tournament";
import { requirePlayer } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { formatDateTime, formatTime, tournamentStatusLabel } from "@/lib/format";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RosterList } from "@/components/roster-list";
import { Card, Container, EmptyState, Notice, PageHeader, Pill, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Check-in" };

export default async function CheckinPage(props: PageProps<"/tournaments/[slug]/checkin">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/checkin`);
  const myTeam = await getEntrantTeam(player, t);
  const reg = myTeam ? await getRegistration(t.id, myTeam.id) : null;
  const all = await getTournamentRegistrations(t.id);
  const approved = all.filter((r) => r.status === "approved");
  const checked = approved.filter((r) => r.checked_in_at).length;

  const header = (
    <PageHeader
      eyebrow={<Link href={`/tournaments/${t.slug}`} className="hover:text-fg-2">← {t.name}</Link>}
      title="Check-in"
      description={
        t.checkin_opens_at
          ? `Окно check-in: ${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? ` – ${formatTime(t.checkin_closes_at)}` : ""}. Команды без check-in не попадут в сетку.`
          : "Капитан подтверждает, что команда готова играть."
      }
    />
  );

  if (!myTeam || !reg || reg.status !== "approved") {
    return (
      <Container className="max-w-3xl">
        {header}
        <EmptyState
          title="Ваша команда не участвует в турнире"
          description="Check-in проходят только команды с одобренной заявкой."
        />
      </Container>
    );
  }

  const team = myTeam;
  const isCaptain = team.captain_id === player.id;
  const mains = reg.roster.filter((r) => r.role === "main");
  const checks = [
    { ok: true, text: "Команда зарегистрирована" },
    { ok: mains.length === modeOf(t.format).size, text: `В основе ${mainPlayersLabel(modeOf(t.format).size)} (${mains.length})` },
    { ok: reg.roster.every((r) => /^\d{17}$/.test(r.player.steam_id)), text: "SteamID всех игроков валидны" },
    { ok: !reg.roster.some((r) => r.player.is_banned), text: "Нет блокировок" },
    { ok: true, text: "Состав подтверждён" },
  ];

  return (
    <Container className="max-w-3xl">
      {header}
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex flex-wrap items-center gap-4">
            <TeamLogo src={team.logo_url} tag={team.tag} size={52} />
            <div className="flex-1">
              <div className="text-lg font-semibold">{team.name}</div>
              <div className="text-sm text-fg-3">
                {tournamentStatusLabel[t.status]} · готово {checked} из {approved.length}
              </div>
            </div>
            {reg.checked_in_at ? <Pill tone="ok" dot>Team ready</Pill> : <Pill tone="warn" dot>Ожидает check-in</Pill>}
          </div>
        </Card>

        <div className="grid sm:grid-cols-[1fr_1.3fr] gap-4">
          <Card className="p-6">
            <div className="label mb-4">Проверка системы</div>
            <ul className="space-y-3">
              {checks.map((c) => (
                <li key={c.text} className="flex items-center gap-3 text-sm">
                  <span className={c.ok ? "text-ok" : "text-danger"}>{c.ok ? "✓" : "✕"}</span>
                  <span className="text-fg-2">{c.text}</span>
                </li>
              ))}
            </ul>
          </Card>
          <Card className="p-6">
            <div className="label mb-2">Турнирный состав</div>
            <RosterList
              items={reg.roster
                .sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1))
                .map((r) => ({
                  key: r.id,
                  player: r.player,
                  role: r.player_id === team.captain_id ? "captain" : r.role,
                }))}
            />
          </Card>
        </div>

        {reg.checked_in_at ? (
          <Notice tone="ok">
            Check-in пройден {formatDateTime(reg.checked_in_at)}. Ждите публикации сетки и своего первого матча.
          </Notice>
        ) : t.status !== "checkin" ? (
          <Notice>Check-in ещё не открыт. Мы пришлём уведомление, когда он начнётся.</Notice>
        ) : isCaptain ? (
          <ActionForm action={checkIn}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <SubmitButton size="lg" className="w-full" pendingText="Проверяем…">
              Check in
            </SubmitButton>
          </ActionForm>
        ) : (
          <Notice>Check-in проходит капитан команды.</Notice>
        )}
      </div>
    </Container>
  );
}
