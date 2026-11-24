"use client";

import { Scale } from "lucide-react";
import { cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import type { Balance } from "@/lib/twenty-core";

/**
 * Баланс двух составов по рейтингу игроков в «Миксе»: перевес показан словами и стрелкой весов, без процентов —
 * сыгранных игр пока мало, чтобы обещать шанс на победу. Это ориентир для капитанов при разборе игроков.
 */
export function BalanceStrip({ balance, team1, team2 }: { balance: Balance; team1: string; team2: string }) {
  const t = useT();
  const favored = balance.favored === 1 ? team1 : balance.favored === 2 ? team2 : null;
  const tone = balance.level === "even" ? "text-ok" : balance.level === "slight" ? "text-warn" : "text-danger";
  const bg = balance.level === "even" ? "bg-ok" : balance.level === "slight" ? "bg-warn" : "bg-danger";
  // указатель смещается к сильной команде: 0.15 разницы — край шкалы
  const shift = Math.max(-1, Math.min(1, (balance.team2 - balance.team1) / 0.15));
  return (
    <section aria-label={t("Баланс составов")} className="rounded-surface border border-line-subtle bg-surface px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3">
        <div className="min-w-0">
          <div className="truncate text-[13px] font-semibold text-fg-2">{team1}</div>
          <div className={cn("num text-[20px] font-extrabold leading-tight", balance.favored === 1 ? "text-fg" : "text-fg-3")}>{balance.team1.toFixed(2)}</div>
        </div>
        <div className="text-center">
          <div className={cn("inline-flex items-center gap-1.5 text-[14px] font-bold", tone)}>
            <Scale className="size-4" aria-hidden />
            {balance.level === "even" ? t("Составы равны") : balance.level === "slight" ? t("Небольшой перевес у {team}", { team: favored }) : t("Заметный перевес у {team}", { team: favored })}
          </div>
        </div>
        <div className="min-w-0 text-right">
          <div className="truncate text-[13px] font-semibold text-fg-2">{team2}</div>
          <div className={cn("num text-[20px] font-extrabold leading-tight", balance.favored === 2 ? "text-fg" : "text-fg-3")}>{balance.team2.toFixed(2)}</div>
        </div>
      </div>
      <div className="relative mt-2.5 h-1.5 rounded-full bg-ink/[0.07]" aria-hidden>
        <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-y-1/2 bg-line-strong" />
        <span className={cn("absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface transition-[left] duration-500", bg)} style={{ left: `${50 + shift * 46}%` }} />
      </div>
      <p className="mt-2 text-micro text-fg-3">
        {t("Средний рейтинг состава в Миксе. Это ориентир для капитанов, а не прогноз.")}
        {balance.estimated > 0 && ` ${t("У {n} из игроков мало игр в Миксе — их сила оценена по ELO.", { n: balance.estimated })}`}
      </p>
    </section>
  );
}
