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
import { Flow, FlowHeader, Step } from "@/components/public/flow";
import { Avatar, ButtonLink, FaceitLevel, Notice, Pill, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Регистрация на турнир" };

export default async function RegisterPage(props: PageProps<"/tournaments/[slug]/register">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/register`);
  const back = (
    <Link href={`/tournaments/${t.slug}`} className="hover:text-fg-2">
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
              <Pill tone={soloReg.status === "approved" ? "ok" : soloReg.status === "pending" ? "warn" : "neutral"}>
                {registrationStatusLabel[soloReg.status]}
              </Pill>
            )}
          </div>
        </Step>
        <Step n={2} title="Подтверждение" done={!!soloActive}>
          {soloReg?.status === "rejected" && soloReg.note && (
            <div className="mb-4">
              <Notice tone="danger">Причина отказа: {soloReg.note}</Notice>
            </div>
          )}
          {t.status !== "registration" ? (
            <Notice>Регистрация закрыта.</Notice>
          ) : soloActive ? (
            <div className="flex flex-wrap items-center gap-4">
              <span className="text-sm text-fg-2">Заявка подана.</span>
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
              <SubmitButton size="lg" className="w-full" pendingText="Отправляем…">
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
          <ButtonLink href="/team/create">Создать команду</ButtonLink>
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
            <Pill tone={reg.status === "approved" ? "ok" : reg.status === "pending" ? "warn" : "neutral"}>
              {registrationStatusLabel[reg.status]}
            </Pill>
          )}
        </div>
      </Step>

      {!isCaptain ? (
        <Step n={2} title="Состав">
          <Notice>Заявку подаёт капитан команды.</Notice>
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
            <ButtonLink href="/team" variant="secondary">
              Пригласить игроков
            </ButtonLink>
          </Step>
          <Step n={3} title="Подтверждение" muted />
        </>
      ) : canEdit ? (
        <ActionForm action={registerTeam}>
          <input type="hidden" name="tournamentId" value={t.id} />
          {reg?.status === "rejected" && reg.note && (
            <div className="py-4">
              <Notice tone="danger">Причина отказа: {reg.note}</Notice>
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
              <p className="mb-4 text-sm text-fg-3">
                {reg.status === "approved" ? "Заявка одобрена." : "Заявка ждёт решения администратора."} Состав можно менять, пока открыта
                регистрация.
              </p>
            )}
            <SubmitButton size="lg" className="w-full" pendingText="Сохраняем…">
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
        <div className="pt-8 mt-8 border-t border-line">
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
