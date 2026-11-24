import Link from "next/link";
import { buttonClass, cn } from "@/components/ds";
import { MapThumb } from "@/components/lobby/settings";
import type { T } from "@/lib/i18n/core";
import { playersNeeded, potBank, type LobbySettings } from "@/lib/lobby-settings";
import { mapLabel } from "@/lib/maps";
import { money } from "./money";

export type LiveGame = {
  code: string;
  status: string;
  settings: LobbySettings;
  host: { nickname: string } | null;
  pool: number;
  game: { status: string; team1_score: number; team2_score: number; map: string | null } | null;
};

/**
 * Игры на банк, которые идут или набирают игроков прямо сейчас, — крупно, первым экраном раздела.
 * Набор: сколько человек уже есть и сколько осталось; игра — карта и счёт. Одна кнопка: войти или смотреть.
 */
export function LiveGames({ games, images, t, mineCode }: { games: LiveGame[]; images: Record<string, string>; t: T; mineCode: string | null }) {
  if (!games.length) return null;
  return (
    <section aria-label={t("Идут сейчас")} className={cn("grid gap-3", games.length > 1 && "lg:grid-cols-2")}>
      {games.map((l) => {
        const playing = l.status === "playing";
        const need = playersNeeded(l.settings);
        const left = Math.max(0, need - l.pool);
        const map = l.game?.map ?? l.settings.maps[0] ?? "de_mirage";
        const bank = l.settings.pot_fee > 0 ? potBank(l.settings) : 0;
        const mine = mineCode === l.code;
        return (
          <Link key={l.code} href={`/lobby/${l.code}`} className={cn("group block overflow-hidden rounded-surface border-2 transition-colors", playing ? "border-live/60 hover:border-live" : "border-accent/60 hover:border-accent")}>
            <MapThumb map={map} image={images[map]} className="min-h-[168px]">
              <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/60 to-black/30" />
              <div className="relative flex min-h-[168px] flex-col justify-between gap-x-8 gap-y-4 p-5 sm:flex-row sm:items-center sm:p-6">
                <div className="min-w-0 sm:flex-1">
                  <div className={cn("inline-flex items-center gap-2 whitespace-nowrap rounded-chip px-2.5 py-1 text-micro font-bold uppercase tracking-[0.14em]", playing ? "bg-live text-white" : "bg-accent text-accent-ink")}>
                    <span className="relative flex size-2">
                      <span className="absolute inline-flex size-full animate-ping rounded-full bg-current opacity-70" />
                      <span className="relative inline-flex size-2 rounded-full bg-current" />
                    </span>
                    {playing ? t("Идёт игра") : t("Идёт набор")}
                  </div>
                  <div className="mt-3 text-[26px] font-extrabold leading-tight text-white sm:truncate sm:text-[32px]">
                    {playing && l.game ? `${mapLabel(map)} · ${l.game.team1_score}:${l.game.team2_score}` : left > 0 ? t.plural(left, "Нужен ещё {n} игрок", "Нужны ещё {n} игрока", "Нужно ещё {n} игроков").replace("{n}", String(left)) : t("Все в сборе — скоро начало")}
                  </div>
                  <div className="num mt-1.5 text-[14px] text-white/80">
                    #{l.code} · {l.host?.nickname ?? "—"} · {t("{n} игроков", { n: need })} · BO{l.settings.best_of}
                    {bank > 0 && ` · ${t("банк {sum}", { sum: money(bank, t) })}`}
                  </div>
                  {!playing && (
                    <div className="mt-3 flex max-w-[420px] items-center gap-3">
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/20" aria-hidden>
                        <span className="block h-full rounded-full bg-accent" style={{ width: `${Math.min(100, Math.round((100 * l.pool) / Math.max(1, need)))}%` }} />
                      </span>
                      <span className="num shrink-0 text-[14px] font-bold text-white">
                        {l.pool}/{need}
                      </span>
                    </div>
                  )}
                </div>
                <span className={cn(buttonClass("primary", "lg"), "w-full shrink-0 px-7 text-[16px] sm:w-auto", playing && "!bg-live !text-white")}>{mine ? t("Вернуться в лобби") : playing ? t("Смотреть") : t("Войти в игру")}</span>
              </div>
            </MapThumb>
          </Link>
        );
      })}
    </section>
  );
}
