import type { TournamentStatus } from "@/lib/types";
import { Status, tournamentStatus } from "@/components/ds";

/** Статус турнира — общий F16 DS status. */
export function TournamentStatusPill({ status }: { status: TournamentStatus }) {
  return <Status info={tournamentStatus[status]} size="sm" />;
}
