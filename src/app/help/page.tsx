import type { Metadata } from "next";
import Link from "next/link";
import { HelpBody } from "@/components/help-hint";
import { HELP, HELP_GROUPS } from "@/lib/help";
import { Container, PageTitle, Panel } from "@/components/ds";

export const metadata: Metadata = {
  title: "Как это работает",
  description: "Как создать команду CS2, пригласить игроков и тренера, подать заявку на турнир и пройти check-in на F16 Arena — пошагово.",
  alternates: { canonical: "/help" },
};

export default function HelpPage() {
  return (
    <Container width="wide" className="grid gap-12 pb-16 pt-8 sm:pt-10 lg:grid-cols-[260px_minmax(0,780px)] lg:gap-16">
      <div className="lg:col-span-2">
        <PageTitle>Как это работает</PageTitle>
        <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-fg-2">
          Пошагово: как собрать команду, позвать игроков, выйти из команды и подать заявку на турнир. Правила матчей — на странице{" "}
          <Link href="/rules" className="text-accent hover:text-accent-strong">
            «Правила»
          </Link>
          .
        </p>
      </div>

      <nav className="hidden lg:block" aria-label="Темы">
        <Panel className="sticky top-[calc(var(--shell-h)+24px)]">
          {HELP_GROUPS.map((g) => (
            <div key={g.title} className="mb-4 last:mb-0">
              <div className="mb-2 text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">{g.title}</div>
              <ul className="space-y-1 text-[14px]">
                {g.topics.map((id) => (
                  <li key={id}>
                    <a href={`#${id}`} className="block rounded-control px-2 py-2 text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg">
                      {HELP[id].title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Panel>
      </nav>

      <article className="min-w-0 space-y-12">
        {HELP_GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">{g.title}</h2>
            <div className="mt-4 space-y-4">
              {g.topics.map((id) => (
                <section key={id} id={id} className="scroll-mt-[calc(var(--shell-h)+24px)]">
                  <Panel className="p-5 sm:p-6">
                    <h3 className="mb-4 text-title text-fg">{HELP[id].title}</h3>
                    <HelpBody id={id} />
                  </Panel>
                </section>
              ))}
            </div>
          </section>
        ))}
      </article>
    </Container>
  );
}
