import "server-only";
import { autoMaintenanceTick } from "./auto-maintenance";
import { autopilotTick, closeMatchesOfEndedTournaments, lobbyServersTick } from "./autopilot";
import { expireStaleWork, resyncLiveBrackets } from "./watchdog";
import { verifyWorkshopLibrary } from "./workshop";
import { applyDueVetoTimeouts } from "../matches";
import { lobbyTick } from "../lobby";
import { refreshStaleProfilesTick } from "../profile-sync";
import { checkCs2UpToDate, pruneIngest } from "./ops";

export type AgentJobLane = "dispatch" | "maintenance";
export type SafeJob = (name: string, job: () => Promise<unknown>) => Promise<void>;

/** Dispatch creates time-sensitive match commands; maintenance has no bearing on command delivery. */
export async function runAgentJobs(lane: AgentJobLane, safely: SafeJob, cs2Patch: unknown) {
  if (lane === "dispatch") {
    await safely("veto timeouts", applyDueVetoTimeouts);
    await safely("autopilot", autopilotTick);
    await safely("lobby", lobbyTick);
    await safely("lobby servers", lobbyServersTick);
    return;
  }
  await safely("watchdog", expireStaleWork);
  await safely("bracket resync", resyncLiveBrackets);
  await safely("workshop check", verifyWorkshopLibrary);
  await safely("close ended", () => closeMatchesOfEndedTournaments());
  await safely("cs2 version", () => checkCs2UpToDate(cs2Patch));
  await safely("dedupe prune", pruneIngest);
  await safely("profile sync", refreshStaleProfilesTick);
  await safely("auto maintenance", autoMaintenanceTick);
}
