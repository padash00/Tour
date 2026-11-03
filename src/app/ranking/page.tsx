import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUp, Minus, Trophy } from "lucide-react";
import { getTeamRanking, type RankingRow } from "@/lib/team-ranking";
import { TeamsNav } from "@/components/team/teams-nav";
import { Avatar, Container, EmptyState, PageTitle, TeamLogo, cn } from "@/components/ds";
import { ratingColor } from "@/components/stats-format";
import { formatShortDateTime } from "@/lib/format";
import { getLang, getT } from "@/lib/i18n/server";
import type { T } from "@/lib/i18n/core";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Рейтинг команд"),
    description: "Рейтинг команд CS2 F16 Arena: очки за места в турнирах и победы, вес официальных и LAN-турниров, составы и F16 Rating игроков.",
    alternates: { canonical: "/ranking" },
  };
}

export const dynamic = "force-dynamic";

export default async function RankingPage() {
  const t = await getT();
  const lang = await getLang();
  const { rows, updatedAt } = await getTeamRanking();

  return (
    <Container className="pb-16 pt-8 sm:pt-10">
      <header>
        <PageTitle>{t("Рейтинг команд")}</PageTitle>
        <p className="mt-1 max-w-read text-meta text-fg-3">
          {t("Очки за места в турнирах и победы над сильными соперниками за последний год. Обновлено {date}.", { date: formatShortDateTime(updatedAt, lang) })}
        </p>
      </header>
      <div className="mt-6">
        <TeamsNav />
      </div>

      <div className="pt-8">
        {rows.length === 0 ? (
          <EmptyState icon={<Trophy />} title={t("Рейтинг появится после первых турниров")} text={t("Команды получают очки за места в турнирах 5×5 и победы в матчах.")} />
        ) : (
          <ol className="space-y-3">
            {rows.map((r) => (
              <RankingCard key={r.teamId} row={r} t={t} />
            ))}
          </ol>
        )}
      </div>

      <section className="mt-14 max-w-read space-y-3 text-[15px] text-fg-2">
        <h2 className="text-title text-fg">{t("Как считается рейтинг")}</h2>
        <p>{t("Очки = достижения + форма. Достижения — за место в турнире: 1-е — 100, 2-е — 70, 3-е — 50, 4-е — 40, выход в плей-офф — от 10 до 35, только группа — до 15.")}</p>
        <p>{t("Форма — за каждую победу в матче: чем сильнее соперник (его командный ELO), тем больше очков. Технические победы не считаются.")}</p>
        <p>{t("Официальные турниры весят вдвое больше клубных, онлайн-турниры — вдвое меньше. Результаты старше 3 месяцев стоят 75%, старше 6 месяцев — 50%, старше года не учитываются.")}</p>
        <p>{t("В рейтинге — команды, сыгравшие хотя бы один матч 5×5 за последние полгода. Стрелка — изменение места за неделю.")}</p>
      </section>
    </Container>
  );
}

function Change({ value, t }: { value: number | null; t: T }) {
  if (value == null) return <span className="text-[11px] font-semibold uppercase text-accent">{t("new")}</span>;
  if (value === 0) return <Minus className="size-3.5 text-fg-3" aria-label={t("без изменений")} />;
  const up = value > 0;
  const Icon = up ? ArrowUp : ArrowDown;
  return (
    <span className={cn("inline-flex items-center gap-0.5 text-[12px] font-semibold", up ? "text-ok" : "text-danger")}>
      <Icon className="size-3.5" aria-hidden />
      {Math.abs(value)}
    </span>
  );
}

function RankingCard({ row: r, t }: { row: RankingRow; t: T }) {
  const best = r.results.filter((x) => x.place).sort((a, b) => a.place! - b.place!)[0];
  const href = `/teams/${encodeURIComponent(r.team.tag)}`;
  return (
    <li className={cn("overflow-hidden rounded-surface border bg-surface", r.rank <= 3 ? "border-accent/40" : "border-line-subtle")}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 p-4 sm:p-5">
        <div className="flex w-12 shrink-0 flex-col items-center">
          <span className={cn("num text-[26px] font-bold leading-none", r.rank <= 3 ? "text-accent" : "text-fg")}>#{r.rank}</span>
          <span className="mt-1">
            <Change value={r.change} t={t} />
          </span>
        </div>
        <Link href={href} className="flex min-w-0 flex-1 items-center gap-3 hover:opacity-90">
          <TeamLogo src={r.team.logo_url} tag={r.team.tag} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-[18px] font-bold text-fg">{r.team.name}</div>
            <div className="truncate text-meta text-fg-3">
              {r.team.tag}
              {r.team.region ? ` · ${r.team.region}` : ""}
              {best ? ` · ${t("лучшее: {place} место — {name}", { place: best.place!, name: best.name })}` : ""}
            </div>
          </div>
        </Link>
        <div className="flex items-center gap-5 text-right">
          <div>
            <div className="num text-[22px] font-bold text-fg">{r.points}</div>
            <div className="text-micro uppercase tracking-[0.1em] text-fg-3">{t("очков")}</div>
          </div>
          <div className="hidden sm:block">
            <div className="num text-[15px] font-semibold text-fg">
              {r.wins}–{r.losses}
            </div>
            <div className="text-micro uppercase tracking-[0.1em] text-fg-3">{t("за полгода")}</div>
          </div>
          <div className="hidden md:block">
            <div className="num text-[15px] font-semibold text-fg">{r.elo}</div>
            <div className="text-micro uppercase tracking-[0.1em] text-fg-3">ELO</div>
          </div>
        </div>
      </div>
      {r.players.length > 0 && (
        <div className="flex flex-wrap gap-2 border-t border-line-subtle bg-surface-2/50 px-4 py-3 sm:px-5">
          {r.players.map((p) => (
            <Link key={p.id} href={`/players/${p.steam_id}`} className="flex min-w-0 items-center gap-2 rounded-control px-2 py-1 hover:bg-surface-3">
              <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
              <span className="min-w-0">
                <span className={cn("block max-w-[9rem] truncate text-[14px] font-semibold", p.role === "substitute" ? "text-fg-3" : "text-fg")}>
                  {p.nickname}
                  {p.role === "captain" ? " ★" : ""}
                </span>
                <span className="block text-[12px] text-fg-3">
                  {p.rating != null ? (
                    <>
                      F16 <b className={cn("num", ratingColor(p.rating))}>{p.rating.toFixed(2)}</b>
                    </>
                  ) : (
                    t("нет статистики")
                  )}
                  {p.role === "substitute" ? ` · ${t("запас")}` : ""}
                </span>
              </span>
            </Link>
          ))}
        </div>
      )}
    </li>
  );
}
