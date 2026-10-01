import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { getUpcomingMatches } from "@/lib/matches";
import { CoverImage, CurrentTournament, MatchLine, TournamentLine } from "@/components/public/bits";
import { ButtonLink, Container, EmptyState, IconArrow } from "@/components/ui";

const STEPS = [
  { n: "01", title: "Войти через Steam", text: "Один аккаунт для сайта, команды и сервера." },
  { n: "02", title: "Создать команду", text: "Пригласите игроков по ссылке." },
  { n: "03", title: "Участвовать в турнире", text: "Заявка, check-in — и вы в сетке." },
];

export default async function HomePage() {
  const [player, featured, all, upcoming] = await Promise.all([
    getCurrentPlayer(),
    getFeaturedTournament(),
    listPublicTournaments(),
    getUpcomingMatches(5),
  ]);
  const others = all.filter((t) => t.id !== featured?.id && !["finished", "cancelled"].includes(t.status));
  const counts = await approvedCounts(all.map((t) => t.id));
  const teamHref = player ? "/team" : "/login?next=/team/create";

  return (
    <>
      {/* HERO — под прозрачной шапкой */}
      <section className="relative -mt-[68px] pt-[68px] overflow-hidden atmos">
        <Container className="relative grid lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-12 lg:gap-14 items-center pt-16 pb-20 md:pt-24 md:pb-28">
          <div>
            <div className="eyebrow">CS2 Tournament Platform</div>
            <h1 className="mt-6 text-[42px] sm:text-[60px] lg:text-[64px] xl:text-[72px] font-bold tracking-[-0.045em] leading-[0.98]">
              <span className="block sm:whitespace-nowrap">Настоящие турниры</span>
              <span className="block sm:whitespace-nowrap text-fg-2">для реальных команд</span>
            </h1>
            <p className="mt-7 max-w-md text-[17px] text-fg-2 leading-relaxed">
              F16 Arena — соревновательная платформа для CS2. Команды, турниры, серверы и статистика матчей.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {featured ? (
                <ButtonLink href={`/tournaments/${featured.slug}`} size="lg">
                  Смотреть {featured.name}
                  <IconArrow />
                </ButtonLink>
              ) : (
                <ButtonLink href="/tournaments" size="lg">
                  Турниры
                  <IconArrow />
                </ButtonLink>
              )}
              <ButtonLink href={teamHref} variant="secondary" size="lg">
                {player ? "Моя команда" : "Создать команду"}
              </ButtonLink>
            </div>
          </div>
          <CoverImage
            url={featured?.cover_url ?? null}
            className="hidden lg:block aspect-[5/4] rounded-[16px]"
          />
        </Container>
      </section>

      {/* ТЕКУЩИЙ ТУРНИР */}
      <section className="pt-24 md:pt-32">
        <Container>
          {featured ? (
            <CurrentTournament t={featured} approved={counts[featured.id] ?? 0} />
          ) : (
            <EmptyState
              title="Первый турнир скоро будет объявлен"
              description="Соберите команду заранее — когда откроется регистрация, останется подать заявку."
              action={
                <ButtonLink href={teamHref} variant="secondary">
                  {player ? "Моя команда" : "Создать команду"}
                </ButtonLink>
              }
            />
          )}
        </Container>
      </section>

      {/* МАТЧИ — только если они есть */}
      {upcoming.length > 0 && (
        <section className="pt-24 md:pt-32">
          <Container>
            <div className="flex items-end justify-between gap-4 mb-4">
              <h2 className="text-[26px] md:text-[32px] font-bold tracking-[-0.03em]">
                {upcoming.some((m) => m.status === "live") ? "Сейчас в игре" : "Ближайшие матчи"}
              </h2>
              <Link href="/matches" className="text-sm text-fg-3 hover:text-fg">
                Все матчи →
              </Link>
            </div>
            <div className="border-t border-white/[0.06]">
              {upcoming.map((m) => (
                <MatchLine key={m.id} m={m} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* КАК ЭТО РАБОТАЕТ */}
      <section className="pt-24 md:pt-32">
        <Container>
          <h2 className="text-[26px] md:text-[32px] font-bold tracking-[-0.03em]">Как это работает</h2>
          <ol className="mt-10 grid md:grid-cols-3 gap-10 md:gap-12">
            {STEPS.map((s) => (
              <li key={s.n} className="border-t border-line-strong pt-6">
                <span className="num text-sm text-fg-3">{s.n}</span>
                <div className="mt-4 text-xl font-semibold tracking-[-0.02em]">{s.title}</div>
                <p className="mt-2 text-fg-3 leading-relaxed">{s.text}</p>
              </li>
            ))}
          </ol>
        </Container>
      </section>

      {/* ДАЛЬШЕ */}
      <section className="pt-24 md:pt-32">
        <Container>
          <h2 className="text-[26px] md:text-[32px] font-bold tracking-[-0.03em]">Следующие турниры</h2>
          {others.length > 0 ? (
            <div className="mt-4 border-t border-white/[0.06]">
              {others.map((t) => (
                <TournamentLine key={t.id} t={t} approved={counts[t.id] ?? 0} />
              ))}
            </div>
          ) : (
            <p className="mt-3 text-lg text-fg-3">Скоро.</p>
          )}
        </Container>
      </section>
    </>
  );
}
