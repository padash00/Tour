import type { Metadata } from "next";
import Link from "next/link";
import { approvedCounts, listPublicTournaments } from "@/lib/data";
import { TournamentRow } from "@/components/tournament-bits";
import { Container, EmptyState, IconTrophy, PageHeader, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Турниры" };

const FILTERS = [
  { key: "all", label: "Все" },
  { key: "open", label: "Регистрация" },
  { key: "active", label: "Идут" },
  { key: "finished", label: "Завершённые" },
];

export default async function TournamentsPage(props: PageProps<"/tournaments">) {
  const sp = await props.searchParams;
  const filter = typeof sp.status === "string" ? sp.status : "all";
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";

  const all = await listPublicTournaments();
  const counts = await approvedCounts(all.map((t) => t.id));
  const list = all.filter((t) => {
    if (q && !t.name.toLowerCase().includes(q)) return false;
    if (filter === "open") return t.status === "registration";
    if (filter === "active") return ["registration_closed", "checkin", "live"].includes(t.status);
    if (filter === "finished") return ["finished", "cancelled"].includes(t.status);
    return true;
  });

  return (
    <Container>
      <PageHeader
        eyebrow="CS2"
        title="Турниры"
        description="Все соревнования F16 Arena — текущие, предстоящие и завершённые."
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-6">
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={{ pathname: "/tournaments", query: { ...(f.key !== "all" && { status: f.key }), ...(q && { q }) } }}
              className={cn(
                "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
                filter === f.key
                  ? "border-[#8bb8ff55] bg-accent-dim text-accent"
                  : "border-line text-fg-3 hover:text-fg-2 hover:border-line-strong",
              )}
            >
              {f.label}
            </Link>
          ))}
        </div>
        <form className="sm:w-72">
          {filter !== "all" && <input type="hidden" name="status" value={filter} />}
          <input name="q" defaultValue={q} placeholder="Поиск по названию" className="field h-9 py-0" />
        </form>
      </div>

      {list.length > 0 ? (
        <div className="grid gap-3">
          {list.map((t) => (
            <TournamentRow key={t.id} t={t} approved={counts[t.id] ?? 0} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<IconTrophy />}
          title={all.length === 0 ? "Турниров пока нет" : "Ничего не найдено"}
          description={
            all.length === 0
              ? "Первый турнир F16 Arena скоро будет объявлен. Соберите команду заранее."
              : "Попробуйте изменить фильтр или поисковый запрос."
          }
        />
      )}
    </Container>
  );
}
