import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Users } from "lucide-react";
import type { ReactNode } from "react";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership, getRegistration, getSoloTeam, getTeamMembers, getTournamentBySlug, type RosterEntry } from "@/lib/data";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { getPreviousRoster } from "@/lib/progress";
import { formatDateTime, formatTime } from "@/lib/format";
import type { Registration, TeamMemberWithPlayer, Tournament } from "@/lib/types";
import { ageRangeLabel, checkPlayer, officialRoster } from "@/lib/official";
import { formatPhone, tournamentDay } from "@/lib/profile";
import { getOrganizationSuggestions, getProfile, getProfiles, needsProfile, profileLock } from "@/lib/profiles";
import { db } from "@/lib/supabase";
import { Button, Callout, Container, EmptyState, Eyebrow, FaceitLevel, PageTitle, Panel, PlayerIdentity, Status, Steps, TeamIdentity, registrationStatus, type StepState } from "@/components/ds";
import { RegisterForm, RosterPicker, WithdrawApplication, type PickerMember } from "@/components/competition/registration";
import { OfficialApplicationForm, type ApplicationValues } from "@/components/competition/official-application";
import { ProfileRequired } from "@/components/profile/profile-required";

export const metadata: Metadata = { title: "Регистрация на турнир" };

type Reg = Registration & { roster: RosterEntry[] };
const activeOf = (r: Reg | null) => (r && (r.status === "pending" || r.status === "approved") ? r : null);

export default async function RegisterPage(props: PageProps<"/tournaments/[slug]/register">) {
  const { slug } = await props.params;
  const sp = await props.searchParams;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/register`);
  const open = t.status === "registration" && (!t.registration_closes_at || serverNow() <= new Date(t.registration_closes_at).getTime());
  const fresh = sp.sent === "1";
  const mode = modeOf(t.format);

  // ───── 1×1: участник сам за себя, без командного интерфейса
  if (mode.size === 1) {
    const solo = await getSoloTeam(player, false);
    const reg = solo ? await getRegistration(t.id, solo.id) : null;
    const gated = await needsProfile(player.id);
    return (
      <Shell t={t} open={open}>
        <Panel padded={false}>
          <div className="flex items-center justify-between gap-4 p-4 sm:p-5">
            <PlayerIdentity
              name={player.nickname}
              avatar={player.avatar_url}
              size="lg"
              meta={
                <span className="flex items-center gap-2">
                  Steam подключён <FaceitLevel level={player.faceit_level} />
                  {player.faceit_elo != null && <span className="num">{player.faceit_elo} ELO</span>}
                </span>
              }
            />
            {reg && reg.status !== "withdrawn" && <Status info={registrationStatus[reg.status]} size="sm" />}
          </div>
          {player.is_banned ? (
            <div className="border-t border-line-subtle p-4 sm:p-5">
              <Callout tone="danger" title="Аккаунт заблокирован">
                Участвовать в турнирах нельзя.
              </Callout>
            </div>
          ) : (reg && reg.status !== "withdrawn") ? (
            <div className="border-t border-line-subtle p-4 sm:p-5">
              <ApplicationStatus t={t} reg={reg} open={open} fresh={fresh} solo canEdit={open} />
            </div>
          ) : null}
          {!player.is_banned && open && !activeOf(reg) && (
            <div className="border-t border-line-subtle">
              {gated ? (
                <div className="p-4 sm:p-5">
                  <ProfileRequired next={`/tournaments/${t.slug}/register`} action="участвовать в турнире" />
                </div>
              ) : (
                <RegisterForm tournamentId={t.id} label={reg?.status === "rejected" ? "Подать заявку снова" : "Участвовать"} footer="Турнир 1×1 — команда не нужна." />
              )}
            </div>
          )}
          {!open && !activeOf(reg) && reg?.status !== "rejected" && (
            <div className="border-t border-line-subtle p-4 sm:p-5">
              <Callout>Регистрация закрыта.</Callout>
            </div>
          )}
        </Panel>
        {activeOf(reg) && open && <WithdrawRow tournamentId={t.id} solo />}
      </Shell>
    );
  }

  // ───── командный режим
  const membership = await getActiveMembership(player.id);
  if (!membership) {
    return (
      <Shell t={t} open={open} steps={["current", "todo", "todo"]}>
        <EmptyState
          icon={<Users />}
          title="Для участия нужна команда"
          text={`Соберите команду: в основе ${mainPlayersLabel(mode.size)}${mode.subs ? `, до ${mode.subs} запасных` : ""}. Заявку подаёт капитан.`}
          action={
            open ? (
              <>
                <Button href="/team/create">Создать команду</Button>
                <Button href="/find" variant="secondary">
                  Найти команду
                </Button>
              </>
            ) : undefined
          }
        />
      </Shell>
    );
  }

  const { team } = membership;
  const isCaptain = team.captain_id === player.id;
  const [members, reg] = await Promise.all([getTeamMembers(team.id), getRegistration(t.id, team.id)]);
  const regShown = reg && reg.status !== "withdrawn" ? reg : null;
  const active = activeOf(regShown);
  const captain = members.find((m) => m.player_id === team.captain_id)?.player ?? null;
  const available = members.filter((m) => !m.player.is_banned).length;
  const enough = available >= mode.size;

  const step3: StepState = !regShown ? "todo" : regShown.status === "approved" ? "done" : regShown.status === "rejected" ? "error" : "current";
  const steps: StepState[] = regShown
    ? ["done", "done", step3]
    : isCaptain && open
      ? ["done", enough ? "current" : "error", "todo"]
      : ["done", "todo", "todo"];

  const teamPanel = (
    <Panel className="flex items-center justify-between gap-4">
      <TeamIdentity
        name={team.name}
        tag={team.tag}
        logo={team.logo_url}
        href="/team"
        size="lg"
        meta={`${team.tag}${captain ? ` · капитан ${captain.nickname}` : ""}`}
      />
      {regShown && <Status info={registrationStatus[regShown.status]} size="sm" />}
    </Panel>
  );

  // игрок (не капитан): видит заявку и её статус, без кнопок, которые ему недоступны
  if (!isCaptain) {
    return (
      <Shell t={t} open={open} steps={steps}>
        {teamPanel}
        {t.is_official && <OwnOfficialStatus t={t} playerId={player.id} nickname={player.nickname} />}
        {regShown ? (
          <ApplicationStatus t={t} reg={regShown} open={open} fresh={false} captainName={captain?.nickname} />
        ) : (
          <Callout title={open ? "Заявку подаёт капитан команды" : "Команда не подавала заявку"}>
            {open
              ? `${captain?.nickname ?? "Капитан"} выбирает состав и отправляет заявку. Вам ничего делать не нужно — придёт уведомление, если вы в составе.`
              : "Регистрация на турнир закрыта."}
          </Callout>
        )}
        {regShown && regShown.roster.length > 0 && <ApplicationRoster roster={regShown.roster} captainId={team.captain_id} meId={player.id} />}
      </Shell>
    );
  }

  // капитан, регистрация закрыта: только статус и состав заявки
  if (!open) {
    return (
      <Shell t={t} open={open} steps={steps}>
        {teamPanel}
        {regShown ? (
          <ApplicationStatus t={t} reg={regShown} open={false} fresh={false} />
        ) : (
          <Callout>Регистрация закрыта — заявка не подавалась.</Callout>
        )}
        {regShown && regShown.roster.length > 0 && <ApplicationRoster roster={regShown.roster} captainId={team.captain_id} meId={player.id} />}
      </Shell>
    );
  }

  // капитан, игроков не хватает
  if (!enough) {
    return (
      <Shell t={t} open={open} steps={steps}>
        {teamPanel}
        {regShown && <ApplicationStatus t={t} reg={regShown} open fresh={false} canEdit />}
        <Callout
          tone="warn"
          title={`Нужно минимум ${mainPlayersLabel(mode.size)}`}
          action={
            <Button href="/team?tab=roster" variant="secondary" size="sm">
              Пригласить игроков
            </Button>
          }
        >
          Сейчас в команде доступно {available} из {mode.size}
          {available < members.length ? " (заблокированные игроки не учитываются)" : ""}. Пригласите игроков по ссылке со страницы команды.
        </Callout>
      </Shell>
    );
  }

  // капитан без анкеты (настройка PROFILE_REQUIRED): сначала анкета
  if (await needsProfile(player.id)) {
    return (
      <Shell t={t} open={open} steps={steps}>
        {teamPanel}
        {regShown && <ApplicationStatus t={t} reg={regShown} open fresh={false} canEdit />}
        <ProfileRequired next={`/tournaments/${t.slug}/register`} action="подать заявку на турнир" />
      </Shell>
    );
  }

  // капитан, официальный турнир: состав без запасных, организация, тренер и чек-лист
  if (t.is_official) {
    const form = await officialForm(t, members, team.captain_id, player.id, regShown, active);
    return (
      <Shell t={t} open={open} steps={steps}>
        {teamPanel}
        {regShown && <ApplicationStatus t={t} reg={regShown} open fresh={fresh} canEdit />}
        <section aria-labelledby="application-title">
          <div className="mb-3">
            <h2 id="application-title" className="text-heading text-fg">
              Заявка — Приложение №1
            </h2>
            <p className="mt-1 text-meta text-fg-3">Заявку можно менять, пока открыта регистрация. После закрытия состав меняет только администратор.</p>
          </div>
          <Panel padded={false}>{form}</Panel>
        </section>
        {active && <WithdrawRow tournamentId={t.id} />}
      </Shell>
    );
  }

  // капитан, регистрация открыта: выбор состава и отправка
  const previous = !active ? await getPreviousRoster(team.id, t, members) : null;
  const initial: Record<string, "main" | "sub" | "out"> = {};
  if (active && active.roster.length) {
    for (const r of active.roster) initial[r.player_id] = r.role === "sub" ? "sub" : "main";
  } else if (previous) {
    for (const m of members) initial[m.player_id] = previous.main.includes(m.player_id) ? "main" : previous.sub.includes(m.player_id) ? "sub" : "out";
  } else {
    const ordered = [...members.filter((m) => m.role !== "substitute"), ...members.filter((m) => m.role === "substitute")].filter((m) => !m.player.is_banned);
    ordered.forEach((m, i) => (initial[m.player_id] = i < mode.size ? "main" : i < mode.size + mode.subs ? "sub" : "out"));
  }
  // капитан первым, затем по выбору: основа, запас, остальные
  const rank = (id: string) => (id === team.captain_id ? 0 : initial[id] === "main" ? 1 : initial[id] === "sub" ? 2 : 3);
  const pickerMembers: PickerMember[] = [...members]
    .sort((a, b) => rank(a.player_id) - rank(b.player_id))
    .map((m) => ({
      player_id: m.player_id,
      nickname: m.player.nickname,
      avatar_url: m.player.avatar_url,
      faceit_level: m.player.faceit_level,
      banned: m.player.is_banned,
      captain: m.player_id === team.captain_id,
    }));

  return (
    <Shell t={t} open={open} steps={steps}>
      {teamPanel}
      {regShown && <ApplicationStatus t={t} reg={regShown} open fresh={fresh} canEdit />}

      {previous && (
        <Panel padded={false} className="border-accent/25">
          <div className="p-4 sm:p-5">
            <div className="text-title text-fg">Тем же составом, что на «{previous.tournamentName}»</div>
            <p className="mt-1 text-[14px] text-fg-2">
              Основа: {previous.names.slice(0, previous.main.length).join(", ")}
              {previous.sub.length ? ` · запас: ${previous.names.slice(previous.main.length).join(", ")}` : ""}
            </p>
          </div>
          <div className="border-t border-line-subtle">
            <RegisterForm tournamentId={t.id} label="Подать тем же составом" variant="secondary" footer="Или выберите состав вручную ниже.">
              {previous.main.map((id) => (
                <input key={id} type="hidden" name="main" value={id} />
              ))}
              {previous.sub.map((id) => (
                <input key={id} type="hidden" name="sub" value={id} />
              ))}
            </RegisterForm>
          </div>
        </Panel>
      )}

      <section aria-labelledby="roster-title">
        <div className="mb-3">
          <h2 id="roster-title" className="text-heading text-fg">
            Состав на турнир
          </h2>
          <p className="mt-1 text-meta text-fg-3">
            {mode.title}: в основе {mainPlayersLabel(mode.size)}
            {mode.subs ? `, запасных — до ${mode.subs}` : ""}. Состав можно менять, пока открыта регистрация.
          </p>
        </div>
        <Panel padded={false}>
          <RegisterForm
            tournamentId={t.id}
            mains={mode.size}
            update={!!active}
            label={active ? "Сохранить состав" : regShown?.status === "rejected" ? "Подать заявку снова" : "Подать заявку"}
            pendingLabel={active ? "Сохраняем…" : "Отправляем…"}
            footer={active ? "Изменения сразу попадут в заявку." : t.auto_approve ? "Заявка одобряется автоматически, пока есть места." : "Заявку рассмотрит администратор."}
          >
            <RosterPicker members={pickerMembers} size={mode.size} subs={mode.subs} initial={initial} />
          </RegisterForm>
        </Panel>
      </section>

      {active && <WithdrawRow tournamentId={t.id} />}
    </Shell>
  );
}

// ───────────────────────── части страницы

function Shell({ t, open, steps, children }: { t: Tournament; open: boolean; steps?: StepState[]; children: ReactNode }) {
  const mode = modeOf(t.format);
  const titles = ["Команда", "Состав", "Подтверждение"];
  return (
    <Container width="read" className="pb-16 pt-6 sm:pt-8">
      <Link href={`/tournaments/${t.slug}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-meta text-fg-3 hover:text-fg sm:min-h-0">
        <ChevronLeft className="size-4" aria-hidden />
        {t.name}
      </Link>
      <header className="mt-3">
        <Eyebrow tone={open ? "accent" : "muted"}>{open ? "Регистрация открыта" : "Регистрация закрыта"}</Eyebrow>
        <PageTitle className="mt-1">Заявка на {t.name}</PageTitle>
        <p className="mt-2 text-meta text-fg-3">
          {mode.title}
          {open && t.registration_closes_at ? ` · заявки до ${formatDateTime(t.registration_closes_at)}` : ""}
          {open ? " · после закрытия состав меняет только администратор" : ""}
        </p>
      </header>
      {steps && <Steps direction="horizontal" className="mt-6" steps={titles.map((title, i) => ({ title, state: steps[i] }))} />}
      {t.is_official && (
        <Callout title="Официальный турнир — условия участия" className="mt-6">
          Команда представляет организацию (предприятие, учреждение, вуз, колледж): {mainPlayersLabel(officialRoster(t).size)}
          {t.require_coach ? " и тренер" : ""}
          {officialRoster(t).subs ? `, до ${officialRoster(t).subs} запасных` : ", без запасных — состав в заявке окончательный"}. Возраст участников —{" "}
          {ageRangeLabel(t)} на день турнира, живут, учатся или работают в городе {t.city}. Каждый игрок — только в одной команде. Справки с места
          работы или учёбы сдаются организатору на бумаге.
        </Callout>
      )}
      <div className="mt-6 space-y-5">{children}</div>
    </Container>
  );
}

/** Статус заявки: что с ней сейчас и что дальше */
function ApplicationStatus({
  t,
  reg,
  open,
  fresh,
  solo,
  canEdit,
  captainName,
}: {
  t: Tournament;
  reg: Reg;
  open: boolean;
  fresh: boolean;
  solo?: boolean;
  canEdit?: boolean;
  captainName?: string;
}) {
  const base = `/tournaments/${t.slug}`;
  const window_ = t.checkin_opens_at
    ? `Check-in: ${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? ` – ${formatTime(t.checkin_closes_at)}` : ""}.`
    : "Время check-in объявит администратор — придёт уведомление.";

  if (reg.status === "rejected") {
    return (
      <Callout tone="danger" title="Заявка отклонена">
        {reg.note ? <>Причина: {reg.note}. </> : null}
        {open
          ? canEdit
            ? "Исправьте состав ниже и подайте заявку снова."
            : `${captainName ?? "Капитан"} может исправить заявку и подать её снова, пока открыта регистрация.`
          : "Регистрация закрыта — подать заявку снова уже нельзя."}
      </Callout>
    );
  }

  if (reg.status === "pending") {
    return (
      <Callout tone={fresh ? "ok" : "warn"} title={fresh ? "Заявка отправлена" : "Заявка на рассмотрении"}>
        Заявка на рассмотрении. Администратор проверит {solo ? "заявку" : "состав"} — о решении придёт уведомление
        {solo ? "" : " всем игрокам из заявки"}.
        {open && canEdit && !solo ? " До закрытия регистрации состав можно менять." : ""}
      </Callout>
    );
  }

  // одобрена
  if (reg.checked_in_at) {
    return (
      <Callout tone="ok" title={solo ? "Вы прошли check-in" : "Команда прошла check-in"}>
        Что дальше: ждите публикации сетки и первого матча.
      </Callout>
    );
  }
  return (
    <Callout
      tone="ok"
      title={fresh ? (solo ? "Заявка одобрена — вы в турнире" : "Заявка одобрена — команда в турнире") : "Заявка одобрена"}
      action={
        t.status === "checkin" ? (
          <Button href={`${base}/checkin`} size="sm">
            Перейти к check-in
          </Button>
        ) : undefined
      }
    >
      Следующий шаг — check-in{solo ? "" : " (проходит капитан)"}. {t.status === "checkin" ? "Check-in уже открыт." : window_}
    </Callout>
  );
}

/** Состав заявки — только чтение */
function ApplicationRoster({ roster, captainId, meId }: { roster: RosterEntry[]; captainId: string; meId: string }) {
  const sorted = [...roster].sort((a, b) => (a.player_id === captainId ? -1 : b.player_id === captainId ? 1 : a.role === b.role ? 0 : a.role === "main" ? -1 : 1));
  const mains = roster.filter((r) => r.role === "main").length;
  const subs = roster.length - mains;
  return (
    <section aria-labelledby="app-roster">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h2 id="app-roster" className="text-heading text-fg">
          Состав заявки
        </h2>
        <span className="num text-meta text-fg-3">
          Основа {mains}
          {subs ? ` · запас ${subs}` : ""}
        </span>
      </div>
      <Panel padded={false}>
        <ul className="divide-y divide-line-subtle">
          {sorted.map((r) => (
            <li key={r.id} className="px-4 py-3 sm:px-5">
              <PlayerIdentity
                name={r.player.nickname}
                avatar={r.player.avatar_url}
                href={`/players/${r.player.steam_id}`}
                size="md"
                captain={r.player_id === captainId}
                meta={r.player.is_banned ? <span className="text-danger">Заблокирован</span> : `${r.role === "sub" ? "Запас" : "Основа"}${r.player_id === meId ? " · это вы" : ""}`}
                trailing={<FaceitLevel level={r.player.faceit_level} />}
              />
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}

function WithdrawRow({ tournamentId, solo }: { tournamentId: string; solo?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-surface border border-line-subtle px-4 py-3 sm:px-5">
      <span className="text-meta text-fg-3">{solo ? "Не сможете сыграть?" : "Передумали участвовать?"} Это можно сделать до закрытия регистрации.</span>
      <WithdrawApplication tournamentId={tournamentId} solo={solo} />
    </div>
  );
}


// ───────────────────────── официальный турнир

/**
 * Форма заявки на официальный турнир. Анкеты игроков читаются на сервере, в браузер капитана уходит
 * только итог проверки (ник, что не заполнено, возраст при несоответствии) — не сами данные товарищей.
 */
async function officialForm(t: Tournament, members: TeamMemberWithPlayer[], captainId: string, meId: string, reg: Reg | null, active: Reg | null) {
  const day = tournamentDay(t);
  const { size, subs } = officialRoster(t);
  const [profiles, suggestions, app] = await Promise.all([
    getProfiles(members.map((m) => m.player_id)),
    getOrganizationSuggestions(),
    reg ? db().from("tournament_applications").select("*").eq("registration_id", reg.id).maybeSingle().then((r) => r.data) : Promise.resolve(null),
  ]);
  const checks = members.map((m) => checkPlayer({ id: m.player_id, nickname: m.player.nickname }, profiles.get(m.player_id) ?? null, t, day));

  const initial: Record<string, "main" | "sub" | "out"> = {};
  if (active && active.roster.length) {
    for (const r of active.roster) initial[r.player_id] = r.role === "sub" && subs ? "sub" : "main";
  } else {
    const ordered = [...members.filter((m) => m.role !== "substitute"), ...members.filter((m) => m.role === "substitute")].filter((m) => !m.player.is_banned);
    ordered.forEach((m, i) => (initial[m.player_id] = i < size ? "main" : i < size + subs ? "sub" : "out"));
  }
  const rank = (id: string) => (id === captainId ? 0 : initial[id] === "main" ? 1 : initial[id] === "sub" ? 2 : 3);
  const pickerMembers: PickerMember[] = [...members]
    .sort((a, b) => rank(a.player_id) - rank(b.player_id))
    .map((m) => ({
      player_id: m.player_id,
      nickname: m.player.nickname,
      avatar_url: m.player.avatar_url,
      faceit_level: m.player.faceit_level,
      banned: m.player.is_banned,
      captain: m.player_id === captainId,
    }));
  const own = profiles.get(meId);
  const values: ApplicationValues = {
    organization: app?.organization ?? "",
    captain_phone: formatPhone(app?.captain_phone ?? own?.phone),
    responsible_name: app?.responsible_name ?? "",
    responsible_phone: formatPhone(app?.responsible_phone),
    coach_name: app?.coach_name ?? "",
    coach_birth_date: app?.coach_birth_date ?? "",
    coach_workplace: app?.coach_workplace ?? "",
    coach_position: app?.coach_position ?? "",
  };
  return (
    <OfficialApplicationForm
      tournamentId={t.id}
      settings={t}
      day={day}
      members={pickerMembers}
      initial={initial}
      checks={checks}
      values={values}
      suggestions={suggestions}
      update={!!active}
      label={active ? "Сохранить заявку" : reg?.status === "rejected" ? "Подать заявку снова" : "Подать заявку"}
      footer={active ? "Изменения сразу попадут в заявку." : t.auto_approve ? "Заявка одобряется автоматически, пока есть места." : "Заявку рассмотрит администратор."}
    />
  );
}

/** Игрок официального турнира видит, всё ли в порядке с его анкетой (свои данные — только ему) */
async function OwnOfficialStatus({ t, playerId, nickname }: { t: Tournament; playerId: string; nickname: string }) {
  const [profile, lock] = await Promise.all([getProfile(playerId), profileLock(playerId)]);
  const check = checkPlayer({ id: playerId, nickname }, profile, t, tournamentDay(t));
  if (!check.issues.length) {
    return (
      <Callout tone="ok" title="Ваша анкета в порядке">
        Анкета заполнена, возраст подходит.{check.warnings.length ? ` ${check.warnings[0].replace(`${nickname}: `, "").replace(/^в/, "В")}.` : ""}
      </Callout>
    );
  }
  return (
    <Callout
      tone="warn"
      title="Анкета не проходит условия турнира"
      action={
        lock ? undefined : (
          <Button href={`/me/profile?next=${encodeURIComponent(`/tournaments/${t.slug}/register`)}`} size="sm">
            Открыть анкету
          </Button>
        )
      }
    >
      {check.issues.map((x) => x.replace(`${nickname}: `, "")).join("; ")}. Без этого капитан не сможет подать заявку с вами в составе.
      {lock ? " Анкета зафиксирована — для исправления напишите администратору." : ""}
    </Callout>
  );
}

/** Время сервера на момент отрисовки (динамическая страница) */
function serverNow() {
  return Date.now();
}
