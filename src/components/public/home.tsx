import Image from "next/image";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { bracketLabel, formatDate, formatMoney } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import type { Tournament } from "@/lib/types";
import { Button, Container, Eyebrow, Status, cn, tournamentStatus } from "@/components/ds";
import { TeamCta } from "./team-cta";

/*
 * Главная F16 Arena — по утверждённому макету (F16_Homepage_Approved_Reference.png).
 * Только отображение: данные приходят из app/page.tsx.
 */

export type HomeData = {
  featured: Tournament | null;
  approved: number;
  /** турниров до этого не было — «первый турнир платформы» */
  isFirst: boolean;
  upcoming: Tournament[];
  /** больше не используется: кнопка команды уточняется на клиенте (TeamCta) */
  loggedIn?: boolean;
};

const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round", strokeLinejoin: "round" } as const;

const Icon = {
  calendar: (c = "size-6") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  ),
  globe: (c = "size-6") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.5 2.6 3.6 5.4 3.6 8.5s-1.1 5.9-3.6 8.5c-2.5-2.6-3.6-5.4-3.6-8.5S9.5 6.1 12 3.5Z" />
    </svg>
  ),
  users: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <circle cx="9" cy="8.5" r="3.2" />
      <path d="M3 19c.6-3.2 3-5 6-5s5.4 1.8 6 5" />
      <circle cx="16.5" cy="9" r="2.6" />
      <path d="M17 14c2.3.3 3.7 1.9 4 4.5" />
    </svg>
  ),
  trophy: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <path d="M7.5 4h9v5a4.5 4.5 0 0 1-9 0V4Z" />
      <path d="M7.5 6H4.5v1.2A3 3 0 0 0 7.5 10M16.5 6h3v1.2a3 3 0 0 1-3 3M12 13.5v3.5M8.5 20h7M10 17h4v3h-4z" />
    </svg>
  ),
  bars: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <path d="M5 20v-4M9.5 20v-7M14 20v-10M18.5 20V4" />
    </svg>
  ),
  shield: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <path d="M12 3 5 6v5.5c0 4.4 3 8.1 7 9.5 4-1.4 7-5.1 7-9.5V6l-7-3Z" />
    </svg>
  ),
  bolt: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <path d="M13 3 5 13.5h6L10.5 21 19 10.5h-6L13 3Z" />
    </svg>
  ),
  star: (c = "size-7") => (
    <svg viewBox="0 0 24 24" className={c} {...stroke} aria-hidden>
      <path d="m12 3.5 2.6 5.4 5.9.8-4.3 4.1 1 5.8L12 16.8l-5.2 2.8 1-5.8-4.3-4.1 5.9-.8L12 3.5Z" />
    </svg>
  ),
};

// ───────────────────────── hero

function Hero({ featured }: Pick<HomeData, "featured">) {
  return (
    <section className="relative -mt-[var(--header-h)] overflow-hidden">
      {/* фото из утверждённого макета — справа, растворяется в фоне */}
      <div className="pointer-events-none absolute inset-y-0 right-0 w-full md:w-[64%] lg:w-[58%]">
        <Image src="/home/hero.jpg" alt="" fill priority sizes="(min-width: 768px) 60vw, 100vw" className="object-cover object-[30%_top]" />
        <div className="absolute inset-0 bg-gradient-to-r from-bg via-bg/10 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-bg to-transparent" />
        <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-bg/70 to-transparent" />
        <div className="absolute inset-0 bg-bg/55 md:bg-transparent" />
      </div>

      <Container className="relative pt-[132px] pb-20 md:pt-[168px] md:pb-28 lg:pt-[170px] lg:pb-[96px] lg:min-h-[660px]">
        <div className="max-w-[640px] lg:max-w-[820px]">
          <Eyebrow className="leading-[1.9]">
            Киберспортивная платформа
            <br />
            для соревновательных команд
          </Eyebrow>
          <h1 className="mt-7 text-[40px] sm:text-[56px] lg:text-[70px] font-semibold leading-[1.06] tracking-[-0.012em] text-fg lg:whitespace-nowrap">
            Настоящие турниры
            <br />
            для <span className="text-accent">реальных команд</span>
          </h1>
          <p className="mt-8 max-w-[560px] lg:max-w-[680px] text-[16px] sm:text-[18px] lg:text-[20px] leading-[1.6] text-fg-2">
            F16 Arena — это турниры по CS2, честная соревновательная среда и удобные инструменты для команд. Играйте,
            развивайтесь и становитесь частью сообщества.
          </p>
          <div className="mt-11 lg:mt-14 flex flex-wrap gap-4 lg:gap-5">
            <Button href={featured ? `/tournaments/${featured.slug}` : "/tournaments"} size="lg" iconRight={<ArrowRight />}>
              Посмотреть турнир
            </Button>
            <TeamCta size="lg" />
          </div>
        </div>

        {/* подпись справа внизу, как в макете */}
        <div className="hidden lg:flex absolute right-16 bottom-[96px] flex-col items-end gap-3 text-[12px] uppercase tracking-[0.3em] text-fg-3">
          <span className="mb-2 h-px w-10 bg-fg-2/70" />
          <span>CS2</span>
          <span>Teams</span>
          <span>Tournaments</span>
          <span>Community</span>
        </div>
      </Container>
    </section>
  );
}

// ───────────────────────── ближайший турнир

export function TournamentCard({ t, approved, isFirst }: { t: Tournament; approved: number; isFirst: boolean }) {
  const mode = modeOf(t.format);
  const prize = t.prize_pool && !/^\s*0+\s*$/.test(t.prize_pool) ? formatMoney(t.prize_pool) : null;
  const second =
    t.status === "registration"
      ? { href: `/tournaments/${t.slug}/register`, label: mode.size === 1 ? "Зарегистрироваться" : "Зарегистрировать команду" }
      : t.status === "checkin"
        ? { href: `/tournaments/${t.slug}/checkin`, label: "Пройти check-in" }
        : t.status === "live"
          ? { href: `/tournaments/${t.slug}?tab=bracket`, label: "Смотреть сетку" }
          : null;

  return (
    <div className="group grid overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 lg:grid-cols-[44%_1fr]">
      <div className="relative min-h-[240px] overflow-hidden lg:min-h-[350px]">
        <Image
          src={t.cover_url ?? "/home/tournament.jpg"}
          alt=""
          fill
          sizes="(min-width: 1024px) 600px, 100vw"
          className="media-zoom object-cover"
          unoptimized={!!t.cover_url}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9 lg:p-11">
          <div className="text-[34px] sm:text-[44px] lg:text-[54px] font-semibold leading-none tracking-[-0.02em] text-fg">{t.name}</div>
          <Eyebrow className="mt-4 text-fg-3">{isFirst ? "Первый турнир платформы" : formatDate(t.starts_at)}</Eyebrow>
        </div>
      </div>

      <div className="flex flex-col justify-center gap-9 lg:gap-11 p-7 sm:p-10 lg:px-12 lg:border-l lg:border-white/[0.08] lg:my-9 lg:py-2">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center text-[15px] lg:text-[18px] text-fg">
            {[t.game, mode.size === 5 ? "5v5" : mode.size === 2 ? "2v2" : "1v1", bracketLabel[t.bracket_type] ?? t.bracket_type].map((x, i) => (
              <span key={i} className="flex items-center">
                {i > 0 && <span className="mx-5 h-4 w-px bg-white/20" />}
                {x}
              </span>
            ))}
          </div>
          <Status info={tournamentStatus[t.status]} />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <div className="flex items-start gap-4">
            <span className="mt-0.5 text-fg-2">{Icon.calendar("size-6 lg:size-8")}</span>
            <div>
              <div className="text-[15px] lg:text-[18px] text-fg">{t.starts_at ? formatDate(t.starts_at) : "Дата будет объявлена"}</div>
              <div className="mt-1 text-[13px] lg:text-[15px] text-fg-3">
                {mode.size === 1 ? "Участники" : "Команды"}: {approved} из {t.max_teams}
                {prize ? ` · ${prize}` : ""}
              </div>
            </div>
          </div>
          <div className="flex items-start gap-4 sm:border-l sm:border-white/[0.08] sm:pl-8">
            <span className="mt-0.5 text-fg-2">{Icon.globe("size-6 lg:size-8")}</span>
            <div>
              <div className="text-[15px] lg:text-[18px] text-fg">{t.is_lan ? "LAN" : "Онлайн"}</div>
              <div className="mt-1 text-[13px] lg:text-[15px] text-fg-3">{t.location ?? (t.is_lan ? "F16 Arena" : "—")}</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-4">
          <Button href={`/tournaments/${t.slug}`} size="lg" iconRight={<ArrowRight />}>
            Подробнее о турнире
          </Button>
          {second && <Button href={second.href} variant="secondary" size="lg">{second.label}</Button>}
        </div>
      </div>
    </div>
  );
}

/** Турниров ещё нет — честно, в той же композиции */
function NoTournamentCard() {
  return (
    <div className="grid overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 lg:grid-cols-[44%_1fr]">
      <div className="relative min-h-[240px] lg:min-h-[350px]">
        <Image src="/home/tournament.jpg" alt="" fill sizes="(min-width: 1024px) 600px, 100vw" className="object-cover" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#070b12] via-[#070b12]/55 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 p-7 sm:p-9 lg:p-11">
          <div className="text-[34px] sm:text-[44px] lg:text-[54px] font-semibold leading-none tracking-[-0.02em] text-fg">Скоро</div>
          <Eyebrow className="mt-4 text-fg-3">Первый турнир платформы</Eyebrow>
        </div>
      </div>
      <div className="flex flex-col justify-center gap-8 p-7 sm:p-10 lg:px-12 lg:border-l lg:border-white/[0.08] lg:my-9 lg:py-2">
        <p className="max-w-md lg:max-w-lg text-[16px] lg:text-[19px] leading-relaxed text-fg-2">
          Первый турнир будет объявлен здесь. Соберите команду заранее — когда откроется регистрация, останется подать заявку.
        </p>
        <div className="flex flex-wrap gap-4">
          <TeamCta size="lg" />
        </div>
      </div>
    </div>
  );
}

function NextTournaments({ list }: { list: Tournament[] }) {
  if (list.length > 0) {
    return (
      <div className="mt-5 overflow-hidden rounded-[12px] border border-dashed border-white/[0.12]">
        {list.map((t, i) => (
          <Link
            key={t.id}
            href={`/tournaments/${t.slug}`}
            className={cn("group flex items-center gap-6 px-8 py-6 transition-colors hover:bg-white/[0.02]", i > 0 && "border-t border-white/[0.06]")}
          >
            <span className="text-fg-2">{Icon.calendar("size-7")}</span>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-semibold text-fg truncate">{t.name}</div>
              <div className="mt-1 text-[13px] text-fg-3">
                {formatDate(t.starts_at)} · {tournamentStatus[t.status].label}
              </div>
            </div>
            <ArrowRight className="size-4 text-fg-3 transition-transform group-hover:translate-x-0.5 group-hover:text-fg" aria-hidden />
          </Link>
        ))}
      </div>
    );
  }
  return (
    <div className="mt-5 flex items-center gap-6 lg:gap-8 rounded-[12px] border border-dashed border-white/[0.12] bg-white/[0.012] px-8 py-7 lg:px-11 lg:py-8">
      <span className="text-fg-2">{Icon.calendar("size-8 lg:size-10")}</span>
      <div>
        <div className="text-[15px] lg:text-[18px] font-semibold text-fg">Следующие турниры</div>
        <div className="mt-1 lg:mt-2 text-[14px] lg:text-[16px] text-fg-3">Впереди ещё больше соревнований. Следите за обновлениями!</div>
      </div>
    </div>
  );
}

// ───────────────────────── как это работает / почему F16

const STEPS = [
  { n: "01", title: "Соберите команду", text: "Создайте команду, пригласите игроков и настройте профиль.", icon: Icon.users },
  { n: "02", title: "Участвуйте в турнирах", text: "Играйте в организованных турнирах с честными правилами и стабильной инфраструктурой.", icon: Icon.trophy },
  { n: "03", title: "Развивайтесь", text: "Получайте игровой опыт, двигайтесь выше и становитесь частью сообщества F16 Arena.", icon: Icon.bars },
];

const WHY = [
  { title: "Честная игра", text: "Проверка составов, вето на сайте и прозрачные правила.", icon: Icon.shield },
  { title: "Удобно для команд", text: "Инструменты для управления составом, расписание и статистика.", icon: Icon.users },
  { title: "Фокус на CS2", text: "Только CS2. Турниры, созданные для соревновательной сцены.", icon: Icon.bolt },
  { title: "Развивающееся сообщество", text: "Новые турниры, возможности и поддержка команд.", icon: Icon.star },
];

export function HomeView({ featured, approved, isFirst, upcoming }: HomeData) {
  return (
    <>
      <Hero featured={featured} />

      <section><Container className="relative">
        <Eyebrow className="mb-5">{featured && ["finished", "cancelled"].includes(featured.status) ? "Последний турнир" : "Ближайший турнир"}</Eyebrow>
        {featured ? <TournamentCard t={featured} approved={approved} isFirst={isFirst} /> : <NoTournamentCard />}
        <NextTournaments list={upcoming} />
      </Container></section>

      <section><Container className="pt-16 md:pt-20">
        <Eyebrow className="mb-5 lg:mb-6">Как это работает</Eyebrow>
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <li key={s.n} className="relative rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-8 pb-10 lg:p-10 lg:pb-14">
              <span className="absolute right-8 top-8 lg:right-10 lg:top-10 text-fg-2">{s.icon("size-7 lg:size-9")}</span>
              <span className="text-[13px] lg:text-[15px] text-fg-3">{s.n}</span>
              <div className="mt-3 text-[22px] lg:text-[26px] font-semibold tracking-[-0.01em] text-fg">{s.title}</div>
              <p className="mt-4 max-w-[300px] lg:max-w-[340px] text-[15px] lg:text-[18px] leading-[1.6] text-fg-2">{s.text}</p>
            </li>
          ))}
        </ol>
      </Container></section>

      <section><Container className="pb-20 pt-16 md:pb-28 md:pt-20">
        <Eyebrow className="mb-8 lg:mb-10">Почему F16 Arena</Eyebrow>
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-0">
          {WHY.map((w, i) => (
            <div key={w.title} className={cn("lg:px-10", i === 0 && "lg:pl-0", i > 0 && "lg:border-l lg:border-white/[0.08]")}>
              <span className="text-fg-2">{w.icon("size-7 lg:size-9")}</span>
              <div className="mt-5 lg:mt-6 text-[18px] lg:text-[21px] font-semibold text-fg">{w.title}</div>
              <p className="mt-3 text-[14px] lg:text-[16px] leading-[1.6] text-fg-3">{w.text}</p>
            </div>
          ))}
        </div>
      </Container></section>
    </>
  );
}
