import type { Metadata } from "next";
import { ButtonLink, Card, Container, IconChart, IconServer, IconShield, IconSteam, IconTrophy, IconUsers, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "О платформе" };

const FLOW = [
  {
    stage: "До матча",
    place: "сайт",
    steps: ["Вход через Steam", "Команда и приглашения", "Заявка и check-in", "Вето карт", "Кнопка «Подключиться»"],
  },
  {
    stage: "Во время матча",
    place: "только CS2",
    steps: [".ready в разминке", "Ножевой раунд, .stay / .switch", "Игра — паузы .tac / .tech", "Счёт сам уходит на сайт"],
  },
  {
    stage: "После матча",
    place: "сайт",
    steps: ["Сетка обновляется сама", "Статистика и Swing", "Демо каждой карты", "MVP турнира"],
  },
];

export default function AboutPage() {
  return (
    <Container className="max-w-5xl">
      <PageHeader
        eyebrow="F16 Arena"
        title="О платформе"
        description="F16 Arena — турнирная система для LAN-соревнований по CS2 в клубе F16. Мы строим её так, чтобы турнир работал сам: без таблиц, ручного счёта и Alt+Tab посреди игры."
      />

      <section className="grid md:grid-cols-3 gap-4">
        {FLOW.map((f, i) => (
          <Card key={f.stage} className="p-6">
            <div className="flex items-center justify-between">
              <span className="num text-xs text-fg-3">0{i + 1}</span>
              <span className="text-[11px] uppercase tracking-wider text-accent">{f.place}</span>
            </div>
            <div className="mt-4 text-lg font-semibold">{f.stage}</div>
            <ul className="mt-4 space-y-2.5 text-sm text-fg-2">
              {f.steps.map((s) => (
                <li key={s} className="flex items-center gap-2.5">
                  <span className="size-1.5 rounded-full bg-accent" />
                  {s}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </section>

      <section className="mt-16">
        <h2 className="text-2xl font-bold tracking-tight mb-6">Как это устроено</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px rounded-[14px] overflow-hidden border border-line bg-line">
          {[
            { icon: <IconSteam className="size-5" />, t: "Steam — единый аккаунт", d: "SteamID связывает сайт, команду, турнирный состав, сервер и статистику. Паролей у нас нет." },
            { icon: <IconUsers />, t: "Команды и составы", d: "Капитан собирает команду по ссылке. Составы на турнир хранятся навсегда — история не теряется." },
            { icon: <IconTrophy />, t: "Сетка и вето", d: "Double или Single Elimination, баи, посев по FACEIT ELO. Вето проходит на сайте до подключения." },
            { icon: <IconServer />, t: "Серверы F16", d: "Выделенные CS2-серверы с MatchZy в локальной сети клуба. Матч загружается автоматически, на сервер пускают только заявленных игроков." },
            { icon: <IconChart />, t: "Статистика", d: "Каждый раунд приходит с сервера: K/D, ADR, KAST, входы, клатчи, F16 Rating и Swing. MVP турнира — по Swing." },
            { icon: <IconShield />, t: "Прозрачность", d: "Все ручные действия администраторов пишутся в журнал. Споры решаются открыто, решение видят обе команды." },
          ].map((b) => (
            <div key={b.t} className="bg-surface p-7">
              <span className="text-accent">{b.icon}</span>
              <div className="mt-5 font-semibold">{b.t}</div>
              <p className="mt-2 text-sm text-fg-3 leading-relaxed">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-16 grid md:grid-cols-2 gap-4">
        <Card className="p-7">
          <div className="label">Игрокам</div>
          <p className="mt-3 text-fg-2 leading-relaxed">
            Войдите через Steam, соберите команду и следите за анонсами турниров. Вся статистика ваших матчей остаётся в
            профиле между турнирами.
          </p>
          <div className="mt-6 flex gap-3">
            <ButtonLink href="/tournaments">Турниры</ButtonLink>
            <ButtonLink href="/rules" variant="secondary">Правила</ButtonLink>
          </div>
        </Card>
        <Card className="p-7">
          <div className="label">Организаторам и партнёрам</div>
          <p className="mt-3 text-fg-2 leading-relaxed">
            Хотите провести турнир в F16 или стать партнёром? Свяжитесь с клубом — контакты на сайте F16 Arena.
          </p>
          <div className="mt-6">
            <ButtonLink href="https://f16-arena.kz" variant="secondary">f16-arena.kz ↗</ButtonLink>
          </div>
        </Card>
      </section>
    </Container>
  );
}
