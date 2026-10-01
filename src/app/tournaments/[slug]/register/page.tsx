import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { registerTeam, withdrawRegistration } from "@/app/actions/tournament";
import { requirePlayer } from "@/lib/auth";
import { MAX_MAIN, getActiveMembership, getRegistration, getTeamMembers, getTournamentBySlug } from "@/lib/data";
import { formatDateTime, registrationStatusLabel } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { RosterList } from "@/components/roster-list";
import { ButtonLink, Card, Container, EmptyState, IconUsers, Notice, PageHeader, Pill, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Регистрация команды" };

export default async function RegisterPage(props: PageProps<"/tournaments/[slug]/register">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/register`);
  const membership = await getActiveMembership(player.id);

  const header = (
    <PageHeader
      eyebrow={<Link href={`/tournaments/${t.slug}`} className="hover:text-fg-2">← {t.name}</Link>}
      title="Регистрация команды"
      description={`Регистрация открыта до ${formatDateTime(t.registration_closes_at)}. После закрытия состав меняет только администратор.`}
    />
  );

  if (!membership) {
    return (
      <Container className="max-w-3xl">
        {header}
        <EmptyState
          icon={<IconUsers />}
          title="Соберите состав, чтобы зарегистрироваться"
          description="Создайте команду и пригласите игроков по ссылке — затем капитан подаёт заявку."
          action={<ButtonLink href="/team/create">Создать команду</ButtonLink>}
        />
      </Container>
    );
  }

  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, reg] = await Promise.all([getTeamMembers(team.id), getRegistration(t.id, team.id)]);
  const mains = members.filter((m) => m.role !== "substitute");
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  const checks = [
    { ok: mains.length >= MAX_MAIN, text: `${MAX_MAIN} основных игроков (сейчас ${mains.length})` },
    { ok: !members.some((m) => m.player.is_banned), text: "Нет заблокированных игроков" },
    { ok: t.status === "registration", text: "Регистрация открыта" },
  ];
  const ready = checks.every((c) => c.ok);

  return (
    <Container className="max-w-3xl">
      {header}
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <TeamLogo src={team.logo_url} tag={team.tag} size={52} />
            <div className="flex-1">
              <div className="text-lg font-semibold">{team.name}</div>
              <div className="text-sm text-fg-3">{team.tag}</div>
            </div>
            {reg && (
              <Pill tone={reg.status === "approved" ? "ok" : reg.status === "pending" ? "warn" : "neutral"} dot>
                {registrationStatusLabel[reg.status]}
              </Pill>
            )}
          </div>
          <div className="mt-5 border-t border-line pt-2">
            <RosterList
              slots={7}
              items={members.map((m) => ({
                key: m.id,
                player: m.player,
                role: m.role === "captain" ? "captain" : m.role === "substitute" ? "sub" : "main",
              }))}
            />
          </div>
          <div className="mt-4">
            <Link href="/team" className="text-sm text-accent hover:underline">
              Изменить состав команды →
            </Link>
          </div>
        </Card>

        {!active && (
          <Card className="p-6">
            <div className="label mb-4">Проверка</div>
            <ul className="space-y-2.5">
              {checks.map((c) => (
                <li key={c.text} className="flex items-center gap-3 text-sm">
                  <span className={c.ok ? "text-ok" : "text-danger"}>{c.ok ? "✓" : "✕"}</span>
                  <span className={c.ok ? "text-fg-2" : "text-fg"}>{c.text}</span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {reg?.status === "rejected" && reg.note && <Notice tone="danger">Причина отказа: {reg.note}</Notice>}

        {!isCaptain ? (
          <Notice>Заявку подаёт капитан команды.</Notice>
        ) : active ? (
          <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
            <p className="text-sm text-fg-2">
              {reg.status === "approved"
                ? "Заявка одобрена. Пока регистрация открыта, изменения состава команды автоматически попадают в заявку."
                : "Заявка подана и ждёт решения администратора. Изменения состава автоматически попадают в заявку."}
            </p>
            {t.status === "registration" && (
              <ActionForm action={withdrawRegistration}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <SubmitButton variant="danger" confirm="Отозвать заявку команды?">
                  Отозвать заявку
                </SubmitButton>
              </ActionForm>
            )}
          </Card>
        ) : (
          <ActionForm action={registerTeam}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <SubmitButton size="lg" className="w-full" pendingText="Отправляем заявку…">
              {ready ? "Подать заявку на турнир" : "Подать заявку (проверьте требования)"}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Container>
  );
}
