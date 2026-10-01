import type { Metadata } from "next";
import { ButtonLink, Container } from "@/components/ui";

export const metadata: Metadata = { title: "О платформе" };

const FLOW = [
  { stage: "До матча", place: "На сайте", text: "Вход через Steam, команда, заявка, check-in и вето карт. Адрес сервера появляется на странице матча." },
  { stage: "Во время матча", place: "Только в CS2", text: "Ничего не нужно сворачивать: счёт и статистика попадают на сайт сами." },
  { stage: "После матча", place: "На сайте", text: "Сетка обновляется, в профилях появляется статистика каждой карты." },
];

const PRINCIPLES = [
  { t: "Один аккаунт", d: "Steam связывает игрока с командой, турниром, сервером и статистикой. Паролей у нас нет." },
  { t: "Реальные серверы", d: "Матчи проходят на выделенных серверах F16 в локальной сети клуба. Зайти могут только заявленные игроки." },
  { t: "Честная статистика", d: "Каждый раунд считается с игрового сервера. F16 Rating и Swing — по открытым формулам." },
  { t: "Открытые решения", d: "Действия администраторов записываются в журнал. Решения по спорам видят обе команды." },
];

export default function AboutPage() {
  return (
    <Container size="narrow">
      <header className="pt-16 pb-14 md:pt-24">
        <h1 className="text-[40px] md:text-[56px] font-bold tracking-[-0.04em] leading-[1]">О платформе</h1>
        <p className="mt-8 text-[19px] md:text-[21px] text-fg leading-[1.55]">
          F16 Arena — соревновательная платформа для CS2 при клубе F16. Мы проводим LAN-турниры для команд, которые
          хотят играть всерьёз: с регламентом, настоящими серверами и статистикой каждого матча.
        </p>
        <p className="mt-5 text-[17px] text-fg-2 leading-[1.7]">
          Платформа только запускается. Мы начинаем с одного турнира и растём вместе с теми, кто в нём играет.
        </p>
      </header>

      <section className="pt-6">
        <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Как проходит турнир</h2>
        <ol className="mt-8">
          {FLOW.map((f, i) => (
            <li key={f.stage} className="grid sm:grid-cols-[48px_200px_1fr] gap-2 sm:gap-6 py-6 border-t border-white/[0.06]">
              <span className="num text-sm text-fg-3">0{i + 1}</span>
              <div>
                <div className="font-semibold">{f.stage}</div>
                <div className="text-[13px] text-fg-3 mt-0.5">{f.place}</div>
              </div>
              <p className="text-fg-2 leading-relaxed">{f.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-20">
        <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Принципы</h2>
        <div className="mt-8 grid sm:grid-cols-2 gap-x-12 gap-y-10">
          {PRINCIPLES.map((b) => (
            <div key={b.t}>
              <div className="text-lg font-semibold tracking-[-0.01em]">{b.t}</div>
              <p className="mt-2 text-fg-2 leading-relaxed">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-20">
        <h2 className="text-[26px] md:text-[30px] font-bold tracking-[-0.03em]">Связаться</h2>
        <p className="mt-4 text-fg-2 leading-relaxed max-w-xl">
          Хотите провести турнир в F16 или стать партнёром — напишите клубу.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <ButtonLink href="/tournaments">Турниры</ButtonLink>
          <ButtonLink href="https://f16-arena.kz" variant="secondary">
            f16-arena.kz ↗
          </ButtonLink>
        </div>
      </section>
    </Container>
  );
}
