import "server-only";
import { getTournamentRegistrations, isActiveRegistration, type RegistrationWithTeam } from "./data";
import { checkPlayer, coachAgeWarning, positionCell, type ExportTeam } from "./official";
import { ageOn, formatPhone, fullName, tournamentDay, workplaceOf } from "./profile";
import { getProfiles } from "./profiles";
import { db } from "./supabase";
import type { PlayerProfile, Tournament, TournamentApplication } from "./types";

/*
 * Данные официального турнира для F16 Control: заявки, анкеты участников, отметки документов.
 * Только для админских страниц и выгрузок (requireAdmin) — каждый просмотр пишется в журнал.
 */

export type OfficialParticipant = {
  key: string;
  role: "captain" | "player" | "sub" | "coach";
  /** у тренера аккаунта нет */
  playerId: string | null;
  nickname: string | null;
  name: string;
  birthDate: string | null;
  age: number | null;
  organization: string;
  position: string;
  phone: string;
  documents: boolean;
  issues: string[];
  warnings: string[];
};

export type OfficialTeam = {
  registration: RegistrationWithTeam;
  application: TournamentApplication | null;
  participants: OfficialParticipant[];
  /** участники без сданных документов */
  missingDocs: number;
  /** чего не хватает в заявке организации */
  applicationIssues: string[];
};

export type OfficialData = {
  day: string;
  teams: OfficialTeam[];
  profiles: Map<string, PlayerProfile>;
  docs: Set<string>;
};

/** Активные заявки (на рассмотрении и одобренные) с участниками, анкетами и документами */
export async function loadOfficial(t: Tournament): Promise<OfficialData> {
  const day = tournamentDay(t);
  const regs = (await getTournamentRegistrations(t.id)).filter(isActiveRegistration);
  const [profiles, appsRes, docsRes] = await Promise.all([
    getProfiles(regs.flatMap((r) => r.roster.map((p) => p.player_id))),
    db().from("tournament_applications").select("*").eq("tournament_id", t.id),
    db().from("tournament_participant_documents").select("player_id").eq("tournament_id", t.id),
  ]);
  const apps = new Map((appsRes.data ?? []).map((a) => [a.registration_id, a]));
  const docs = new Set((docsRes.data ?? []).map((d) => d.player_id));

  const teams = regs.map((r): OfficialTeam => {
    const application = apps.get(r.id) ?? null;
    const roster = [...r.roster].sort((a, b) => Number(b.player_id === r.team.captain_id) - Number(a.player_id === r.team.captain_id) || (a.role === b.role ? 0 : a.role === "main" ? -1 : 1));
    const participants: OfficialParticipant[] = roster.map((p) => {
      const profile = profiles.get(p.player_id) ?? null;
      const check = checkPlayer({ id: p.player_id, nickname: p.player.nickname }, profile, t, day);
      return {
        key: p.player_id,
        role: p.player_id === r.team.captain_id ? "captain" : p.role === "sub" ? "sub" : "player",
        playerId: p.player_id,
        nickname: p.player.nickname,
        name: fullName(profile),
        birthDate: profile?.birth_date ?? null,
        age: profile?.birth_date ? ageOn(profile.birth_date, day) : null,
        organization: workplaceOf(profile),
        position: positionCell(profile),
        phone: formatPhone(profile?.phone),
        documents: docs.has(p.player_id),
        issues: check.issues.map((x) => x.replace(`${p.player.nickname}: `, "")),
        warnings: check.warnings.map((x) => x.replace(`${p.player.nickname}: `, "")),
      };
    });
    if (application?.coach_name || t.require_coach) {
      const warning = coachAgeWarning(t, application?.coach_birth_date ?? null, day);
      participants.push({
        key: `coach:${r.id}`,
        role: "coach",
        playerId: null,
        nickname: null,
        name: application?.coach_name ?? "",
        birthDate: application?.coach_birth_date ?? null,
        age: application?.coach_birth_date ? ageOn(application.coach_birth_date, day) : null,
        organization: application?.coach_workplace ?? "",
        position: application?.coach_position ?? "",
        phone: "",
        documents: !!application?.coach_documents_at,
        issues: application?.coach_name ? [] : ["тренер не указан"],
        warnings: warning ? [warning] : [],
      });
    }
    const applicationIssues: string[] = [];
    if (!application) applicationIssues.push("нет данных заявки (организация, ответственное лицо)");
    else {
      if (!application.responsible_name || !application.responsible_phone) applicationIssues.push("ответственное лицо");
      if (!application.captain_phone) applicationIssues.push("телефон капитана");
    }
    return { registration: r, application, participants, missingDocs: participants.filter((p) => !p.documents).length, applicationIssues };
  });
  return { day, teams, profiles, docs };
}

/** Текст подтверждения одобрения, если команде чего-то не хватает (пусто — всё в порядке) */
export function approveWarningOf(team: OfficialTeam): string | undefined {
  const issues = team.participants.filter((p) => p.issues.length).length;
  const parts = [team.missingDocs ? `не сданы документы: ${team.missingDocs}` : "", issues ? `проблемы с анкетами: ${issues}` : ""].filter(Boolean);
  if (!parts.length) return undefined;
  return `У команды ${team.registration.team.name} ${parts.join(", ")}. По положению команда без полного комплекта документов не допускается. Всё равно одобрить?`;
}

/** Команды для выгрузки в Excel / печати заявок */
export function exportTeams(data: OfficialData): ExportTeam[] {
  return data.teams.map((t) => ({
    team: t.registration.team.name,
    status: t.registration.status,
    application: t.application,
    players: t.registration.roster.map((p) => ({
      nickname: p.player.nickname,
      captain: p.player_id === t.registration.team.captain_id,
      profile: data.profiles.get(p.player_id) ?? null,
      documents: data.docs.has(p.player_id),
    })),
  }));
}
