import type { Metadata } from "next";
import Link from "next/link";
import { CARD, Eyebrow, PageHero, WRAP } from "@/components/primitives";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const revalidate = 30;

export const metadata: Metadata = { title: "Правила" };

const RULES: { title: string; items: string[] }[] = [
  {
    title: "Аккаунт и состав",
    items: [
      "Вход на платформу — только через Steam. SteamID64 — главный идентификатор игрока: по нему пускают на сервер и считают статистику.",
      "Играть можно только со своего Steam-аккаунта. Игра за чужой аккаунт — дисквалификация команды.",
      "Состав зависит от режима: 5×5 — 5 основных и до 2 запасных, 2×2 — 2 основных и запасной, 1×1 — игрок участвует сам, без команды. Один игрок — одна команда в рамках турнира.",
      "До закрытия регистрации капитан меняет состав сам. После закрытия — только администратор и только на заявленных запасных или по уважительной причине.",
    ],
  },
  {
    title: "Регистрация и check-in",
    items: [
      "Заявку подаёт капитан. Администратор проверяет состав и одобряет или отклоняет заявку с указанием причины.",
      "Check-in проходит капитан в отведённое окно (обычно за час до старта). Команда без check-in в сетку не попадает.",
      "Посев: ручной посев администратора, затем средний FACEIT ELO основного состава. После публикации сетки посев не меняется.",
    ],
  },
  {
    title: "Перед матчем",
    items: [
      "Вето карт проходит на странице матча до подключения к серверу. На каждый шаг — 60 секунд; если капитан не успел, карта выбирается случайно.",
      "Адрес сервера появляется на странице матча только у игроков этого матча, после проверки сервера.",
      "Команда должна быть на сервере в течение 15 минут после выдачи адреса. Опоздание больше 15 минут — техническое поражение, если администратор не решил иначе.",
    ],
  },
  {
    title: "Матч",
    items: [
      "Разминка: каждый игрок пишет .ready (или .r). Матч стартует, когда готовы все 10 игроков.",
      "Ножевой раунд: победитель выбирает сторону командой .stay или .switch. В турнирах с фиксированными сторонами ножа нет.",
      "Тактическая пауза — .tac, техническая — .tech. Количество и длительность пауз указаны на странице турнира.",
      "Вылет игрока: команда ставит техническую паузу и ждёт переподключения. Игра вчетвером — по решению капитана.",
      "Переигровка раунда возможна только по решению администратора при сбое сервера.",
      "Замена игрока допускается между картами, по согласованию с администратором.",
      "Каждая карта записывается в демо — запись используется при спорах.",
    ],
  },
  {
    title: "Честная игра и поведение",
    items: [
      "Запрещены читы, макросы и любые сторонние программы, дающие преимущество. Нарушение — дисквалификация команды и бан на платформе.",
      "Запрещено использовать баги карты и игры (выход за пределы карты, «пиксельные» бусты в недоступные места и т.п.).",
      "На LAN запрещено смотреть на мониторы соперников и трансляцию своего матча.",
      "Оскорбления, угрозы и токсичное поведение в чате, голосе или в зале — предупреждение, затем удаление с турнира.",
    ],
  },
  {
    title: "Споры",
    items: [
      "Спор открывает капитан на странице матча — не позже 15 минут после окончания карты, с описанием: раунд, время, игроки.",
      "Матч получает статус «На рассмотрении». Результат не меняется без решения администратора.",
      "Решение администратора видно обеим командам и сохраняется в истории матча. Решения окончательны.",
    ],
  },
  {
    title: "Призы",
    items: [
      "Призы выплачиваются после окончания турнира и закрытия всех споров.",
      "Получатель — капитан команды, если команда не указала иное до начала турнира.",
    ],
  },
];

const FAQ = [
  { q: "Нужен ли FACEIT?", a: "Нет. Если FACEIT-аккаунт привязан к вашему Steam, уровень и ELO подтянутся сами — по ним считается посев. Без FACEIT играть можно." },
  { q: "Как собрать команду?", a: "Нажмите «Создать команду», затем скопируйте ссылку-приглашение на странице команды и отправьте игрокам. Они входят через Steam и нажимают «Вступить»." },
  { q: "Как узнать IP сервера?", a: "Откройте страницу своего матча: после вето и проверки сервера там появится кнопка «Подключиться» и адрес. Её видят только игроки матча." },
  { q: "Как работает вето?", a: "Капитаны по очереди банят и пикают карты на странице матча. BO1: шесть банов, оставшаяся карта — игровая. BO3: бан, бан, пик, пик, бан, бан, последняя — decider." },
  { q: "Что делать, если игрок не пришёл?", a: "Сообщите администратору до начала матча. Его заменят на заявленного запасного — замена сразу уйдёт и на сервер." },
  { q: "Можно ли играть за две команды?", a: "Нет. Один SteamID — одна команда в рамках турнира." },
  { q: "Нужно ли сворачивать игру во время матча?", a: "Нет. До матча — сайт (вето и подключение), во время матча — только CS2. Счёт и статистика попадают на сайт сами." },
  { q: "Что такое F16 Rating и Swing?", a: "F16 Rating — общий показатель игры (убийства, урон, KAST, входы, клатчи). Swing — насколько игрок изменил шанс команды выиграть раунд. По Swing выбирается MVP турнира. Подробности — на странице «Статистика»." },
  { q: "Не согласен с результатом. Что делать?", a: "Капитан открывает спор на странице матча в течение 15 минут после окончания карты. Администратор проверит демо и вынесет решение." },
  { q: "Что-то сломалось или есть вопрос?", a: "Напишите организатору — контакты есть на странице каждого турнира." },
];

export default function RulesPage() {
  return (
    <>
      <PageHero
        eyebrow="Регламент F16 Arena"
        title="Правила и FAQ"
        description="Общие правила платформы. У турнира могут быть свои дополнения — смотрите вкладку «Правила» на его странице."
      />

      {/* мобильное оглавление — горизонтальная лента */}
      <nav className="lg:hidden border-b border-white/[0.06]" aria-label="Разделы правил">
        <div className={`${WRAP} flex gap-2 overflow-x-auto py-4 [scrollbar-width:none]`}>
          {RULES.map((r, i) => (
            <a
              key={r.title}
              href={`#r${i + 1}`}
              className="shrink-0 rounded-full border border-white/[0.1] px-4 h-9 inline-flex items-center text-[13px] text-fg-2"
            >
              {r.title}
            </a>
          ))}
          <a href="#faq" className="shrink-0 rounded-full border border-accent/40 px-4 h-9 inline-flex items-center text-[13px] text-accent">
            FAQ
          </a>
        </div>
      </nav>

      <div className={`${WRAP} pt-12 lg:pt-16 lg:grid lg:grid-cols-[280px_minmax(0,780px)] lg:gap-20`}>
        <nav className="hidden lg:block" aria-label="Разделы правил">
          <div className={`${CARD} sticky top-32 p-6`}>
            <Eyebrow className="mb-5">Содержание</Eyebrow>
            <ol className="space-y-1 text-[14px]">
              {RULES.map((r, i) => (
                <li key={r.title}>
                  <a
                    href={`#r${i + 1}`}
                    className="flex gap-3 rounded-md px-2 py-2 text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg"
                  >
                    <span className="num w-6 text-[12px] text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                    {r.title}
                  </a>
                </li>
              ))}
              <li className="pt-2 mt-2 border-t border-white/[0.06]">
                <a href="#faq" className="flex gap-3 rounded-md px-2 py-2 text-accent transition-colors hover:bg-white/[0.04]">
                  <span className="w-6 text-[12px]">?</span>
                  Частые вопросы
                </a>
              </li>
            </ol>
          </div>
        </nav>

        <article className="min-w-0">
          {RULES.map((r, i) => (
            <section key={r.title} id={`r${i + 1}`} className="scroll-mt-32 pb-14 lg:pb-16">
              <div className="flex items-baseline gap-4">
                <span className="num text-[14px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-fg md:text-[30px]">{r.title}</h2>
              </div>
              <ol className="mt-6 space-y-4 border-l border-white/[0.08] pl-6 sm:ml-2 sm:pl-8">
                {r.items.map((it, j) => (
                  <li key={it} className="text-[16px] leading-[1.75] text-fg-2 lg:text-[17px]">
                    <span className="num mr-3 text-[12px] text-fg-3">
                      {i + 1}.{j + 1}
                    </span>
                    {it}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <section id="faq" className="scroll-mt-32 pt-4">
            <div className="flex items-baseline gap-4">
              <span className="num text-[14px] text-accent">?</span>
              <h2 className="text-[24px] font-semibold tracking-[-0.015em] text-fg md:text-[30px]">Частые вопросы</h2>
            </div>
            <div className={`${CARD} mt-6 divide-y divide-white/[0.06]`}>
              {FAQ.map((f) => (
                <details key={f.q} className="group px-6 py-5 sm:px-7">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium text-fg sm:text-[17px]">
                    {f.q}
                    <span className="grid size-7 shrink-0 place-items-center rounded-full border border-white/[0.12] text-fg-3 transition group-open:rotate-45 group-open:border-accent/50 group-open:text-accent">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pr-10 text-[15px] leading-[1.7] text-fg-2 sm:text-[16px]">{f.a}</p>
                </details>
              ))}
            </div>
            <p className="mt-8 text-[14px] text-fg-3">
              Не нашли ответ? Контакты организатора — на{" "}
              <Link href="/tournaments" className="text-fg-2 underline underline-offset-4 hover:text-fg">
                странице турнира
              </Link>
              .
            </p>
          </section>
        </article>
      </div>
    </>
  );
}
