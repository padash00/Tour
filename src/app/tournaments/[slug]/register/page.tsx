import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { registerTeam, withdrawRegistration } from "@/app/actions/tournament";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership, getRegistration, getSoloTeam, getTeamMembers, getTournamentBySlug } from "@/lib/data";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { RosterPicker } from "@/components/roster-picker";
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
  if (t.format === "1v1") {
    const solo = await getSoloTeam(player, false);
    const soloReg = solo ? await getRegistration(t.id, solo.id) : null;
    const soloActive = soloReg && (soloReg.status === "pending" || soloReg.status === "approved");
    return (
      <Container className="max-w-2xl">
        <PageHeader
          eyebrow={<Link href={`/tournaments/${t.slug}`} className="hover:text-fg-2">← {t.name}</Link>}
          title="Участие в дуэлях"
          description="Турнир 1×1 — команда не нужна, вы участвуете сами."
        />
        <Card className="p-6 flex items-center gap-4">
          <TeamLogo src={player.avatar_url} tag={player.nickname} size={56} />
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold truncate">{player.nickname}</div>
            <div className="text-sm text-fg-3">FACEIT {player.faceit_elo ?? "—"} ELO</div>
          </div>
          {soloReg && (
            <Pill tone={soloReg.status === "approved" ? "ok" : soloReg.status === "pending" ? "warn" : "neutral"} dot>
              {registrationStatusLabel[soloReg.status]}
            </Pill>
          )}
        </Card>
        {soloReg?.status === "rejected" && soloReg.note && (
          <div className="mt-4">
            <Notice tone="danger">Причина отказа: {soloReg.note}</Notice>
          </div>
        )}
        <div className="mt-4">
          {t.status !== "registration" ? (
            <Notice>Регистрация закрыта.</Notice>
          ) : soloActive ? (
            <ActionForm action={withdrawRegistration}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton variant="ghost" confirm="Отменить участие в турнире?">
                Отменить участие
              </SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={registerTeam}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="lg" className="w-full" pendingText="Отправляем…">
                Участвовать в турнире
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      </Container>
    );
  }

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
  const mode = modeOf(t.format);
  const active = reg && (reg.status === "pending" || reg.status === "approved");
  const canEdit = isCaptain && t.status === "registration";

  // предвыбор: текущий состав заявки, иначе основа по ролям в команде
  const initial: Record<string, "main" | "sub" | "out"> = {};
  if (active && reg.roster.length) {
    for (const r of reg.roster) initial[r.player_id] = r.role === "sub" ? "sub" : "main";
  } else {
    const ordered = [...members.filter((m) => m.role !== "substitute"), ...members.filter((m) => m.role === "substitute")];
    ordered.forEach((m, i) => (initial[m.player_id] = i < mode.size ? "main" : i < mode.size + mode.subs ? "sub" : "out"));
  }
  const enough = members.filter((m) => !m.player.is_banned).length >= mode.size;

  return (
    <Container className="max-w-3xl">
      {header}
      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center gap-4">
            <TeamLogo src={team.logo_url} tag={team.tag} size={52} />
            <div className="flex-1">
              <div className="text-lg font-semibold">{team.name}</div>
              <div className="text-sm text-fg-3">
                {mode.title} · в основе {mainPlayersLabel(mode.size)}
                {mode.subs ? `, до ${mode.subs} запасн.` : ""}
              </div>
            </div>
            {reg && (
              <Pill tone={reg.status === "approved" ? "ok" : reg.status === "pending" ? "warn" : "neutral"} dot>
                {registrationStatusLabel[reg.status]}
              </Pill>
            )}
          </div>
        </Card>

        {reg?.status === "rejected" && reg.note && <Notice tone="danger">Причина отказа: {reg.note}</Notice>}

        {!isCaptain ? (
          <Notice>Заявку подаёт капитан команды.</Notice>
        ) : !enough ? (
          <EmptyState
            icon={<IconUsers />}
            title={`Нужно минимум ${mainPlayersLabel(mode.size)}`}
            description={`Сейчас в команде ${members.length}. Пригласите игроков по ссылке со страницы команды.`}
            action={<ButtonLink href="/team">Моя команда</ButtonLink>}
          />
        ) : canEdit ? (
          <ActionForm action={registerTeam}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <Card className="p-6">
              <div className="label mb-3">Состав на турнир</div>
              <RosterPicker
                size={mode.size}
                subs={mode.subs}
                initial={initial}
                members={members.map((m) => ({
                  player_id: m.player_id,
                  nickname: m.player.nickname,
                  avatar_url: m.player.avatar_url,
                  faceit_level: m.player.faceit_level,
                  banned: m.player.is_banned,
                }))}
              />
            </Card>
            <div className="mt-4 flex flex-col sm:flex-row gap-3">
              <SubmitButton size="lg" className="flex-1" pendingText="Сохраняем…">
                {active ? "Сохранить состав заявки" : "Подать заявку на турнир"}
              </SubmitButton>
            </div>
            {active && (
              <p className="mt-3 text-sm text-fg-3">
                {reg.status === "approved" ? "Заявка одобрена." : "Заявка ждёт решения администратора."} Состав можно менять, пока
                открыта регистрация.
              </p>
            )}
          </ActionForm>
        ) : (
          <Card className="p-6">
            <div className="label mb-2">Состав заявки</div>
            {reg?.roster.length ? (
              <RosterList
                items={reg.roster.map((r) => ({ key: r.id, player: r.player, role: r.player_id === team.captain_id ? "captain" : r.role }))}
              />
            ) : (
              <p className="text-sm text-fg-3">Регистрация закрыта.</p>
            )}
          </Card>
        )}

        {active && canEdit && (
          <ActionForm action={withdrawRegistration}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <SubmitButton variant="ghost" confirm="Отозвать заявку команды?">
              Отозвать заявку
            </SubmitButton>
          </ActionForm>
        )}
      </div>
    </Container>
  );
}
