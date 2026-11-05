import "server-only";
import { autoMaintenanceTick } from "./auto-maintenance";
import { autopilotTick, closeMatchesOfEndedTournaments, lobbyServersTick } from "./autopilot";
import { expireStaleWork, resyncLiveBrackets } from "./watchdog";
import { verifyWorkshopLibrary } from "./workshop";
import { applyDueVetoTimeouts } from "../matches";
import { hallTick } from "../hall";
import { postMatchResults } from "../tg-match-result";
import { captchaSweepTick } from "../tg-moderation";
import { captainLinkRemindTick, groupLinkRemindTick } from "../tg-link-gate";
import { talkOpenTick } from "../tg-buddy";
import { lobbyTick } from "../lobby";
import { refreshStaleProfilesTick } from "../profile-sync";
import { checkCs2UpToDate, pruneIngest } from "./ops";
import { balanceServersTick } from "./server-balance";

export type AgentJobLane = "dispatch" | "maintenance";
export type SafeJob = (name: string, job: () => Promise<unknown>) => Promise<void>;

/** Dispatch creates time-sensitive match commands; maintenance has no bearing on command delivery. */
export async function runAgentJobs(lane: AgentJobLane, safely: SafeJob, cs2Patch: unknown) {
  if (lane === "dispatch") {
    // сначала поделить свободные серверы между турнирами и лобби, затем назначать
    await safely("server balance", balanceServersTick);
    await safely("veto timeouts", applyDueVetoTimeouts);
    await safely("autopilot", autopilotTick);
    await safely("hall seating", hallTick);
    await safely("lobby", lobbyTick);
    await safely("lobby servers", lobbyServersTick);
    // Telegram — в конце: медленный ответ сайта или Telegram не задерживает раздачу серверов
    await safely("tg match results", postMatchResults);
    await safely("tg captcha", captchaSweepTick);
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
  // капитанам раз в день — кто из состава ещё не подтвердил Telegram
  await safely("tg captain remind", captainLinkRemindTick);
  await safely("tg link remind", () => groupLinkRemindTick());
  // бот-участник сам начинает разговор, если в «болтательных» темах давно тихо
  await safely("tg talk open", talkOpenTick);
}
