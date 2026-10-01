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
  bracket_published_at: string | null;
  cover_url: string | null;
  default_best_of: number;
  final_best_of: number;
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

export type MatchStatus = "pending" | "upcoming" | "veto" | "ready" | "live" | "finished" | "cancelled";
export type BracketSide = "upper" | "lower" | "grand_final";

export type Match = {
  id: string;
  tournament_id: string;
  number: number;
  bracket: BracketSide;
  round: number;
  position: number;
  best_of: number;
  status: MatchStatus;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number;
  team2_score: number;
  winner_id: string | null;
  is_walkover: boolean;
  winner_to_match: string | null;
  winner_to_slot: 1 | 2 | null;
  loser_to_match: string | null;
  loser_to_slot: 1 | 2 | null;
  veto_deadline: string | null;
  server_address: string | null;
  server_password: string | null;
  matchzy_id: number | null;
  server_instance: string | null;
  server_state: "assigned" | "loading" | "ready" | "error" | null;
  under_review: boolean;
  scheduled_at: string | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string;
};

export type MatchMap = {
  id: string;
  match_id: string;
  map_number: number;
  map_name: string;
  picked_by: string | null;
  team1_score: number;
  team2_score: number;
  winner_id: string | null;
  status: "pending" | "live" | "finished";
};

export type VetoActionRow = {
  id: string;
  match_id: string;
  step: number;
  team_id: string | null;
  action: "ban" | "pick" | "decider";
  map_name: string;
  auto: boolean;
  actor_id: string | null;
  created_at: string;
};

export type Dispute = {
  id: string;
  match_id: string;
  opened_by: string;
  team_id: string | null;
  reason: string;
  status: "open" | "resolved" | "rejected";
  decision: string | null;
  decided_by: string | null;
  decided_at: string | null;
  result_before: Record<string, unknown> | null;
  result_after: Record<string, unknown> | null;
  created_at: string;
};
