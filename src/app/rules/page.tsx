import type { Metadata } from "next";
import { Card, Container, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Правила и FAQ" };

const RULES = [
  {
    title: "Аккаунт и состав",
    items: [
      "Вход на платформу — только через Steam. SteamID64 — главный идентификатор игрока.",
      "Команда: 5 основных игроков и до 2 запасных.",
      "Один игрок может состоять только в одной команде и в одном составе турнира.",
      "До закрытия регистрации капитан свободно меняет состав. После закрытия — только через администратора.",
    ],
  },
  {
    title: "Регистрация и check-in",
    items: [
      "Заявку на турнир подаёт капитан. Заявку рассматривает администратор.",
      "Перед началом турнира капитан проходит check-in в отведённое окно.",
      "Команды без check-in в сетку не попадают.",
    ],
  },
  {
    title: "Матч",
    items: [
      "Вето карт проходит на странице матча до подключения к серверу.",
      "На сервер допускаются только игроки из заявленного состава — по SteamID.",
      "В разминке каждый игрок пишет .ready (или .r). Матч стартует, когда готовы все 10.",
      "После ножевого раунда победитель выбирает сторону: .stay или .switch.",
      "Тактические и технические паузы — по регламенту турнира.",
      "Каждая карта записывается в демо.",
    ],
  },
  {
    title: "Споры",
    items: [
      "Спорный матч получает статус «на рассмотрении». Результат не меняется без решения администратора.",
      "Все ручные действия администраторов фиксируются в журнале.",
    ],
  },
];

const FAQ = [
  { q: "Нужен ли FACEIT?", a: "Нет. Если FACEIT-профиль привязан к вашему Steam, мы подтянем уровень и ELO автоматически — это используется для посева." },
  { q: "Как пригласить игроков?", a: "Капитан копирует ссылку-приглашение на странице команды и отправляет её игрокам. Они входят через Steam и подтверждают вступление." },
  { q: "Можно ли играть за две команды?", a: "Нет. Один SteamID — одна команда в рамках одного турнира." },
  { q: "Нужно ли сворачивать игру во время матча?", a: "Нет. До матча — сайт (вето и подключение), во время матча — только CS2." },
];

export default function RulesPage() {
  return (
    <Container className="max-w-4xl">
      <PageHeader
        eyebrow="Регламент"
        title="Правила и FAQ"
        description="Общие правила платформы. У каждого турнира может быть собственный регламент — смотрите вкладку «Правила» на странице турнира."
      />
      <div className="space-y-4">
        {RULES.map((r, i) => (
          <Card key={r.title} className="p-6 sm:p-8">
            <div className="flex items-baseline gap-4">
              <span className="num text-sm text-fg-3">0{i + 1}</span>
              <h2 className="text-xl font-bold tracking-tight">{r.title}</h2>
            </div>
            <ul className="mt-5 space-y-3 pl-8">
              {r.items.map((it) => (
                <li key={it} className="text-[15px] text-fg-2 leading-relaxed relative before:absolute before:-left-4 before:top-[11px] before:size-1 before:rounded-full before:bg-fg-3">
                  {it}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <h2 className="mt-16 mb-5 text-2xl font-bold tracking-tight">Частые вопросы</h2>
      <div className="card divide-y divide-line">
        {FAQ.map((f) => (
          <details key={f.q} className="group p-6">
            <summary className="list-none cursor-pointer flex items-center justify-between gap-4 font-medium">
              {f.q}
              <span className="text-fg-3 transition group-open:rotate-45 text-xl leading-none">+</span>
            </summary>
            <p className="mt-3 text-fg-2 text-[15px] leading-relaxed">{f.a}</p>
          </details>
        ))}
      </div>
    </Container>
  );
}
