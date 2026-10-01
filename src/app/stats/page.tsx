import type { Metadata } from "next";
import Link from "next/link";
import { Container, EmptyState, IconChart, PageHeader, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Статистика" };

const TABS = [
  { key: "players", label: "Игроки", cols: ["Игрок", "Команда", "Матчи", "K/D", "ADR", "KAST", "Rating"] },
  { key: "teams", label: "Команды", cols: ["Команда", "Матчи", "Win rate", "Разница раундов", "Rating"] },
  { key: "maps", label: "Карты", cols: ["Карта", "Сыграно", "CT win %", "T win %"] },
];

export default async function StatsPage(props: PageProps<"/stats">) {
  const sp = await props.searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];

  return (
    <Container>
      <PageHeader
        eyebrow="F16 Rating"
        title="Статистика"
        description="Показатели собираются прямо с игровых серверов F16: каждое убийство, урон, клатч и раунд."
      />
      <div className="flex gap-2 mb-6">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/stats?tab=${t.key}`}
            className={cn(
              "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
              t.key === tab.key
                ? "border-[#8bb8ff55] bg-accent-dim text-accent"
                : "border-line text-fg-3 hover:text-fg-2 hover:border-line-strong",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>
      <div className="card overflow-x-auto mb-6">
        <table className="tbl min-w-[640px]">
          <thead>
            <tr>
              {tab.cols.map((c, i) => (
                <th key={c} className={i > 0 ? "text-right" : ""}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        </table>
      </div>
      <EmptyState
        icon={<IconChart />}
        title="Статистика появится после первых матчей"
        description="Как только начнётся первый турнир, здесь появятся рейтинги игроков, команд и карт."
      />
    </Container>
  );
}
