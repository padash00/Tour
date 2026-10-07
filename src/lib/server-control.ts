import "server-only";

/*
 * Управление серверами CS2 через F16 Server Agent. Код разнесён по модулям src/lib/server/:
 *   state.ts           — авторизация агента и MatchZy, типы, состояние серверов, очередь команд;
 *   admins.ts          — админы сайта (общий кэш на минуту);
 *   matchzy-config.ts  — конфиг матча для MatchZy и настройки режима;
 *   agent-sync.ts      — отчёт агента, выдача команд, подтверждения;
 *   matchzy-events.ts  — события MatchZy (счёт, статистика, сетка);
 *   autopilot.ts       — назначение серверов, автопилот турниров, закрытие матчей;
 *   workshop.ts        — библиотека Workshop-карт и прогрев;
 *   watchdog.ts        — сторож зависших команд, загрузок и пропавших матчей;
 *   auto-maintenance.ts — обновление CS2 и ночной перезапуск без людей;
 *   ops.ts             — дедупликация досылки, версия CS2, события агента, самопроверка.
 * Этот файл оставлен для прежних импортов.
 */

export {
  AGENT_OFFLINE_AFTER_MS,
  MATCHZY_HEADER,
  checkBearer,
  enqueueCommand,
  getServerState,
  type AgentCommand,
  type ServerHost,
  type ServerInstance,
} from "./server/state";
export { adminIds, adminPlayers } from "./server/admins";
export { buildMatchzyConfig, isAimMap, modeCvars } from "./server/matchzy-config";
export { ackCommand, applyAgentReport, takePendingCommands, type AgentReport } from "./server/agent-sync";
export { handleMatchzyEvent, matchzyIdAccepted } from "./server/matchzy-events";
export {
  assignServer,
  autopilotTick,
  closeMatchesOfEndedTournaments,
  enqueuePrefetch,
  enqueueSelfCheck,
  lobbyServersTick,
  pickFreeInstance,
} from "./server/autopilot";
export { expectedMapName, verifyWorkshopLibrary, workshopInfo, type WorkshopInfo } from "./server/workshop";
export { expireStaleWork, reconcileLiveMatches } from "./server/watchdog";
export { autoMaintenanceTick } from "./server/auto-maintenance";
