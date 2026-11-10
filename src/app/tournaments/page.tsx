import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { approvedCounts, getFeaturedTournament, listPrivateTournaments, listPublicTournaments } from "@/lib/data";
import { TournamentList, type TournamentItem } from "@/components/competition/tournament-list";
import { Container, PageTitle } from "@/components/ds";
import { getT } from "@/lib/i18n/server";
import { tournamentForLang } from "@/lib/tournament-kk";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Турниры"),
    description: "Турниры по CS2 в Усть-Каменогорске: открытая регистрация, ближайшие и прошедшие турниры F16 Arena, сетки и результаты.",
    alternates: { canonical: "/tournaments" },
  };
}

const ORDER: Record<string, number> = { live: 0, checkin: 1, registration: 2, registration_closed: 3, finished: 4, cancelled: 5, draft: 6 };

export default async function TournamentsPage() {
  const tx = await getT();
  const [open, featured, me] = await Promise.all([listPublicTournaments(), getFeaturedTournament(), getCurrentPlayer()]);
  // закрытые турниры видит только администратор — с пометкой «Закрытый»
  const closed = isAdmin(me) ? await listPrivateTournaments() : [];
  const all = [...open, ...closed];
  const counts = await approvedCounts(all.map((t) => t.id));
  const current = featured && !["finished", "cancelled"].includes(featured.status) ? featured : null;
  // идущие и открытые — сверху; завершённые — новые первыми
  const items: TournamentItem[] = [...all]
    .sort((a, b) => ORDER[a.status] - ORDER[b.status] || (["finished", "cancelled"].includes(a.status) ? (b.starts_at ?? "").localeCompare(a.starts_at ?? "") : (a.starts_at ?? "9999").localeCompare(b.starts_at ?? "9999")))
    .map((t) => ({
      id: t.id,
      slug: t.slug,
      name: t.name,
      status: t.status,
      format: t.format,
      bracket_type: t.bracket_type,
      is_lan: t.is_lan,
      location: t.location,
      starts_at: t.starts_at,
      registration_closes_at: t.registration_closes_at,
      max_teams: t.max_teams,
      approved: counts[t.id] ?? 0,
      prize_pool: tournamentForLang(t, tx.lang).prize_pool,
      cover_url: t.cover_url,
      private: !!t.is_private,
    }));

  return (
    <Container className="pt-8 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>{tx("Турниры")}</PageTitle>
          <p className="mt-1 text-meta text-fg-3">{tx("Турниры по CS2 на серверах клуба F16 Arena.")}</p>
        </div>
        <Link href="/stats" className="text-meta font-medium text-accent hover:text-accent-strong">
          {tx("Рейтинг и статистика →")}
        </Link>
      </header>
      <TournamentList items={items} featuredId={current?.id ?? null} />
    </Container>
  );
}
