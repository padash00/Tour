import type { Metadata } from "next";
import { CARD, Eyebrow, OutlineBtn, PageHero, PrimaryBtn, WRAP } from "@/components/primitives";

export const metadata: Metadata = { title: "О платформе" };

const FACTS = [
  { k: "Игра", v: "Counter-Strike 2" },
  { k: "Формат", v: "LAN-турниры в клубе F16" },
  { k: "Режимы", v: "5×5, 2×2, 1×1" },
  { k: "Вход", v: "Через Steam, без паролей" },
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
  { t: "Серверы клуба", d: "Матчи идут на собственных серверах F16 в зале. На сервер заходят только игроки матча." },
  { t: "Честная статистика", d: "Каждый раунд записывается автоматически. Рейтинг и MVP считаются одинаково для всех." },
  { t: "Открытые решения", d: "Решения организатора по спорным ситуациям видят обе команды." },
];

export default function AboutPage() {
  return (
    <>
      <PageHero
        eyebrow="F16 Arena"
        title="О платформе"
        description="Турнирная платформа клуба F16 для Counter-Strike 2. Для команд, которые хотят играть всерьёз: с регламентом, сеткой и статистикой каждого матча."
      />

      <div className={`${WRAP} pt-14 lg:pt-20`}>
        <div className="grid gap-10 lg:grid-cols-[minmax(0,780px)_minmax(0,1fr)] lg:gap-20">
          <div className="space-y-6 text-[17px] leading-[1.75] text-fg-2 lg:text-[19px]">
            <p className="text-fg">
              F16 Arena начиналась как компьютерный клуб. Теперь это ещё и место, где проходят настоящие турниры: с заявками,
              сеткой, вето карт и разбором каждого матча.
            </p>
            <p>
              Мы хотим, чтобы локальный турнир ощущался как большой: понятные правила, честный посев, сервер, который готов к
              началу матча, и результат, который сразу виден на сайте.
            </p>
            <p>Платформа только запускается. Начинаем с первого турнира — и растём вместе с теми, кто в нём играет.</p>
          </div>

          <aside className={`${CARD} h-fit p-7 lg:p-8`}>
            <Eyebrow>Коротко</Eyebrow>
            <dl className="mt-6 divide-y divide-white/[0.06]">
              {FACTS.map((f) => (
                <div key={f.k} className="flex items-baseline justify-between gap-6 py-3.5">
                  <dt className="text-[14px] text-fg-3">{f.k}</dt>
                  <dd className="text-right text-[15px] text-fg">{f.v}</dd>
                </div>
              ))}
            </dl>
          </aside>
        </div>

        <section className="pt-20 lg:pt-28">
          <Eyebrow className="mb-8">Как проходит турнир</Eyebrow>
          <ol className="grid gap-px overflow-hidden rounded-[12px] border border-white/[0.08] bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-5">
            {FLOW.map((f) => (
              <li key={f.n} className="bg-[#0b1420] p-7 lg:p-8">
                <span className="num text-[13px] text-accent">{f.n}</span>
                <div className="mt-4 text-[20px] font-semibold tracking-[-0.01em] text-fg lg:text-[22px]">{f.t}</div>
                <p className="mt-3 text-[15px] leading-[1.6] text-fg-2">{f.d}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="pt-20 lg:pt-28">
          <Eyebrow className="mb-8">Принципы</Eyebrow>
          <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
            {PRINCIPLES.map((p, i) => (
              <div key={p.t} className={i > 0 ? "lg:border-l lg:border-white/[0.08] lg:pl-10" : "lg:pr-10"}>
                <div className="text-[19px] font-semibold text-fg lg:text-[21px]">{p.t}</div>
                <p className="mt-3 text-[15px] leading-[1.6] text-fg-3 lg:text-[16px] lg:pr-6">{p.d}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="pt-20 lg:pt-28">
          <div className={`${CARD} flex flex-col gap-8 p-8 sm:p-10 lg:flex-row lg:items-center lg:justify-between lg:p-12`}>
            <div>
              <div className="text-[26px] font-semibold tracking-[-0.015em] text-fg lg:text-[32px]">Провести турнир в F16</div>
              <p className="mt-3 max-w-xl text-[16px] leading-[1.6] text-fg-2 lg:text-[17px]">
                Хотите турнир для своей команды, компании или сообщества — или стать партнёром? Напишите клубу.
              </p>
            </div>
            <div className="flex flex-wrap gap-4">
              <PrimaryBtn href="/tournaments">Турниры</PrimaryBtn>
              <OutlineBtn href="https://f16-arena.kz">f16-arena.kz ↗</OutlineBtn>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
