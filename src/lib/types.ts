/**
 * Доменные типы строк базы. Основа — сгенерированные типы Supabase (`database.types.ts`, `npm run db:types`);
 * здесь только сужение того, что база хранит как text/jsonb: строковые статусы до union, jsonb до формы.
 */
import type { Enums, Tables } from "./database.types";
import type { FormatKind } from "./formats";
import type { ModeKey } from "./modes";

/** Заменяет типы полей T на поля O (сужение колонок text/jsonb сгенерированной строки) */
export type Narrow<T, O extends { [K in keyof O]: K extends keyof T ? unknown : never }> = Omit<T, keyof O> & O;

export type TournamentStatus = Enums<"tournament_status">;
export type RegistrationStatus = Enums<"registration_status">;
export type MemberRole = Enums<"member_role">;
export type RosterRole = Enums<"roster_role">;
export type MatchStatus = Enums<"match_status">;
export type BracketSide = Enums<"bracket_side">;

export type Player = Tables<"players">;

export type Team = Tables<"teams">;

export type TeamMember = Tables<"team_members">;

export type TeamMemberWithPlayer = TeamMember & { player: Player };

export type PrizeRow = { place: string; prize: string };

export type Tournament = Narrow<
  Tables<"tournaments">,
  {
    /** CHECK tournaments_format_known — режимы из modes.ts */
    format: ModeKey;
    /** CHECK tournaments_bracket_type_known — ключи FORMATS из formats.ts */
    bracket_type: FormatKind;
    playoff_type: "single_elimination" | "double_elimination";
    prize_distribution: PrizeRow[];
    sponsors: { name: string; url?: string }[];
  }
>;

export type Registration = Tables<"tournament_registrations">;

/** Анкета игрока — персональные данные: только владельцу и админам, никогда в публичные страницы */
export type PlayerProfile = Narrow<
  Tables<"player_profiles">,
  {
    /** CHECK player_profiles_occupation_known */
    occupation: "works" | "studies" | "other" | null;
  }
>;

/** Заявка организации на официальный турнир (Приложение №1) */
export type TournamentApplication = Tables<"tournament_applications">;

export type RosterPlayer = Tables<"tournament_roster_players">;

export type Notification = Tables<"notifications">;

export type AuditLog = Narrow<Tables<"audit_logs">, { payload: Record<string, unknown> }>;

export type Match = Narrow<
  Tables<"matches">,
  {
    winner_to_slot: 1 | 2 | null;
    loser_to_slot: 1 | 2 | null;
    server_state: "assigned" | "loading" | "ready" | "error" | null;
    stage: "group" | "swiss" | "playoff";
  }
>;

/** Поля сетки, которые сверяет и пишет RPC sync_bracket_apply */
export type BracketSyncRow = Pick<Match, "id" | "status" | "team1_id" | "team2_id" | "winner_id" | "is_walkover">;

/** Режим RPC create_stage_matches: первая стадия, плей-офф после групп/швейцарки, следующий тур швейцарки */
export type StageCreateMode = "bracket" | "playoff" | "round";

export type MatchMap = Narrow<Tables<"match_maps">, { status: "pending" | "live" | "finished" }>;

export type VetoActionRow = Narrow<Tables<"veto_actions">, { action: "ban" | "pick" | "decider" }>;

export type Dispute = Narrow<
  Tables<"disputes">,
  {
    status: "open" | "resolved" | "rejected";
    result_before: Record<string, unknown> | null;
    result_after: Record<string, unknown> | null;
  }
>;

// ───────────────────────── jsonb-ответы RPC (в сгенерированных типах это просто Json)

/** recompute_match_series / save_match_map_score */
export type SeriesResult = { tournament_id: string; winner: string | null };

/** sync_bracket_apply */
export type SyncBracketResult = { status: "conflict" } | { status: "ok"; upcoming: string[] };

/** save_registration */
export type SaveRegistrationResult = { id: string; updated: boolean; approved: boolean };

/** claim_ingest */
export type ClaimIngestResult = { status: "done" | "busy" | "claimed"; token?: string };
