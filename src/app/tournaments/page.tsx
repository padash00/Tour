import type { Metadata } from "next";
import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { CurrentTournament, TournamentLine } from "@/components/public/bits";
import { Container, EmptyState, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Турниры" };

export default async function TournamentsPage() {
  const [all, featured] = await Promise.all([listPublicTournaments(), getFeaturedTournament()]);
  const counts = await approvedCounts(all.map((t) => t.id));
  const current = featured && !["finished", "cancelled"].includes(featured.status) ? featured : null;
  const upcoming = all.filter((t) => t.id !== current?.id && !["finished", "cancelled"].includes(t.status));
  const archive = all.filter((t) => ["finished", "cancelled"].includes(t.status));

  return (
    <Container>
      <PageHeader title="Турниры" />

      <section>
        <h2 className="text-sm text-fg-3 mb-8">Текущий</h2>
        {current ? (
          <CurrentTournament t={current} approved={counts[current.id] ?? 0} />
        ) : (
          <EmptyState
            title="Сейчас турниров нет"
            description="Следующий турнир F16 Arena будет объявлен здесь."
          />
        )}
      </section>

      <section className="mt-24">
        <h2 className="text-sm text-fg-3">Предстоящие</h2>
        {upcoming.length > 0 ? (
          <div className="mt-2">
            {upcoming.map((t) => (
              <TournamentLine key={t.id} t={t} approved={counts[t.id] ?? 0} />
            ))}
          </div>
        ) : (
          <p className="mt-3 text-fg-2">Следующие турниры будут объявлены позже.</p>
        )}
      </section>

      {archive.length > 0 && (
        <section className="mt-24">
          <h2 className="text-sm text-fg-3">Архив</h2>
          <div className="mt-2">
            {archive.map((t) => (
              <TournamentLine key={t.id} t={t} approved={counts[t.id] ?? 0} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
