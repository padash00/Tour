import type { Metadata } from "next";
import Link from "next/link";
import { Container, EmptyState, PageTitle } from "@/components/ds";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { analysesOfPlayer, knowledgeMaps, listAnalyses, type AnalysisCard } from "@/lib/analysis";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Разбор игры" };
export const dynamic = "force-dynamic";

const mapTitle = (m: string) => m.replace(/^de_/, "").replace(/^./, (c) => c.toUpperCase());

function Card({ a, href }: { a: AnalysisCard; href: string }) {
  return (
    <Link href={href} className="rounded-lg border border-line p-4 hover:border-line-hover">
      <div className="text-[13px] font-semibold uppercase text-fg-3">{mapTitle(a.map)} · {a.kind === "pro" ? "про-игроки" : a.match_id ? "матч клуба" : "демка"}</div>
      <div className="mt-1 text-[17px] font-bold">
        {a.team_a} <span className="text-accent">{a.score_a ?? "?"}:{a.score_b ?? "?"}</span> {a.team_b}
      </div>
      <div className="mt-1 text-[13px] text-fg-3">{a.rounds} раундов · {formatDateTime(a.created_at)}</div>
    </Link>
  );
}

/*
 * Разбор игры: повторы карт матчей клуба, библиотека «Как играют про», свои разборы с ИИ-тренером.
 * Демки клуба разбираются сами после каждой карты (server/analyzer/watch.mjs).
 */
export default async function AnalysisListPage() {
  const me = await getCurrentPlayer();
  const admin = isAdmin(me);
  const [all, pro, mine] = await Promise.all([listAnalyses(), knowledgeMaps(), me ? analysesOfPlayer(me.steam_id) : Promise.resolve([] as AnalysisCard[])]);
  const club = all.filter((a) => a.kind === "match" && a.match_id).slice(0, 30);
  const other = admin ? all.filter((a) => !(a.kind === "match" && a.match_id)) : [];

  return (
    <Container className="pb-16 pt-6 sm:pt-8">
      <PageTitle>Разбор игры</PageTitle>
      <p className="mt-1 max-w-2xl text-meta text-fg-3">
        2D-повтор каждой карты, сыгранной в клубе, библиотека «как играют про» и разбор твоей игры против топов с ИИ-тренером.
      </p>

      {me && (
        <section className="mt-6 rounded-xl border border-accent/40 bg-accent/[0.05] p-4">
          <h2 className="text-[17px] font-extrabold">Мои разборы</h2>
          {mine.length ? (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {mine.map((a) => (
                <Card key={a.id} a={a} href={`/analysis/${a.id}/player/${me.steam_id}`} />
              ))}
            </div>
          ) : (
            <p className="mt-1 text-[14px] text-fg-3">Сыграй карту на сервере клуба — турнир или лобби, — и через пару минут здесь появится разбор твоей игры против топов.</p>
          )}
        </section>
      )}

      {pro.length > 0 && (
        <section className="mt-6 rounded-xl border border-line p-4">
          <h2 className="text-[17px] font-extrabold">Как играют про</h2>
          <p className="mt-0.5 text-[14px] text-fg-3">Раскидки, первые дуэли, клатчи, позиции и размены топ-команд — по каждой карте, с клипами.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {pro.map((m) => (
              <Link key={m} href={`/analysis/pro/${m}`} className="rounded-lg bg-accent px-3 py-1.5 text-[14px] font-bold text-accent-ink hover:bg-accent-strong">
                {mapTitle(m)}
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-[18px] font-extrabold">Карты матчей клуба</h2>
        {club.length ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {club.map((a) => (
              <Card key={a.id} a={a} href={`/analysis/${a.id}`} />
            ))}
          </div>
        ) : (
          <div className="mt-3">
            <EmptyState title="Пока нет разобранных карт" text="Повторы появляются сами после каждой карты, сыгранной на сервере клуба." />
          </div>
        )}
      </section>

      {other.length > 0 && (
        <section className="mt-8">
          <h2 className="text-[18px] font-extrabold">Все разборы (видно только админам)</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {other.map((a) => (
              <Card key={a.id} a={a} href={`/analysis/${a.id}`} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
