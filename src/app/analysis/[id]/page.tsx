import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { AnalysisView } from "@/components/analysis/replay";
import { Container } from "@/components/ds";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { coachPlayers, getAnalysis } from "@/lib/analysis";

export const metadata: Metadata = { title: "Разбор демки", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AnalysisPage(props: PageProps<"/analysis/[id]">) {
  const me = await getCurrentPlayer();
  if (!isAdmin(me)) notFound();
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const a = await getAnalysis(id);
  if (!a) notFound();
  const coached = await coachPlayers(id);
  return (
    <Container width="wide" className="pb-16 pt-6 sm:pt-8">
      <Link href="/analysis" className="-ml-1 inline-flex items-center gap-1 text-meta text-fg-3 hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Все разборы
      </Link>
      {coached.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-accent/40 bg-accent/[0.06] p-3">
          <span className="text-[14px] font-bold">Разбор игрока против топов:</span>
          {coached.map((sid) => (
            <Link key={sid} href={`/analysis/${id}/player/${sid}`} className="rounded-lg bg-accent px-3 py-1.5 text-[14px] font-bold text-accent-ink hover:bg-accent-strong">
              {a.card.players.find((p) => p.steamid === sid)?.name ?? sid} →
            </Link>
          ))}
        </div>
      )}
      <div className="mt-4">
        <AnalysisView url={a.url} map={a.card.map} />
      </div>
    </Container>
  );
}
