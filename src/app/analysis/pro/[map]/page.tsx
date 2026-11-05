import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { ProLibrary } from "@/components/analysis/pro-library";
import { Container, PageTitle } from "@/components/ds";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Как играют про", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/** Библиотека топов по карте: раскидки из про-демок с клипами. Пока только админам. */
export default async function ProMapPage(props: PageProps<"/analysis/pro/[map]">) {
  const me = await getCurrentPlayer();
  if (!isAdmin(me)) notFound();
  const { map } = await props.params;
  if (!/^[a-z0-9_]{3,40}$/.test(map)) notFound();
  return (
    <Container width="wide" className="pb-16 pt-6 sm:pt-8">
      <Link href="/analysis" className="-ml-1 inline-flex items-center gap-1 text-meta text-fg-3 hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        Разбор демок
      </Link>
      <PageTitle className="mt-2">Как играют про · {map.replace(/^de_/, "").replace(/^./, (c) => c.toUpperCase())}</PageTitle>
      <p className="mt-1 text-meta text-fg-3">Раскидки топов: откуда кидают, куда ложится, на какой секунде и как часто. Собрано из всех загруженных про-демок.</p>
      <div className="mt-5">
        <ProLibrary map={map} />
      </div>
    </Container>
  );
}
