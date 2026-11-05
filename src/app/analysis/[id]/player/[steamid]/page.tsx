import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CoachReport } from "@/components/analysis/coach-report";
import { Container } from "@/components/ds";
import { getCurrentPlayer } from "@/lib/auth";
import { canViewCoach } from "@/lib/analysis";

export const metadata: Metadata = { title: "Разбор игрока", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Разбор игрока против топов: цифры, выводы, клипы «ты / про», ИИ-тренер. Видят сам игрок и админы. */
export default async function PlayerCoachPage(props: PageProps<"/analysis/[id]/player/[steamid]">) {
  const me = await getCurrentPlayer();
  const { id, steamid } = await props.params;
  if (!UUID.test(id) || !/^\d{17}$/.test(steamid)) notFound();
  if (!canViewCoach(steamid, me)) notFound();
  return (
    <Container width="wide" className="pb-16 pt-6 sm:pt-8">
      <Link href={`/analysis/${id}`} className="-ml-1 inline-flex items-center gap-1 text-meta text-fg-3 hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Повтор матча
      </Link>
      <div className="mt-4">
        <CoachReport analysisId={id} steamid={steamid} />
      </div>
    </Container>
  );
}
