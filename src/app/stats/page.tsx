import type { Metadata } from "next";
import Link from "next/link";
import { listPublicTournaments } from "@/lib/data";
import { mapName } from "@/lib/format";
import { getMapTable, getPlayerLeaderboard, getTeamTable } from "@/lib/stats";
import { PlayerStatsTable, RatingExplainer } from "@/components/stats-table";
import { SelectNav } from "@/components/public/select-nav";
import { Tabs, TeamLogo, cn } from "@/components/ui";
import { CARD, PageHero, Wrap } from "@/components/public/page-kit";

export const metadata: Metadata = { title: "Статистика" };

const TABS = [
  { key: "players", label: "Игроки" },
  { key: "teams", label: "Команды" },
  { key: "maps", label: "Карты" },
];

export default async function StatsPage(props: PageProps<"/stats">) {
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab)?.key ?? "players";
  const tournaments = await listPublicTournaments();
  const t = tournaments.find((x) => x.slug === sp.t) ?? null;
  const href = (nextTab: string, slug?: string | null) => {
    const params = new URLSearchParams({ tab: nextTab, ...(slug && { t: slug }) });
    return `/stats?${params}`;
  };

  return (
    <>
      <PageHero
        eyebrow="F16 Rating · Swing · карты"
        title="Статистика"
        lead="Каждое число — с наших серверов: убийства, раунды, вклад в победу."
        aside={
          tournaments.length > 0 ? (
            <SelectNav
              label="Турнир"
              value={t?.slug ?? ""}
              options={[
                { value: "", label: "Все турниры", href: href(tab) },
                ...tournaments.map((x) => ({ value: x.slug, label: x.name, href: href(tab, x.slug) })),
              ]}
            />
          ) : undefined
        }
      />

      <Wrap className="pt-10">
      <Tabs items={TABS.map((x) => ({ ...x, href: href(x.key, t?.slug) }))} active={tab} />

      <div className="mt-8">
        {tab === "players" && <PlayersTab tournamentId={t?.id} />}
        {tab === "teams" && <TeamsTab tournamentId={t?.id} />}
        {tab === "maps" && <MapsTab tournamentId={t?.id} />}
      </div>

      <div className="mt-16">
        <RatingExplainer />
      </div>
      </Wrap>
    </>
  );
}

const empty = (
  <div className={cn(CARD, "border-dashed px-8 py-12 lg:px-12")}>
    <div className="text-[20px] lg:text-[24px] font-semibold text-fg">Статистика появится после первого матча</div>
    <p className="mt-2 text-[15px] text-fg-3">Рейтинги игроков, команд и карт считаются с игровых серверов.</p>
  </div>
);

/** Таблица статистики в карточке главной: заголовки разрядкой, строки 56 px */
const TBL = "tbl [&_th]:px-6 [&_td]:px-6 [&_th]:uppercase [&_th]:tracking-[0.16em] [&_th]:text-[11px] [&_td]:h-[56px]";

async function PlayersTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getPlayerLeaderboard(tournamentId);
  return rows.length ? (
    <div className={cn(CARD, "py-2 [&_th]:uppercase [&_th]:tracking-[0.16em] [&_th]:text-[11px] [&_td]:h-[56px]")}>
      <PlayerStatsTable rows={rows} />
    </div>
  ) : (
    empty
  );
}

async function TeamsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getTeamTable(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className={cn(CARD, "overflow-x-auto")}>
      <table className={cn(TBL, "min-w-[720px]")}>
        <thead>
          <tr>
            <th className="w-10">#</th>
            <th>Команда</th>
            <th className="text-right">Матчи</th>
            <th className="text-right">Победы</th>
            <th className="text-right">Win rate</th>
            <th className="text-right">Карты</th>
            <th className="text-right">Раунды</th>
            <th className="text-right">±</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const diff = r.roundsFor - r.roundsAgainst;
            return (
              <tr key={r.team.id}>
                <td className="num text-fg-3">{i + 1}</td>
                <td>
                  <Link href={`/teams/${r.team.tag}`} className="flex items-center gap-3 text-fg hover:text-accent">
                    <TeamLogo src={r.team.logo_url} tag={r.team.tag} size={28} />
                    <span className="font-semibold">{r.team.name}</span>
                  </Link>
                </td>
                <td className="text-right num">{r.matches}</td>
                <td className="text-right num">{r.wins}</td>
                <td className="text-right num">{Math.round((100 * r.wins) / Math.max(1, r.matches))}%</td>
                <td className="text-right num">
                  {r.mapWins}
                  <span className="text-fg-3">/{r.maps}</span>
                </td>
                <td className="text-right num">
                  {r.roundsFor}:{r.roundsAgainst}
                </td>
                <td className={cn("text-right num", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "")}>
                  {diff > 0 ? `+${diff}` : diff}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

async function MapsTab({ tournamentId }: { tournamentId?: string }) {
  const rows = await getMapTable(tournamentId);
  if (!rows.length) return empty;
  return (
    <div className={cn(CARD, "overflow-x-auto")}>
      <table className={cn(TBL, "min-w-[560px]")}>
        <thead>
          <tr>
            <th>Карта</th>
            <th className="text-right">Сыграно</th>
            <th className="text-right">Пики</th>
            <th className="text-right">Баны</th>
            <th className="text-right">Ср. раундов</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.map}>
              <td className="text-[16px] font-semibold text-fg">{mapName(r.map)}</td>
              <td className="text-right num">{r.played}</td>
              <td className="text-right num">{r.picked}</td>
              <td className="text-right num">{r.banned}</td>
              <td className="text-right num">{r.avgRounds ? r.avgRounds.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
