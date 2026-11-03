import type { Metadata } from "next";
import Link from "next/link";
import { Users } from "lucide-react";
import { listPlayers } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { ratingColor } from "@/components/stats-format";
import { DATA_TABLE, NUM_CELL, tableBox } from "@/components/public/data-table";
import { Avatar, Container, EmptyState, FaceitLevel, PageTitle, cn } from "@/components/ds";
import { ClientFilter } from "@/components/public/client-filter";
import { isOnline } from "@/lib/online";
import { getT } from "@/lib/i18n/server";

export const metadata: Metadata = {
  title: "Игроки",
  description: "Игроки CS2 на F16 Arena: ники, уровни FACEIT, F16 Rating и статистика матчей турниров в Усть-Каменогорске.",
  alternates: { canonical: "/players" },
};
export const dynamic = "force-dynamic";

export default async function PlayersPage(props: PageProps<"/players">) {
  const t = await getT();
  const sp = await props.searchParams;
  const onlyOnline = sp.online === "1";
  const [all, board] = await Promise.all([listPlayers(), getPlayerLeaderboard()]);
  const now = serverNow();
  // кто сейчас на сайте — сверху
  const sorted = [...all].sort((a, b) => Number(isOnline(b.last_seen_at, now)) - Number(isOnline(a.last_seen_at, now)));
  const onlineCount = sorted.filter((p) => isOnline(p.last_seen_at, now)).length;
  const players = onlyOnline ? sorted.filter((p) => isOnline(p.last_seen_at, now)) : sorted;
  const statsById = new Map(board.filter((b) => b.player_id).map((b) => [b.player_id!, b]));

  return (
    <Container width="wide" className="pb-16 pt-8 sm:pt-10">
      <header>
        <PageTitle>{t("Игроки")}</PageTitle>
        <p className="mt-1 text-meta text-fg-3">{all.length ? t("{players} на платформе F16 Arena.", { players: `${all.length} ${t.plural(all.length, "игрок", "игрока", "игроков")}` }) : t("Игроки появятся после первого входа через Steam.")}</p>
        <div className="mt-3 flex flex-wrap gap-2 text-[14px] font-semibold">
          <Link href="/players" className={cn("rounded-full border px-3 py-1.5", !onlyOnline ? "border-accent bg-accent-dim text-fg" : "border-line text-fg-3 hover:text-fg")}>
            {t("Все")}
          </Link>
          <Link href="/players?online=1" className={cn("inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5", onlyOnline ? "border-accent bg-accent-dim text-fg" : "border-line text-fg-3 hover:text-fg")}>
            <span className="size-2 rounded-full bg-ok" aria-hidden />
            {t("Сейчас в сети · {n}", { n: onlineCount })}
          </Link>
        </div>
      </header>

      {players.length > 0 && <ClientFilter scope="players" placeholder={t("Ник или SteamID")} className="mt-8 mb-5 max-w-xl" />}

      {players.length === 0 ? (
        <EmptyState className="mt-8" icon={<Users />} title={onlyOnline ? t("Сейчас никого нет в сети") : t("Игроков пока нет")} text={onlyOnline ? t("Загляните позже или посмотрите всех игроков.") : t("После первого входа через Steam игрок появится в списке.")} />
      ) : (
        <div className={tableBox(true, "mt-6")} data-filter-scope="players">
          <p data-filter-empty hidden className="px-6 py-10 text-[15px] text-fg-3">
            {t("Ничего не найдено — попробуйте другой ник или SteamID.")}
          </p>
          <table className={cn(DATA_TABLE, "min-w-[760px]")}>
            <thead>
              <tr>
                <th>{t("Игрок")}</th>
                <th>{t("Команда")}</th>
                <th className="!text-center">FACEIT</th>
                <th className="!text-right">ELO</th>
                <th className="!text-right">F16 Rating</th>
                <th className="!text-right">{t("Матчи")}</th>
              </tr>
            </thead>
            <tbody>
              {players.map((player) => {
                const stats = statsById.get(player.id);
                return (
                  <tr key={player.id} data-filter={`${player.nickname} ${player.steam_id}`.toLowerCase()}>
                    <td>
                      <Link href={`/players/${player.steam_id}`} className="group flex min-h-11 items-center gap-3 text-fg">
                        <span className="relative shrink-0">
                          <Avatar src={player.avatar_url} name={player.nickname} size="md" />
                          {isOnline(player.last_seen_at, now) && <span className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-ok" title={t("в сети")} />}
                        </span>
                        <span className="text-[15px] font-semibold transition-colors group-hover:text-accent">{player.nickname}</span>
                        {player.is_banned && <span className="text-micro font-semibold uppercase tracking-[0.12em] text-danger">{t("бан")}</span>}
                      </Link>
                    </td>
                    <td>
                      {player.team ? (
                        <Link href={`/teams/${player.team.tag}`} className="transition-colors hover:text-fg">
                          {player.team.name}
                        </Link>
                      ) : (
                        <span className="text-fg-3">{t("Без команды")}</span>
                      )}
                    </td>
                    <td className="text-center">
                      <span className="inline-flex justify-center">
                        <FaceitLevel level={player.faceit_level} />
                      </span>
                    </td>
                    <td className={NUM_CELL}>{player.faceit_elo ?? "—"}</td>
                    <td className={cn(NUM_CELL, "text-[16px] font-semibold", stats ? ratingColor(stats.rating) : "font-normal text-fg-3")}>
                      {stats ? stats.rating.toFixed(2) : "—"}
                    </td>
                    <td className={NUM_CELL}>{stats?.matches ?? 0}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}

/** Время запроса на сервере (страница рендерится на каждый запрос) */
function serverNow() {
  return Date.now();
}
