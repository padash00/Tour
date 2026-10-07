import { z } from "zod";

const matchId = z.preprocess((value) => {
  if (value === null || value === "" || value === "none" || value === -1 || value === "-1") return null;
  return typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
}, z.number().int().nonnegative().nullable()).optional();

export const agentReportSchema = z.object({
  protocol: z.number().int().min(1).max(3).optional(),
  lan_ip: z.string().max(128).optional(),
  info: z.record(z.string(), z.unknown()).optional(),
  instances: z.array(z.object({
    name: z.string().regex(/^CS2-\d{2}$/),
    running: z.boolean(),
    map: z.string().max(256).nullable().optional(),
    players: z.number().int().min(0).max(256).nullable().optional(),
    get5: z.object({
      gamestate: z.string().max(64).optional(),
      matchid: matchId,
      map_number: z.number().int().nullable().optional(),
    }).nullable().optional(),
  })).max(32).optional(),
  events: z.array(z.object({
    type: z.enum(["recovered", "recovery_failed", "recovery_started"]),
    instance: z.string().max(64),
    matchzy_id: z.number().int().nullable().optional(),
    detail: z.string().max(4000).optional(),
    at: z.string().max(64).optional(),
    id: z.string().max(64).optional(),
  })).max(500).optional(),
});

export type SyncMetrics = {
  at: string;
  duration_ms: number;
  phases: { name: string; ms: number; ok: boolean }[];
};
