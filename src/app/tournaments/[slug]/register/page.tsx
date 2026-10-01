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
import { Avatar, FaceitLevel, IconArrow, TeamLogo } from "@/components/ui";
import { Button, Flow, FlowHeader, StatusChip, Step } from "@/components/primitives";
import { Callout } from "@/components/public/callout";
import type { RegistrationStatus } from "@/lib/types";

const regTone = (s: RegistrationStatus) => (s === "approved" ? "ok" : s === "pending" ? "warn" : s === "rejected" ? "danger" : "muted");

export const metadata: Metadata = { title: "Регистрация на турнир" };

export default async function RegisterPage(props: PageProps<"/tournaments/[slug]/register">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/register`);
  const back = (
    <Link href={`/tournaments/${t.slug}`} className="inline-flex min-h-11 items-center lg:min-h-0 hover:text-fg-2">
      ← {t.name}
    </Link>
  );

  if (t.format === "1v1") {
    const solo = await getSoloTeam(player, false);
    const soloReg = solo ? await getRegistration(t.id, solo.id) : null;
    const soloActive = soloReg && (soloReg.status === "pending" || soloReg.status === "approved");
    return (
      <Flow>
        <FlowHeader back={back} title={`Регистрация на ${t.name}`} description="Турнир 1×1 — команда не нужна, вы участвуете сами." />
        <Step n={1} title="Участник" done>
          <div className="flex items-center gap-4">
            <Avatar src={player.avatar_url} name={player.nickname} size={48} />
            <div className="flex-1 min-w-0">
              <div className="text-lg font-semibold truncate">{player.nickname}</div>
              <div className="flex items-center gap-2 text-sm text-fg-3">
                <span className="text-ok">Steam ✓</span>
                <span>·</span>
                <FaceitLevel level={player.faceit_level} />
                <span className="num">{player.faceit_elo ?? "—"} ELO</span>
              </div>
            </div>
            {soloReg && (
              <StatusChip tone={regTone(soloReg.status)} size="sm">
                {registrationStatusLabel[soloReg.status]}
              </StatusChip>
            )}
          </div>
        </Step>
        <Step n={2} title="Подтверждение" done={!!soloActive}>
          {soloReg?.status === "rejected" && soloReg.note && (
            <div className="mb-4">
              <Callout tone="danger" title="Заявка отклонена">
                {soloReg.note}
              </Callout>
            </div>
          )}
          {t.status !== "registration" ? (
            <Callout>Регистрация закрыта.</Callout>
          ) : soloActive ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <Callout tone="ok" className="flex-1">
                {soloReg.status === "approved" ? "Вы в турнире. Ждём вас на check-in." : "Заявка подана — администратор скоро её рассмотрит."}
              </Callout>
              <ActionForm action={withdrawRegistration}>
                <input type="hidden" name="tournamentId" value={t.id} />
                <SubmitButton variant="ghost" size="sm" confirm="Отменить участие в турнире?">
                  Отменить участие
                </SubmitButton>
              </ActionForm>
            </div>
          ) : (
            <ActionForm action={registerTeam}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="lg" className="h-[56px] w-full text-[16px]" pendingText="Отправляем…">
                Подать заявку
              </SubmitButton>
            </ActionForm>
          )}
        </Step>
      </Flow>
    );
  }

  const membership = await getActiveMembership(player.id);
  const description = `Регистрация открыта до ${formatDateTime(t.registration_closes_at)}. После закрытия состав меняет только администратор.`;

  if (!membership) {
    return (
      <Flow>
        <FlowHeader back={back} title={`Регистрация на ${t.name}`} description={description} />
        <Step n={1} title="Команда">
          <p className="text-sm text-fg-2 mb-5">Создайте команду и пригласите игроков по ссылке — затем капитан подаёт заявку.</p>
          <Button href="/team/create" size="lg" iconRight={<IconArrow />}>
            Создать команду
          </Button>
        </Step>
        <Step n={2} title="Состав" muted />
        <Step n={3} title="Подтверждение" muted />
      </Flow>
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
  const captain = members.find((m) => m.player_id === team.captain_id)?.player;

  return (
    <Flow>
      <FlowHeader back={back} title={`Регистрация на ${t.name}`} description={description} />

      <Step n={1} title="Команда" done>
        <div className="flex items-center gap-4">
          <TeamLogo src={team.logo_url} tag={team.tag} size={48} />
          <div className="flex-1 min-w-0">
            <div className="text-lg font-semibold truncate">{team.name}</div>
            <div className="text-sm text-fg-3">
              {team.tag}
              {captain ? ` · капитан ${captain.nickname}` : ""}
            </div>
          </div>
          {reg && (
            <StatusChip tone={regTone(reg.status)} size="sm">
              {registrationStatusLabel[reg.status]}
            </StatusChip>
          )}
        </div>
      </Step>

      {!isCaptain ? (
        <Step n={2} title="Состав">
          <Callout>Заявку подаёт капитан команды — вам ничего делать не нужно.</Callout>
          {reg?.roster.length ? (
            <div className="mt-4">
              <RosterList
                items={reg.roster.map((r) => ({ key: r.id, player: r.player, role: r.player_id === team.captain_id ? "captain" : r.role }))}
              />
            </div>
          ) : null}
        </Step>
      ) : !enough ? (
        <>
          <Step n={2} title={`Нужно минимум ${mainPlayersLabel(mode.size)}`}>
            <p className="text-sm text-fg-2 mb-5">Сейчас в команде {members.length}. Пригласите игроков по ссылке со страницы команды.</p>
            <Button href="/team" variant="secondary" size="md" iconRight={<IconArrow />}>
              Пригласить игроков
            </Button>
          </Step>
          <Step n={3} title="Подтверждение" muted />
        </>
      ) : canEdit ? (
        <ActionForm action={registerTeam}>
          <input type="hidden" name="tournamentId" value={t.id} />
          {reg?.status === "rejected" && reg.note && (
            <div className="py-4">
              <Callout tone="danger" title="Заявка отклонена">
                {reg.note}
              </Callout>
            </div>
          )}
          <Step n={2} title="Состав">
            <p className="-mt-2 mb-4 text-sm text-fg-3">
              {mode.title} · в основе {mainPlayersLabel(mode.size)}
              {mode.subs ? `, до ${mode.subs} запасн.` : ""}
            </p>
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
          </Step>
          <Step n={3} title="Подтверждение" done={!!active}>
            {active && (
              <Callout tone={reg.status === "approved" ? "ok" : "neutral"} className="mb-5">
                {reg.status === "approved" ? "Заявка одобрена." : "Заявка ждёт решения администратора."} Состав можно менять, пока открыта
                регистрация.
              </Callout>
            )}
            <SubmitButton size="lg" className="h-[56px] w-full text-[16px]" pendingText="Сохраняем…">
              {active ? "Сохранить состав" : "Подать заявку"}
            </SubmitButton>
          </Step>
        </ActionForm>
      ) : (
        <Step n={2} title="Состав заявки">
          {reg?.roster.length ? (
            <RosterList
              items={reg.roster.map((r) => ({ key: r.id, player: r.player, role: r.player_id === team.captain_id ? "captain" : r.role }))}
            />
          ) : (
            <p className="text-sm text-fg-3">Регистрация закрыта.</p>
          )}
        </Step>
      )}

      {active && canEdit && (
        <div className="mt-6 flex items-center justify-between gap-4 rounded-[12px] border border-white/[0.06] px-6 py-4">
          <span className="text-[13px] text-fg-3">Передумали участвовать?</span>
          <ActionForm action={withdrawRegistration}>
            <input type="hidden" name="tournamentId" value={t.id} />
            <SubmitButton variant="ghost" size="sm" confirm="Отозвать заявку команды?">
              Отозвать заявку
            </SubmitButton>
          </ActionForm>
        </div>
      )}
    </Flow>
  );
}
