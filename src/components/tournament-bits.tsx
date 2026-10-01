import type { TournamentStatus } from "@/lib/types";
import { TournamentStatusChip } from "./primitives";

/** Статус турнира — общий чип из primitives */
export function TournamentStatusPill({ status }: { status: TournamentStatus }) {
  return <TournamentStatusChip status={status} size="sm" />;
}
