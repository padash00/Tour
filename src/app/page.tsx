import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { approvedCounts, getFeaturedTournament, listPublicTournaments } from "@/lib/data";
import { getUpcomingMatches } from "@/lib/matches";
import { MatchRow } from "@/components/match-bits";
import { FeaturedTournament, MapGraphic, TournamentRow } from "@/components/tournament-bits";
import {
  ButtonLink,
  Container,
  EmptyState,
  IconArrow,
  IconChart,
  IconServer,
  IconShield,
  IconSteam,
  IconTrophy,
  IconUsers,
  SectionTitle,
} from "@/components/ui";

export default async function HomePage() {
  const [player, featured, all, upcoming] = await Promise.all([
    getCurrentPlayer(),
    getFeaturedTournament(),
    listPublicTournaments(),
    getUpcomingMatches(6),
  ]);
  const others = all.filter(
    (t) => t.id !== featured?.id && !["finished", "cancelled"].includes(t.status),
  );
  const counts = await approvedCounts(all.map((t) => t.id));

  return (
    <>
      {/* HERO */}
      <section className="relative overflow-hidden border-b border-line/60">
        <div className="absolute inset-0 atmos" />
        <div className="absolute inset-0 grid-lines" />
        <Container className="relative grid lg:grid-cols-[1.1fr_1fr] gap-12 items-center pt-20 pb-24 md:pt-28 md:pb-32">
          <div>
            <div className="inline-flex items-center gap-2 h-7 px-3 rounded-full border border-line bg-surface/60 text-xs text-fg-2">
              <span className="size-1.5 rounded-full bg-warm" />
              Counter-Strike 2 · 5v5 · LAN
            </div>
            <h1 className="mt-7 text-[44px] sm:text-6xl lg:text-[76px] font-bold tracking-[-0.045em] leading-[0.95]">
              Соревнуйся
              <br />
              <span className="text-fg-3">на настоящем</span>
              <br />
              уровне.
            </h1>
            <p className="mt-7 max-w-md text-[17px] text-fg-2 leading-relaxed">
              F16 Arena — турнирная платформа для CS2. Вход через Steam, своя команда, сетка, вето карт и
              статистика каждого матча — без таблиц и ручной работы.
            </p>
            <div className="mt-10 flex flex-wrap gap-3">
              {featured ? (
                <ButtonLink href={`/tournaments/${featured.slug}`} size="lg">
                  Смотреть турнир
                  <IconArrow />
                </ButtonLink>
              ) : (
                <ButtonLink href="/tournaments" size="lg">
                  Турниры
                  <IconArrow />
                </ButtonLink>
              )}
              {player ? (
                <ButtonLink href="/team" variant="secondary" size="lg">
                  Моя команда
                </ButtonLink>
              ) : (
                <ButtonLink href="/login?next=/team/create" variant="secondary" size="lg">
                  <IconSteam />
                  Создать команду
                </ButtonLink>
              )}
            </div>
          </div>

          <div className="relative hidden lg:block">
            <div className="card relative aspect-[4/3] overflow-hidden">
              <MapGraphic className="absolute inset-0 h-full w-full" />
              <div className="absolute inset-x-0 bottom-0 p-6 bg-gradient-to-t from-bg via-bg/70 to-transparent">
                <div className="flex items-end justify-between">
                  <div>
                    <div className="label">Arena</div>
                    <div className="mt-1 text-lg font-semibold">Выделенные серверы F16</div>
                  </div>
                  <div className="text-right text-xs text-fg-3 leading-relaxed">
                    MatchZy
                    <br />
                    Demo каждой карты
                  </div>
                </div>
              </div>
            </div>
            <div className="absolute -bottom-6 -left-6 card px-4 py-3 flex items-center gap-3">
              <span className="grid place-items-center size-9 rounded-lg bg-accent-dim text-accent">
                <IconShield className="size-[18px]" />
              </span>
              <div>
                <div className="text-sm font-semibold">Только заявленные игроки</div>
                <div className="text-xs text-fg-3">Доступ на сервер по SteamID</div>
              </div>
            </div>
          </div>
        </Container>
      </section>

      {/* CURRENT TOURNAMENT */}
      <section className="pt-20">
        <Container>
          <SectionTitle eyebrow="Сейчас" title="Главный турнир" />
          {featured ? (
            <FeaturedTournament t={featured} approved={counts[featured.id] ?? 0} />
          ) : (
            <EmptyState
              icon={<IconTrophy />}
              title="Первый турнир скоро будет объявлен"
              description="Уже сейчас можно войти через Steam и собрать команду — так вы будете готовы к открытию регистрации."
              action={
                <ButtonLink href={player ? "/team" : "/login?next=/team/create"} variant="secondary">
                  {player ? "Моя команда" : "Войти и создать команду"}
                </ButtonLink>
              }
            />
          )}
        </Container>
      </section>

      {/* MATCHES */}
      {upcoming.length > 0 && (
        <section className="pt-20">
          <Container>
            <SectionTitle
              eyebrow={upcoming.some((m) => m.status === "live") ? "Сейчас в игре" : "Расписание"}
              title="Ближайшие матчи"
              action={
                featured ? (
                  <Link href={`/tournaments/${featured.slug}?tab=matches`} className="text-sm text-fg-3 hover:text-fg">
                    Все матчи →
                  </Link>
                ) : null
              }
            />
            <div className="grid md:grid-cols-2 gap-3">
              {upcoming.map((m) => (
                <MatchRow key={m.id} m={m} stage={m.tournament.name} />
              ))}
            </div>
          </Container>
        </section>
      )}

      {/* HOW IT WORKS */}
      <section className="pt-24">
        <Container>
          <SectionTitle eyebrow="Как это работает" title="Три шага до первого матча" />
          <div className="grid md:grid-cols-3 gap-4">
            {[
              {
                n: "01",
                title: "Войдите через Steam",
                text: "Без паролей и отдельной регистрации. FACEIT-профиль подтянется автоматически.",
                icon: <IconSteam className="size-5" />,
              },
              {
                n: "02",
                title: "Соберите команду",
                text: "Создайте команду и отправьте игрокам ссылку-приглашение. 5 основных и до 2 запасных.",
                icon: <IconUsers />,
              },
              {
                n: "03",
                title: "Подайте заявку",
                text: "Капитан регистрирует состав на турнир, проходит check-in — и команда в сетке.",
                icon: <IconTrophy />,
              },
            ].map((s) => (
              <div key={s.n} className="card p-6">
                <div className="flex items-center justify-between">
                  <span className="grid place-items-center size-10 rounded-xl border border-line bg-bg-2 text-accent">
                    {s.icon}
                  </span>
                  <span className="num text-sm text-fg-3">{s.n}</span>
                </div>
                <div className="mt-8 text-lg font-semibold tracking-tight">{s.title}</div>
                <p className="mt-2 text-sm text-fg-3 leading-relaxed">{s.text}</p>
              </div>
            ))}
          </div>
        </Container>
      </section>

      {/* WHY */}
      <section className="pt-24">
        <Container>
          <div className="grid lg:grid-cols-[1fr_1.6fr] gap-10 lg:gap-16">
            <div>
              <div className="label mb-3">Почему F16 Arena</div>
              <h2 className="text-3xl md:text-4xl font-bold tracking-[-0.03em] leading-tight">
                Турнир, который
                <br />
                работает сам.
              </h2>
              <p className="mt-5 text-fg-2 leading-relaxed max-w-sm">
                Мы строим соревновательную систему, в которой организатору не нужно вручную вписывать счёт, а
                игроку — делать Alt+Tab посреди матча.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 gap-px rounded-[14px] overflow-hidden border border-line bg-line">
              {[
                { icon: <IconSteam className="size-5" />, title: "Вход через Steam", text: "SteamID — единый идентификатор игрока: сайт, команда, сервер и статистика." },
                { icon: <IconChart />, title: "Автоматическая статистика", text: "K/D, ADR, KAST, entry, клатчи — собираются прямо с игрового сервера." },
                { icon: <IconServer />, title: "Реальные серверы", text: "Выделенные CS2-серверы с MatchZy: ready, knife, паузы и демо каждой карты." },
                { icon: <IconShield />, title: "Честная система", text: "На сервер заходят только заявленные игроки. Все решения админов — в журнале." },
              ].map((f) => (
                <div key={f.title} className="bg-surface p-7">
                  <span className="text-accent">{f.icon}</span>
                  <div className="mt-5 font-semibold">{f.title}</div>
                  <p className="mt-2 text-sm text-fg-3 leading-relaxed">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
        </Container>
      </section>

      {/* MORE */}
      <section className="pt-24">
        <Container>
          <SectionTitle eyebrow="Дальше" title="Другие турниры" />
          {others.length > 0 ? (
            <div className="grid gap-3">
              {others.map((t) => (
                <TournamentRow key={t.id} t={t} approved={counts[t.id] ?? 0} />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title="Следующие турниры скоро появятся"
              description="Платформа только запускается. Новые события будут публиковаться здесь — следите за анонсами F16."
            />
          )}
        </Container>
      </section>
    </>
  );
}
