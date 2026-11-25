import Link from "next/link";
import { Avatar, cn } from "@/components/ds";
import { RankBadge } from "@/components/public/data-table";
import type { T } from "@/lib/i18n/core";
import { weaponBoards, type TwentyRow } from "@/lib/twenty-core";
import type { TwentyPlayer } from "@/lib/twenty";
import { CellGrid, SectionHead } from "./panels";

type Who = (steamId: string, fallback?: string | null) => TwentyPlayer;

/** Вкладка «Оружие»: кто больше всех убил из АК-47, M4, AWP, пистолетов и так далее — за выбранный сезон, вечер или всё время */
export function WeaponsTab({ rows, who, t, meSteamId }: { rows: TwentyRow[]; who: Who; t: T; meSteamId: string | null }) {
  const boards = weaponBoards(rows);
  return (
    <section aria-label={t("Оружие")}>
      <SectionHead title={t("Оружие")} meta={t("Кто больше всех убил из каждого оружия. Считаются игры с 24 ноября 2026 года: с этого дня сайт записывает, из чего сделано каждое убийство.")} />
      {boards.length === 0 ? (
        <p className="rounded-surface border border-line-subtle bg-surface p-5 text-meta text-fg-3">{t("Здесь пока пусто: в выбранных играх ещё нет записи убийств по оружию. Таблица заполнится после ближайшей игры.")}</p>
      ) : (
        <CellGrid className="sm:grid-cols-2 xl:grid-cols-3">
          {boards.map((b) => {
            const lead = b.rows[0];
            const p = who(lead.steam_id, lead.name);
            return (
              <div key={b.key} className="flex flex-col bg-surface p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t(b.label)}</span>
                  <span className="num text-micro text-fg-3">{t("всего убийств: {n}", { n: b.total })}</span>
                </div>
                <Link href={`/players/${lead.steam_id}`} className="group mt-3 flex items-center gap-3">
                  <span className="num text-[44px] font-extrabold leading-none tracking-[-0.03em] text-fg">{lead.kills}</span>
                  <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                  <span className="min-w-0 truncate text-[15px] font-semibold text-fg group-hover:text-accent">{p.nickname}</span>
                </Link>
                {b.rows.length > 1 && (
                  <div className="mt-4 space-y-1 border-t border-line-subtle pt-3">
                    {b.rows.slice(1).map((r, i) => {
                      const x = who(r.steam_id, r.name);
                      return (
                        <Link key={r.steam_id} href={`/players/${r.steam_id}`} className={cn("flex items-center gap-2.5 rounded-control px-1 py-1 transition-colors hover:bg-surface-2", r.steam_id === meSteamId && "bg-surface-2")}>
                          <RankBadge n={i + 2} />
                          <span className="min-w-0 flex-1 truncate text-[14px] text-fg">{x.nickname}</span>
                          <span className="num shrink-0 text-[14px] font-semibold text-fg-2">{r.kills}</span>
                        </Link>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </CellGrid>
      )}
    </section>
  );
}
