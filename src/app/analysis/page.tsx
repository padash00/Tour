import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Container, EmptyState, PageTitle } from "@/components/ds";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { listAnalyses } from "@/lib/analysis";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Разбор демок", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/*
 * Разбор демок: 2D-повтор, тепловые карты, гранаты, экономика. Пока закрыто — только админы
 * (остальным страница отвечает «не найдено»). Разборы загружает server/analyzer/upload.mjs.
 */
export default async function AnalysisListPage() {
  const me = await getCurrentPlayer();
  if (!isAdmin(me)) notFound();
  const list = await listAnalyses();
  const maps = [...new Set(list.map((a) => a.map))].sort();
  return (
    <Container className="pb-16 pt-6 sm:pt-8">
      <PageTitle>Разбор демок</PageTitle>
      <p className="mt-1 text-meta text-fg-3">Пока видно только админам. 2D-повтор раундов, тепловые карты, гранаты, экономика.</p>
      {list.length === 0 ? (
        <div className="mt-6">
          <EmptyState title="Разборов пока нет" text="Положите демки в папку и запустите разбор: node server/analyzer/upload.mjs <папка>" />
        </div>
      ) : (
        maps.map((m) => (
          <section key={m} className="mt-8">
            <h2 className="text-[18px] font-extrabold uppercase">{m.replace(/^de_/, "")}</h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {list
                .filter((a) => a.map === m)
                .map((a) => (
                  <Link key={a.id} href={`/analysis/${a.id}`} className="rounded-lg border border-line p-4 hover:border-line-hover">
                    <div className="text-[13px] font-semibold uppercase text-fg-3">{a.kind === "pro" ? "Про-игроки" : "Матч F16"}</div>
                    <div className="mt-1 text-[17px] font-bold">
                      {a.team_a} <span className="text-accent">{a.score_a ?? "?"}:{a.score_b ?? "?"}</span> {a.team_b}
                    </div>
                    <div className="mt-1 text-[13px] text-fg-3">{a.rounds} раундов · {formatDateTime(a.created_at)}</div>
                  </Link>
                ))}
            </div>
          </section>
        ))
      )}
    </Container>
  );
}
