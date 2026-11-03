import type { Metadata } from "next";
import Link from "next/link";
import { getT } from "@/lib/i18n/server";
import { tr } from "@/lib/i18n/core";
import { Container, PageTitle, Panel, cn } from "@/components/ds";

// страница одинакова для всех — отдаётся из кэша CDN, обновляется раз в 30 с и сразу после изменений
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Правила",
  description: "Правила турниров по CS2 на F16 Arena: состав и регистрация, check-in, вето карт, матч, честная игра, споры и призы. Частые вопросы.",
  alternates: { canonical: "/rules" },
};

const RULES: { title: string; items: string[] }[] = [
  {
    title: tr("Аккаунт и состав"),
    items: [
      tr("Вход на платформу — только через Steam. SteamID64 — главный идентификатор игрока: по нему пускают на сервер и считают статистику."),
      tr("Играть можно только со своего Steam-аккаунта. Игра за чужой аккаунт — дисквалификация команды."),
      tr("Состав зависит от режима: 5×5 — 5 основных и до 2 запасных, 2×2 — 2 основных и запасной, 1×1 — игрок участвует сам, без команды. Один игрок — одна команда в рамках турнира."),
      tr("До закрытия регистрации капитан меняет состав сам. После закрытия — только администратор и только на заявленных запасных или по уважительной причине."),
    ],
  },
  {
    title: tr("Регистрация и check-in"),
    items: [
      tr("Заявку подаёт капитан. Администратор проверяет состав и одобряет или отклоняет заявку с указанием причины."),
      tr("Check-in проходит капитан в отведённое окно (обычно за час до старта). Команда без check-in в сетку не попадает."),
      tr("Посев: ручной посев администратора, затем средний FACEIT ELO основного состава. После публикации сетки посев не меняется."),
    ],
  },
  {
    title: tr("Перед матчем"),
    items: [
      tr("Вето карт проходит на странице матча до подключения к серверу. На каждый шаг — 60 секунд; если капитан не успел, карта выбирается случайно."),
      tr("Адрес сервера появляется на странице матча только у игроков этого матча, после проверки сервера."),
      tr("Команда должна быть на сервере в течение 15 минут после выдачи адреса. Опоздание больше 15 минут — техническое поражение, если администратор не решил иначе."),
    ],
  },
  {
    title: tr("Матч"),
    items: [
      tr("Разминка: каждый игрок пишет .ready (или .r). Матч стартует, когда готовы все 10 игроков."),
      tr("Ножевой раунд: победитель выбирает сторону командой .stay или .switch. В турнирах с фиксированными сторонами ножа нет."),
      tr("Тактическая пауза — .tac, техническая — .tech. Количество и длительность пауз указаны на странице турнира."),
      tr("Вылет игрока: команда ставит техническую паузу и ждёт переподключения. Игра вчетвером — по решению капитана."),
      tr("Переигровка раунда возможна только по решению администратора при сбое сервера."),
      tr("Замена игрока допускается между картами, по согласованию с администратором."),
      tr("Каждая карта записывается в демо — запись используется при спорах."),
    ],
  },
  {
    title: tr("Честная игра и поведение"),
    items: [
      tr("Запрещены читы, макросы и любые сторонние программы, дающие преимущество. Нарушение — дисквалификация команды и бан на платформе."),
      tr("Запрещено использовать баги карты и игры (выход за пределы карты, «пиксельные» бусты в недоступные места и т.п.)."),
      tr("На LAN запрещено смотреть на мониторы соперников и трансляцию своего матча."),
      tr("Оскорбления, угрозы и токсичное поведение в чате, голосе или (на LAN) в зале — предупреждение, затем удаление с турнира."),
    ],
  },
  {
    title: tr("Споры"),
    items: [
      tr("Спор открывает капитан на странице матча — не позже 15 минут после окончания карты, с описанием: раунд, время, игроки."),
      tr("Матч получает статус «На рассмотрении». Результат не меняется без решения администратора."),
      tr("Решение администратора видно обеим командам и сохраняется в истории матча. Решения окончательны."),
    ],
  },
  {
    title: tr("Призы"),
    items: [
      tr("Призы выплачиваются после окончания турнира и закрытия всех споров."),
      tr("Получатель — капитан команды, если команда не указала иное до начала турнира."),
    ],
  },
];

const FAQ = [
  { q: tr("Нужен ли FACEIT?"), a: tr("Нет. Если FACEIT-аккаунт привязан к вашему Steam, уровень и ELO подтянутся сами — по ним считается посев. Без FACEIT играть можно.") },
  { q: tr("Как собрать команду?"), a: tr("Нажмите «Создать команду», затем скопируйте ссылку-приглашение на странице команды и отправьте игрокам. Они входят через Steam и нажимают «Вступить».") },
  { q: tr("Как узнать IP сервера?"), a: tr("Откройте страницу своего матча: после вето и проверки сервера там появится кнопка «Подключиться» и адрес. Её видят только игроки матча.") },
  { q: tr("Как работает вето?"), a: tr("Капитаны по очереди банят и пикают карты на странице матча. BO1: шесть банов, оставшаяся карта — игровая. BO3: бан, бан, пик, пик, бан, бан, последняя — decider.") },
  { q: tr("Что делать, если игрок не пришёл?"), a: tr("Сообщите администратору до начала матча. Его заменят на заявленного запасного — замена сразу уйдёт и на сервер.") },
  { q: tr("Можно ли играть за две команды?"), a: tr("Нет. Один SteamID — одна команда в рамках турнира.") },
  { q: tr("Нужно ли сворачивать игру во время матча?"), a: tr("Нет. До матча — сайт (вето и подключение), во время матча — только CS2. Счёт и статистика попадают на сайт сами.") },
  { q: tr("Что такое F16 Rating и Swing?"), a: tr("F16 Rating — общий показатель игры (убийства, урон, KAST, входы, клатчи). Swing — насколько игрок изменил шанс команды выиграть раунд. По Swing выбирается MVP турнира. Подробности — на странице «Статистика».") },
  { q: tr("Не согласен с результатом. Что делать?"), a: tr("Капитан открывает спор на странице матча в течение 15 минут после окончания карты. Администратор проверит демо и вынесет решение.") },
  { q: tr("Что-то сломалось или есть вопрос?"), a: tr("Напишите организатору — контакты есть на странице каждого турнира.") },
];

export default async function RulesPage() {
  const t = await getT();
  return (
    <>
      <Container width="wide" className="pb-8 pt-8 sm:pt-10">
        <PageTitle>{t("Правила и FAQ")}</PageTitle>
        <p className="mt-2 max-w-[760px] text-[15px] leading-relaxed text-fg-2">
          {t("Общие правила платформы F16 Arena. У конкретного турнира могут быть дополнительные условия — они публикуются на его странице.")}
        </p>
      </Container>

      <nav className="border-y border-line-subtle bg-shell lg:hidden" aria-label={t("Разделы правил")}>
        <Container width="wide" className="flex gap-2 overflow-x-auto py-3 [scrollbar-width:none]">
          {RULES.map((rule, i) => (
            <a
              key={rule.title}
              href={`#r${i + 1}`}
              className="inline-flex h-9 shrink-0 items-center rounded-chip border border-line px-4 text-meta text-fg-2"
            >
              {t(rule.title)}
            </a>
          ))}
          <a href="#faq" className="inline-flex h-9 shrink-0 items-center rounded-chip border border-accent/40 px-4 text-meta text-accent">
            FAQ
          </a>
        </Container>
      </nav>

      <Container width="wide" className="grid gap-12 pb-16 pt-10 lg:grid-cols-[260px_minmax(0,780px)] lg:gap-16">
        <nav className="hidden lg:block" aria-label={t("Разделы правил")}>
          <Panel className="sticky top-[calc(var(--shell-h)+24px)]">
            <div className="mb-4 text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">{t("Содержание")}</div>
            <ol className="space-y-1 text-[14px]">
              {RULES.map((rule, i) => (
                <li key={rule.title}>
                  <a href={`#r${i + 1}`} className="flex gap-3 rounded-control px-2 py-2 text-fg-2 transition-colors hover:bg-ink/[0.04] hover:text-fg">
                    <span className="num w-6 text-micro text-fg-3">{String(i + 1).padStart(2, "0")}</span>
                    {t(rule.title)}
                  </a>
                </li>
              ))}
              <li className="mt-2 border-t border-line-subtle pt-2">
                <a href="#faq" className="flex gap-3 rounded-control px-2 py-2 text-accent hover:bg-ink/[0.04]">
                  <span className="w-6 text-micro">?</span>
                  {t("Частые вопросы")}
                </a>
              </li>
            </ol>
          </Panel>
        </nav>

        <article className="min-w-0">
          {RULES.map((rule, i) => (
            <section key={rule.title} id={`r${i + 1}`} className="mb-5 scroll-mt-[calc(var(--shell-h)+24px)] rounded-surface border border-line-subtle bg-surface p-5 sm:p-7">
              <div className="flex items-baseline gap-4">
                <span className="num text-meta text-accent">{String(i + 1).padStart(2, "0")}</span>
                <h2 className="text-heading text-fg">{t(rule.title)}</h2>
              </div>
              <ol className="mt-5 space-y-4 border-l border-line-subtle pl-5 sm:ml-2 sm:pl-7">
                {rule.items.map((item, j) => (
                  <li key={item} className="text-[15px] leading-[1.75] text-fg-2">
                    <span className="num mr-3 text-micro text-fg-3">{i + 1}.{j + 1}</span>
                    {t(item)}
                  </li>
                ))}
              </ol>
            </section>
          ))}

          <section id="faq" className="scroll-mt-[calc(var(--shell-h)+24px)] rounded-surface border border-line-subtle bg-surface p-5 sm:p-7">
            <div className="flex items-baseline gap-4">
              <span className="num text-meta text-accent">?</span>
              <h2 className="text-heading text-fg">{t("Частые вопросы")}</h2>
            </div>

            <Panel padded={false} className="mt-5 divide-y divide-line-subtle overflow-hidden">
              {FAQ.map((item) => (
                <details key={item.q} className="group px-5 py-4 sm:px-6">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[15px] font-medium text-fg">
                    {t(item.q)}
                    <span className={cn("grid size-7 shrink-0 place-items-center rounded-full border border-line text-fg-3 transition-transform", "group-open:rotate-45 group-open:border-accent/50 group-open:text-accent")}>
                      +
                    </span>
                  </summary>
                  <p className="mt-3 pr-8 text-[14px] leading-[1.7] text-fg-2">{t(item.a)}</p>
                </details>
              ))}
            </Panel>

            <p className="mt-7 text-meta text-fg-3">
              {t.rich("Не нашли ответ? Контакты организатора указаны на <a>странице турнира</a>.", {
                a: (c) => (
                  <Link href="/tournaments" className="text-fg-2 underline underline-offset-4 hover:text-fg">
                    {c}
                  </Link>
                ),
              })}
            </p>
          </section>
        </article>
      </Container>
    </>
  );
}
