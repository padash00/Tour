import type { Metadata } from "next";
import { Button, Container, Facts, PageTitle, Panel, Region, Section, cn } from "@/components/ds";

export const revalidate = 30;
export const metadata: Metadata = { title: "О платформе" };

const FACTS = [
  { label: "Игра", value: "Counter-Strike 2" },
  { label: "Формат", value: "LAN-турниры в клубе F16" },
  { label: "Режимы", value: "5×5, 2×2, 1×1" },
  { label: "Вход", value: "Через Steam, без паролей" },
];

const FLOW = [
  { n: "01", t: "Команда", d: "Капитан создаёт команду и отправляет игрокам ссылку-приглашение." },
  { n: "02", t: "Заявка", d: "Капитан подаёт заявку на турнир, организатор проверяет состав." },
  { n: "03", t: "Check-in", d: "В день турнира команда подтверждает участие — и попадает в сетку." },
  { n: "04", t: "Матч", d: "Вето карт на сайте, затем кнопка «Подключиться» — и игра на сервере клуба." },
  { n: "05", t: "Итоги", d: "Счёт, сетка и статистика каждого игрока обновляются сами." },
];

const PRINCIPLES = [
  { t: "Один аккаунт", d: "Steam связывает игрока с командой, турниром и статистикой. Регистрироваться отдельно не нужно." },
  { t: "Серверы клуба", d: "Матчи идут на собственных серверах F16. На сервер заходят только участники конкретного матча." },
  { t: "Честная статистика", d: "Раунды и события записываются автоматически. Рейтинг и MVP считаются одинаково для всех." },
  { t: "Открытые решения", d: "Решения организатора по спорным ситуациям сохраняются и видны участникам." },
];

export default function AboutPage() {
  return (
    <>
      <Container width="wide" className="pb-12 pt-8 sm:pt-10">
        <PageTitle>О платформе</PageTitle>
        <p className="mt-2 max-w-[760px] text-[16px] leading-relaxed text-fg-2">
          Турнирная платформа клуба F16 для Counter-Strike 2: команды, заявки, check-in, сетка, серверы и статистика матчей в одном месте.
        </p>

        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,760px)_minmax(0,1fr)] lg:gap-16">
          <div className="space-y-5 text-[16px] leading-[1.75] text-fg-2">
            <p className="text-fg">
              F16 Arena начиналась как компьютерный клуб. Теперь это ещё и турнирная система, где локальный матч проходит с теми же понятными этапами, что и крупное соревнование.
            </p>
            <p>
              Капитан собирает состав, команда проходит регистрацию и check-in, капитаны проводят вето, сервер готовится автоматически, а результат и статистика возвращаются на сайт.
            </p>
            <p>Цель — чтобы игроку не приходилось разбираться в технической части турнира: интерфейс показывает текущее состояние и следующий шаг.</p>
          </div>

          <Panel>
            <Facts items={FACTS} columns={2} />
          </Panel>
        </div>
      </Container>

      <Region>
        <Container width="wide">
          <Section title="Как проходит турнир">
            <ol className="grid overflow-hidden rounded-surface border border-line-subtle bg-line-subtle sm:grid-cols-2 lg:grid-cols-5">
              {FLOW.map((item) => (
                <li key={item.n} className="bg-surface p-5 sm:p-6">
                  <div className="num text-meta font-semibold text-accent">{item.n}</div>
                  <div className="mt-3 text-title text-fg">{item.t}</div>
                  <p className="mt-2 text-[14px] leading-relaxed text-fg-2">{item.d}</p>
                </li>
              ))}
            </ol>
          </Section>
        </Container>
      </Region>

      <Container width="wide" className="py-12 sm:py-14">
        <Section title="Принципы">
          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {PRINCIPLES.map((item, i) => (
              <div key={item.t} className={cn(i > 0 && "lg:border-l lg:border-line-subtle lg:pl-8", i < PRINCIPLES.length - 1 && "lg:pr-8")}>
                <div className="text-title text-fg">{item.t}</div>
                <p className="mt-2 text-[14px] leading-relaxed text-fg-3">{item.d}</p>
              </div>
            ))}
          </div>
        </Section>

        <div className="mt-14 flex flex-col gap-6 rounded-feature border border-line-subtle bg-surface p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-heading text-fg">Провести турнир в F16</div>
            <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-fg-2">
              Для своей команды, компании или сообщества — напишите клубу, если хотите организовать турнир или стать партнёром.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button href="/tournaments">Турниры</Button>
            <Button href="https://f16-arena.kz" external variant="secondary">f16-arena.kz ↗</Button>
          </div>
        </div>
      </Container>
    </>
  );
}
