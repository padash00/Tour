export type TournamentStatus =
  | "draft"
  | "registration"
  | "registration_closed"
  | "checkin"
  | "live"
  | "finished"
  | "cancelled";

export type RegistrationStatus = "pending" | "approved" | "rejected" | "withdrawn";
export type MemberRole = "captain" | "player" | "substitute";
export type RosterRole = "main" | "sub";

export type Player = {
  id: string;
  steam_id: string;
  nickname: string;
  avatar_url: string | null;
  profile_url: string | null;
  country: string | null;
  is_admin: boolean;
  is_banned: boolean;
  faceit_id: string | null;
  faceit_nickname: string | null;
  faceit_level: number | null;
  faceit_elo: number | null;
  faceit_updated_at: string | null;
  created_at: string;
  last_login_at: string | null;
};

export type Team = {
  id: string;
  name: string;
  tag: string;
  region: string | null;
  description: string | null;
  logo_url: string | null;
  captain_id: string;
  invite_code: string;
  created_at: string;
  disbanded_at: string | null;
};

export type TeamMember = {
  id: string;
  team_id: string;
  player_id: string;
  role: MemberRole;
  joined_at: string;
  left_at: string | null;
};

export type TeamMemberWithPlayer = TeamMember & { player: Player };

export type PrizeRow = { place: string; prize: string };

export type Tournament = {
  id: string;
  slug: string;
  name: string;
  game: string;
  format: string;
  bracket_type: string;
  max_teams: number;
  status: TournamentStatus;
  starts_at: string | null;
  registration_opens_at: string | null;
  registration_closes_at: string | null;
  checkin_opens_at: string | null;
  checkin_closes_at: string | null;
  location: string | null;
  is_lan: boolean;
  prize_pool: string | null;
  prize_distribution: PrizeRow[];
  match_format: string | null;
  map_pool: string[];
  description: string | null;
  rules: string | null;
  requirements: string | null;
  created_at: string;
  updated_at: string;
};

export type Registration = {
  id: string;
  tournament_id: string;
  team_id: string;
  status: RegistrationStatus;
  seed: number | null;
  note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  checked_in_at: string | null;
  checked_in_by: string | null;
  created_at: string;
};

export type RosterPlayer = {
  id: string;
  registration_id: string;
  tournament_id: string;
  player_id: string;
  role: RosterRole;
};

export type Notification = {
  id: string;
  player_id: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export type AuditLog = {
  id: string;
  actor_id: string | null;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
};
