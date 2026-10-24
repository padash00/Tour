import Image from "next/image";
import Link from "next/link";
import { ArrowRight, CalendarDays, MapPin, Trophy, Users } from "lucide-react";
import { bracketLabel, formatDate, formatDateTime, formatMoney } from "@/lib/format";
import { liveMapOf, mapLabel } from "@/lib/maps";
import type { MatchWithTeams } from "@/lib/matches";
import { modeOf } from "@/lib/modes";
import type { Tournament } from "@/lib/types";
import { Button, CARD_SECTION, Container, Status, cn, tournamentStatus } from "@/components/ds";
import { HomeMyMatch } from "./home-my-match";
import { TeamCta } from "./team-cta";

/*
 * Главная F16 Arena — светлый макет «с боковым меню» (экран «Главная»).
 * Порядок: ваш матч (вошедшему, на клиенте) · ближайший турнир · как участвовать · матчи сейчас · последние результаты.
 * Только отображение: данные приходят из app/page.tsx.
 */

type TMeta = Pick<Tournament, "id" | "name" | "slug" | "status">;
export type HomeMatch = MatchWithTeams & { tournament: TMeta; maps?: { map_number: number; map_name: string; team1_score: number; team2_score: number }[] };

export type HomeData = {
  featured: Tournament | null;
  approved: number;
  /** турниров до этого не было — «первый турнир платформы» */
  isFirst: boolean;
  upcoming: Tournament[];
  /** матчи, которые идут сейчас */
  live?: HomeMatch[];
  /** последние сыгранные матчи */
  results?: HomeMatch[];
  /** картинки карт: { de_mirage: url } */
  mapImages?: Record<string, string>;
  /** число раундов верхней сетки по турнирам — для подписи стадии */
  upperRounds?: Record<string, number>;
  /** больше не используется: кнопка команды уточняется на клиенте (TeamCta) */
  loggedIn?: boolean;
};

/** Стадия словами: «1/8 финала», «Полуфинал», «Финал» (по числу раундов сетки), иначе «раунд N» */
function stageName(m: MatchWithTeams, totalUpper?: number) {
  if (m.bracket === "grand_final") return "Гранд-финал";
  if (m.bracket === "third_place") return "Матч за 3-е место";
  if (m.bracket === "group") return `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`;
  if (m.bracket === "upper" && totalUpper) {
    const left = totalUpper - m.round; // 0 — финал, 1 — полуфинал, 2 — 1/4 …
    if (left === 0) return "Финал";
    if (left === 1) return "Полуфинал";
    return `1/${2 ** left} финала`;
  }
  return `раунд ${m.round}`;
}

function MapThumb({ src, className }: { src?: string; className?: string }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element -- картинки карт из хранилища сайта, размер мелкий
    <img src={src} alt="" className={cn("object-cover", className)} loading="lazy" />
  ) : (
    <span aria-hidden className={cn("bg-surface-4", className)} />
  );
}

// ───────────────────────── ближайший турнир

export function TournamentCard({ t, approved, isFirst }: { t: Tournament; approved: number; isFirst: boolean }) {
  const mode = modeOf(t.format);
  const prize = t.prize_pool && !/^\s*0+\s*$/.test(t.prize_pool) ? formatMoney(t.prize_pool) : null;
  const action =
    t.status === "registration"
      ? { href: `/tournaments/${t.slug}/register`, label: "Подать заявку" }
      : t.status === "checkin"
        ? { href: `/tournaments/${t.slug}/checkin`, label: "Пройти check-in" }
        : t.status === "live"
          ? { href: `/tournaments/${t.slug}?tab=bracket`, label: "Смотреть сетку" }
          : null;
  const who = mode.size === 1 ? "Участники" : "Команды";
  const facts = [
    { icon: <CalendarDays />, label: "Начало", value: t.starts_at ? formatDateTime(t.starts_at) : "дата будет объявлена" },
    { icon: <Users />, label: who, value: `${approved} из ${t.max_teams}` },
    { icon: <MapPin />, label: "Где", value: t.is_lan ? (t.location ?? "F16 Arena") : "онлайн" },
    { icon: <Trophy />, label: "Призы", value: prize ?? "будут объявлены" },
  ];

  return (
    <div className="grid overflow-hidden rounded-surface border border-line-subtle bg-surface lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
      <div className="relative aspect-[16/9] lg:aspect-auto lg:min-h-[320px]">
        <Image src={t.cover_url ?? "/home/tournament.jpg"} alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover" unoptimized={!!t.cover_url} />
      </div>
      <div className="flex flex-col justify-center gap-5 p-6 sm:p-8">
        <div className="flex flex-wrap items-center gap-2">
          <Status info={tournamentStatus[t.status]} />
          {isFirst && <span className="rounded-full bg-surface-4 px-3 py-1 text-[13px] font-semibold text-fg-2">Первый турнир платформы</span>}
        </div>
        <div>
          <h2 className="text-[30px] font-extrabold leading-tight tracking-[-0.02em] text-fg sm:text-[36px]">{t.name}</h2>
          <p className="mt-1.5 text-[16px] text-fg-2">
            {t.game} · {mode.size === 5 ? "5 на 5" : mode.size === 2 ? "2 на 2" : "1 на 1"} · {bracketLabel[t.bracket_type] ?? t.bracket_type}
          </p>
        </div>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
          {facts.map((f) => (
            <div key={f.label} className="flex items-start gap-3">
              <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-control bg-accent-dim text-accent [&>svg]:size-[18px]">{f.icon}</span>
              <div className="min-w-0">
                <dt className="text-[13.5px] text-fg-3">{f.label}</dt>
                <dd className="text-[16px] font-semibold text-fg">{f.value}</dd>
              </div>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap gap-3">
          {action && (
            <Button href={action.href} size="lg" iconRight={<ArrowRight />}>
              {action.label}
            </Button>
          )}
          <Button href={`/tournaments/${t.slug}`} size="lg" variant="secondary">
            Подробнее о турнире
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Турниров ещё нет — честно, в той же композиции */
function NoTournamentCard() {
  return (
    <div className="flex flex-col gap-4 rounded-surface border border-line-subtle bg-surface p-6 sm:p-8">
      <h2 className="text-[26px] font-extrabold text-fg">Скоро первый турнир</h2>
      <p className="max-w-[60ch] text-[16px] text-fg-2">
        Турнир будет объявлен здесь. Соберите команду заранее — когда откроется регистрация, останется подать заявку.
      </p>
      <div>
        <TeamCta size="lg" />
      </div>
    </div>
  );
}

function NextTournaments({ list }: { list: Tournament[] }) {
  if (!list.length) return null;
  return (
    <div className="overflow-hidden rounded-surface border border-line-subtle bg-surface">
      {list.map((t, i) => (
        <Link key={t.id} href={`/tournaments/${t.slug}`} className={cn("group flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-2", i > 0 && "border-t border-line-subtle")}>
          <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-4 text-fg-2">
            <CalendarDays className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[16px] font-bold text-fg">{t.name}</div>
            <div className="text-[14px] text-fg-3">
              {formatDate(t.starts_at)} · {tournamentStatus[t.status].label}
            </div>
          </div>
          <ArrowRight className="size-5 text-fg-3 transition-transform group-hover:translate-x-0.5" aria-hidden />
        </Link>
      ))}
    </div>
  );
}

// ───────────────────────── как участвовать

const HOW = [
  { title: "Войдите через Steam", text: "Кнопка в меню. Пароль на сайте не нужен." },
  { title: "Соберите команду", text: "Капитан создаёт команду и приглашает игроков по ссылке." },
  { title: "Подайте заявку", text: "На странице турнира. Статус заявки будет виден там же." },
];

// ───────────────────────── матчи

function LiveCard({ m, img, totalUpper }: { m: HomeMatch; img?: string; totalUpper?: number }) {
  const map = liveMapOf(m);
  const s1 = map ? map.team1_score : m.team1_score;
  const s2 = map ? map.team2_score : m.team2_score;
  return (
    <Link href={`/matches/${m.id}`} className="group overflow-hidden rounded-surface border border-line-subtle bg-surface transition-colors hover:border-line-strong">
      <MapThumb src={img} className="block h-28 w-full" />
      <div className="flex flex-col gap-2 p-4">
        <span className="inline-flex w-fit items-center gap-2 rounded-full bg-danger-dim px-2.5 py-0.5 text-[13px] font-bold text-live">
          <span className="size-2 animate-pulse rounded-full bg-live" aria-hidden />
          Идёт{map ? ` · ${mapLabel(map.map_name)}` : ""}
        </span>
        {[
          { name: m.team1?.name ?? "—", s: s1, lead: s1 > s2 },
          { name: m.team2?.name ?? "—", s: s2, lead: s2 > s1 },
        ].map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="truncate text-[16px] font-semibold text-fg">{r.name}</span>
            <span className={cn("num text-[20px] font-extrabold", r.lead ? "text-accent" : "text-fg")}>{r.s}</span>
          </div>
        ))}
        <span className="truncate text-[13px] text-fg-3">
          {m.tournament.name} · {stageName(m, totalUpper)}
        </span>
      </div>
    </Link>
  );
}

function ResultRow({ m, img }: { m: HomeMatch; img?: string }) {
  const w1 = m.winner_id != null && m.winner_id === m.team1_id;
  const w2 = m.winner_id != null && m.winner_id === m.team2_id;
  const single = m.best_of === 1 && m.maps?.[0];
  // BO1 — счёт карты по раундам, серия — по картам
  const a = single ? single.team1_score : m.team1_score;
  const b = single ? single.team2_score : m.team2_score;
  return (
    <Link href={`/matches/${m.id}`} className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 px-4 py-3 transition-colors hover:bg-surface-2 sm:grid-cols-[64px_minmax(0,1fr)_auto_minmax(0,1fr)_minmax(0,140px)] sm:gap-4">
      <MapThumb src={img} className="hidden h-11 w-16 rounded-chip sm:block" />
      <span className={cn("truncate text-[16px]", w1 ? "font-bold text-accent" : "text-fg-3")}>{m.team1?.name ?? "—"}</span>
      <span className="num min-w-16 text-center text-[20px] font-extrabold text-fg">
        {a} : {b}
      </span>
      <span className={cn("truncate text-right text-[16px]", w2 ? "font-bold text-accent" : "text-fg-3")}>{m.team2?.name ?? "—"}</span>
      <span className="hidden truncate text-right text-[13px] text-fg-3 sm:block">{single ? mapLabel(single.map_name) : `до ${Math.floor(m.best_of / 2) + 1} побед`}</span>
    </Link>
  );
}

function SectionHead({ title, hint, href, link }: { title: string; hint?: string; href?: string; link?: string }) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-1">
      <div>
        <h2 className="text-[22px] font-extrabold tracking-[-0.015em] text-fg">{title}</h2>
        {hint && <p className="mt-0.5 text-[15px] text-fg-3">{hint}</p>}
      </div>
      {href && (
        <Link href={href} className="text-[15px] font-semibold text-accent hover:text-accent-strong">
          {link}
        </Link>
      )}
    </div>
  );
}

export function HomeView({ featured, approved, isFirst, upcoming, live = [], results = [], mapImages = {}, upperRounds = {} }: HomeData) {
  const firstMap = (m: HomeMatch) => {
    const map = liveMapOf(m)?.map_name ?? m.maps?.[0]?.map_name;
    return map ? mapImages[map] : undefined;
  };
  return (
    <Container className="flex flex-col gap-5 pb-12 pt-6 sm:pt-8">
      {/* главный блок страницы: заголовок в своей карточке, а не надписью на фоне */}
      <header className="relative overflow-hidden rounded-feature border border-line-subtle bg-surface p-6 sm:p-8">
        <span className="absolute inset-x-0 top-0 h-1.5 bg-accent" aria-hidden />
        {/* eslint-disable-next-line @next/next/no-img-element -- знак бренда, SVG как есть */}
        <img src="/brand/f16-symbol-light.svg" alt="" aria-hidden className="pointer-events-none absolute right-6 top-1/2 hidden h-auto w-[34%] -translate-y-1/2 opacity-[0.12] lg:block" />
        <div className="relative max-w-[640px]">
          <span className="text-[14px] font-bold text-accent">F16 Arena · Усть-Каменогорск</span>
          <h1 className="mt-1 text-[32px] font-extrabold leading-[1.1] tracking-[-0.02em] text-fg sm:text-[40px]">Турниры по CS2 в F16 Arena</h1>
          <p className="mt-2 text-[16.5px] text-fg-2">Регистрация команд, выбор карт, игра на серверах клуба и статистика — всё на одном сайте.</p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button href="/tournaments" iconRight={<ArrowRight />}>
              Все турниры
            </Button>
            <Button href="/stats" variant="secondary">
              Рейтинг игроков
            </Button>
          </div>
        </div>
      </header>

      <HomeMyMatch />

      <section className={cn(CARD_SECTION, "flex flex-col gap-3 [&>div:first-child]:mb-1")}>
        <SectionHead title={featured && ["finished", "cancelled"].includes(featured.status) ? "Последний турнир" : "Ближайший турнир"} href="/tournaments" link="Все турниры" />
        {featured ? <TournamentCard t={featured} approved={approved} isFirst={isFirst} /> : <NoTournamentCard />}
        <NextTournaments list={upcoming} />
      </section>

      <section className={CARD_SECTION}>
        <SectionHead title="Как участвовать" />
        <ol className="grid gap-3 md:grid-cols-3">
          {HOW.map((s, i) => (
            <li key={s.title} className="flex flex-col gap-2 rounded-surface border border-line-subtle bg-surface p-5">
              <span className="grid size-9 place-items-center rounded-full bg-accent text-[15px] font-extrabold text-accent-ink">{i + 1}</span>
              <span className="text-[17px] font-bold text-fg">{s.title}</span>
              <span className="text-[15px] text-fg-2">{s.text}</span>
            </li>
          ))}
        </ol>
        <div className="mt-3">
          <TeamCta />
        </div>
      </section>

      {live.length > 0 && (
        <section className={CARD_SECTION}>
          <SectionHead title="Матчи, которые идут сейчас" hint="Счёт текущей карты. Зелёным — кто ведёт." href="/matches" link="Все матчи" />
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {live.map((m) => (
              <LiveCard key={m.id} m={m} totalUpper={upperRounds[m.tournament_id]} img={firstMap(m)} />
            ))}
          </div>
        </section>
      )}

      {results.length > 0 && (
        <section className={cn(CARD_SECTION, "pb-0 sm:pb-0")}>
          <SectionHead title="Последние результаты" hint="Победитель выделен зелёным." href="/matches" link="Все матчи" />
          {/* список во всю ширину карточки-раздела, без своей рамки */}
          <div className="-mx-5 divide-y divide-line-subtle border-t border-line-subtle sm:-mx-6">
            {results.map((m) => (
              <ResultRow key={m.id} m={m} img={firstMap(m)} />
            ))}
          </div>
        </section>
      )}
    </Container>
  );
}
