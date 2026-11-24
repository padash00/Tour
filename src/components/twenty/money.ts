import type { T } from "@/lib/i18n/core";

/** 15000 → «15 000 тг» */
export const money = (n: number, t: T) => t("{n} тг", { n: n.toLocaleString("ru-RU").replace(/\u00a0/g, " ") });
