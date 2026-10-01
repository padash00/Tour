import type { Metadata } from "next";
import { OutlineBtn, PrimaryBtn, WRAP } from "@/components/public/home";
import { PageHero, SectionLabel } from "@/components/public/page-hero";

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
    <>
      <PageHero
        eyebrow="F16 Arena"
        title="О платформе"
        description="Соревновательная платформа для CS2 при клубе F16. LAN-турниры для команд, которые хотят играть всерьёз: с регламентом, настоящими серверами и статистикой каждого матча."
      />
      <div className={`${WRAP} pt-14 max-w-[1100px] lg:ml-0`}>
      <p className="text-[17px] lg:text-[19px] text-fg-2 leading-[1.7] max-w-[780px]">
        Платформа только запускается. Мы начинаем с одного турнира и растём вместе с теми, кто в нём играет.
      </p>

      <section className="pt-16">
        <SectionLabel>Как проходит турнир</SectionLabel>
        <ol className="mt-2">
          {FLOW.map((f, i) => (
            <li key={f.stage} className="grid sm:grid-cols-[48px_200px_1fr] gap-2 sm:gap-6 py-6 border-t border-white/[0.06]">
              <span className="num text-sm text-fg-3">0{i + 1}</span>
              <div>
                <div className="font-semibold lg:text-[18px]">{f.stage}</div>
                <div className="text-[13px] text-fg-3 mt-0.5">{f.place}</div>
              </div>
              <p className="text-fg-2 leading-relaxed lg:text-[17px]">{f.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="pt-16">
        <SectionLabel>Принципы</SectionLabel>
        <div className="mt-6 grid sm:grid-cols-2 gap-4">
          {PRINCIPLES.map((b) => (
            <div key={b.t} className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-8">
              <div className="text-[20px] lg:text-[22px] font-semibold tracking-[-0.01em]">{b.t}</div>
              <p className="mt-3 text-fg-2 leading-relaxed lg:text-[17px]">{b.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="pt-16">
        <SectionLabel>Связаться</SectionLabel>
        <p className="text-fg-2 leading-relaxed max-w-xl lg:text-[17px]">
          Хотите провести турнир в F16 или стать партнёром — напишите клубу.
        </p>
        <div className="mt-8 flex flex-wrap gap-4">
          <PrimaryBtn href="/tournaments">Турниры</PrimaryBtn>
          <OutlineBtn href="https://f16-arena.kz">f16-arena.kz ↗</OutlineBtn>
        </div>
      </section>
      </div>
    </>
  );
}
