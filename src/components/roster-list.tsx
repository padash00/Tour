import type { Player } from "@/lib/types";
import { FaceitLevel, PlayerIdentity } from "@/components/ds";
import { tr } from "@/lib/i18n/core";
import { getT } from "@/lib/i18n/server";

export type RosterItem = {
  key: string;
  player: Player;
  role: "captain" | "main" | "sub";
  extra?: React.ReactNode;
};

const roleLabel = { captain: tr("Капитан"), main: tr("Основа"), sub: tr("Запасной") };

/** Состав матча: те же player primitives, что Team HQ и Lobby. */
export async function RosterList({ items, slots }: { items: RosterItem[]; slots?: number }) {
  const t = await getT();
  const empty = Math.max(0, (slots ?? 0) - items.length);
  return (
    <div className="divide-y divide-line-subtle">
      {items.map((it) => (
        <div key={it.key} className="min-h-16 py-3">
          <PlayerIdentity
            name={it.player.nickname}
            avatar={it.player.avatar_url}
            href={`/players/${it.player.steam_id}`}
            size="md"
            captain={it.role === "captain"}
            meta={it.player.is_banned ? <span className="text-danger">{t("Заблокирован")}</span> : t(roleLabel[it.role])}
            trailing={
              <div className="flex items-center gap-3">
                <FaceitLevel level={it.player.faceit_level} />
                <span className="num hidden w-12 text-right text-meta text-fg-3 sm:block">{it.player.faceit_elo ?? "—"}</span>
                {it.extra}
              </div>
            }
          />
        </div>
      ))}
      {Array.from({ length: empty }, (_, i) => (
        <div key={`empty-${i}`} className="flex min-h-16 items-center gap-3 py-3 text-fg-3">
          <div className="size-10 shrink-0 rounded-full border border-dashed border-line" />
          <span className="text-[14px]">{t("Свободный слот")}</span>
        </div>
      ))}
    </div>
  );
}
