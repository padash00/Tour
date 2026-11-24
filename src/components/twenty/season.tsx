import Link from "next/link";
import { Avatar, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { RankBadge } from "@/components/public/data-table";
import { intlLocale, tr, type T } from "@/lib/i18n/core";
import { SEASON_MIN_MAPS, SEASON_PRIZES, type Achievement, type AchievementBoard, type HistoryPoint, type Season, type Tier, type TwentyRow } from "@/lib/twenty-core";
import { money } from "./money";
import type { Who } from "./tabs";

/* Сезоны «Микса» (календарный месяц, призы за 1–3 места), достижения и график рейтинга по игровым дням. */

/** «2026-11» → «Ноябрь 2026» на языке зрителя */
export function seasonLabel(key: string, t: T) {
  const s = new Intl.DateTimeFormat(intlLocale(t.lang), { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${key}-01T00:00:00Z`)).replace(/\s*(г\.|ж\.)$/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Сколько дней до конца сезона: он кончается в 6 утра первого числа по местному времени (UTC+5) */
export function seasonDaysLeft(key: string, now = Date.now()) {
  const [y, m] = key.split("-").map(Number);
  const end = Date.UTC(y, m, 1, 1);
  return Math.max(0, Math.ceil((end - now) / 86_400_000));
}


const PLACE = ["text-gold", "text-silver", "text-bronze"];
const PLACE_BG = ["border-gold/40 bg-gold/[0.10]", "border-silver/40 bg-silver/[0.08]", "border-bronze/40 bg-bronze/[0.08]"];

/** Плашка сезона над рейтингом: сколько осталось, призы и кто сейчас на призовых местах */
export function SeasonBanner({ season, rows, who, t, live }: { season: string; rows: TwentyRow[]; who: Who; t: T; live: boolean }) {
  const left = seasonDaysLeft(season);
  const podium = rows.filter((r) => r.prize != null);
  return (
    <section aria-label={t("Сезон")} className="rounded-surface border border-line-subtle bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{live ? t("Сезон идёт") : t("Сезон завершён")}</div>
          <h2 className="mt-1 text-heading text-fg">{seasonLabel(season, t)}</h2>
        </div>
        <p className="max-w-read text-meta text-fg-3">
          {live ? `${t.plural(left, "Остался {n} день", "Осталось {n} дня", "Осталось {n} дней").replace("{n}", String(left))}. ` : ""}
          {t("Сезон — календарный месяц: первого числа таблица начинается заново. В зачёт идут сыгравшие за сезон от {n} карт.", { n: SEASON_MIN_MAPS })}
        </p>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {SEASON_PRIZES.map((prize, i) => {
          const r = podium[i];
          const p = r ? who(r.steam_id, r.name) : null;
          return (
            <div key={i} className={cn("flex items-center gap-3 rounded-control border px-4 py-3", PLACE_BG[i])}>
              <RankBadge n={i + 1} />
              <div className="min-w-0 flex-1">
                <div className={cn("num text-[22px] font-extrabold leading-none", PLACE[i])}>{money(prize, t)}</div>
                {r && p ? (
                  <Link href={`/players/${r.steam_id}`} className="mt-1.5 flex min-w-0 items-center gap-2 text-[14px] font-semibold text-fg hover:text-accent">
                    <Avatar src={p.avatar_url} name={p.nickname} size="xs" />
                    <span className="truncate">{p.nickname}</span>
                    <span className="num shrink-0 text-fg-3">{r.rating.toFixed(2)}</span>
                  </Link>
                ) : (
                  <div className="mt-1.5 text-meta text-fg-3">{live ? t("Место свободно — никто не набрал {n} карт", { n: SEASON_MIN_MAPS }) : t("Приз не разыгран")}</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-meta text-fg-3">{live ? t("Места меняются до конца сезона. Призы за 1–3 места вручает F16 Arena по итогам месяца.") : t("Итоги сезона окончательные. Призы за 1–3 места вручает F16 Arena.")}</p>
    </section>
  );
}

/** Зал славы: тройки завершённых сезонов */
export function HallOfFame({ seasons, who, t }: { seasons: Season[]; who: Who; t: T }) {
  const done = seasons.filter((s) => s.finished);
  return (
    <section aria-label={t("Зал славы сезонов")}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <h2 className="text-title text-fg">{t("Зал славы сезонов")}</h2>
        <p className="text-meta text-fg-3">{t("Призёры каждого завершённого месяца")}</p>
      </div>
      {done.length === 0 ? (
        <p className="rounded-surface border border-line-subtle bg-surface p-5 text-meta text-fg-3">{t("Первый сезон ещё идёт — призёры появятся здесь, когда месяц закончится.")}</p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {done.map((s) => (
            <div key={s.key} className="rounded-surface border border-line-subtle bg-surface p-4">
              <div className="flex items-baseline justify-between gap-3">
                <Link href={`/twenty?season=${s.key}`} className="text-[16px] font-bold text-fg hover:text-accent">
                  {seasonLabel(s.key, t)}
                </Link>
                <span className="text-meta text-fg-3">{t("матчей: {n}", { n: s.matches })}</span>
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {s.podium.length === 0 && <p className="text-meta text-fg-3">{t("Никто не набрал карты для зачёта.")}</p>}
                {s.podium.map((x, i) => {
                  const p = who(x.steam_id, x.name);
                  return (
                    <Link key={x.steam_id} href={`/players/${x.steam_id}`} className="flex items-center gap-3 rounded-control px-1 py-1 transition-colors hover:bg-surface-2">
                      <RankBadge n={i + 1} />
                      <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                      <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">{p.nickname}</span>
                      <span className="num text-meta text-fg-3">{x.rating.toFixed(2)}</span>
                      <span className={cn("num w-24 shrink-0 text-right text-[15px] font-extrabold", PLACE[i])}>{money(x.prize, t)}</span>
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

// ───────────────────────── достижения

const TIER: Record<Tier, { ring: string; text: string; bg: string; label: string }> = {
  gold: { ring: "border-gold/50", text: "text-gold", bg: "bg-gold/[0.12]", label: tr("Золото") },
  silver: { ring: "border-silver/50", text: "text-silver", bg: "bg-silver/[0.12]", label: tr("Серебро") },
  bronze: { ring: "border-bronze/50", text: "text-bronze", bg: "bg-bronze/[0.12]", label: tr("Бронза") },
};

function Medal({ tier, off }: { tier: Tier; off?: boolean }) {
  return (
    <span className={cn("grid size-9 shrink-0 place-items-center rounded-full border", off ? "border-line-subtle bg-ink/[0.04] text-fg-4" : cn(TIER[tier].ring, TIER[tier].bg, TIER[tier].text))} aria-hidden>
      {Icon.crown("size-[18px]")}
    </span>
  );
}

/** Достижения игрока: полученные — значками, остальные — списком с прогрессом (свёрнут) */
export function PlayerAchievements({ items, t }: { items: Achievement[]; t: T }) {
  const got = items.filter((a) => a.earned);
  // ближайшие сверху: по ним видно, что осталось чуть-чуть
  const rest = items.filter((a) => !a.earned).sort((x, y) => y.progress - x.progress);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Достижения")}</h3>
        <span className="num text-meta text-fg-3">{t("{n} из {m}", { n: got.length, m: items.length })}</span>
      </div>
      {got.length === 0 ? (
        <p className="mt-3 text-meta text-fg-3">{t("Пока ни одного — первое не за горами.")}</p>
      ) : (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {got.map((a) => (
            <div key={a.key} title={t(a.hint)} className={cn("flex min-w-0 items-center gap-2.5 rounded-control border px-2.5 py-2", TIER[a.tier].ring, "bg-surface")}>
              <Medal tier={a.tier} />
              <span className="min-w-0">
                <span className="block truncate text-[14px] font-semibold text-fg">{t(a.label)}</span>
                <span className="block truncate text-micro text-fg-3">{t(a.hint)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
      {rest.length > 0 && (
        <details className="group mt-3">
          <summary className="cursor-pointer select-none text-meta font-semibold text-accent hover:underline">{t("Ещё не получено: {n} — показать, сколько осталось", { n: rest.length })}</summary>
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {rest.map((a) => (
              <div key={a.key} className="min-w-0 rounded-control border border-line-subtle bg-shell/50 px-2.5 py-2">
                <div className="flex items-center gap-2.5">
                  <Medal tier={a.tier} off />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-fg-2">{t(a.label)}</span>
                    <span className="block truncate text-micro text-fg-3" title={t(a.hint)}>{t(a.hint)}</span>
                  </span>
                  <span className="num shrink-0 text-micro text-fg-3">
                    {a.have}/{a.need}
                  </span>
                </div>
                <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
                  <div className="h-full rounded-full bg-accent/70" style={{ width: `${Math.round(100 * a.progress)}%` }} />
                </div>
              </div>
            ))}
          </div>
        </details>
      )}
    </div>
  );
}

/** Вкладка «Достижения»: кто собрал больше всех и у кого какое есть */
export function AchievementsTab({ board, who, t, players }: { board: AchievementBoard[]; who: Who; t: T; players: number }) {
  const tally = new Map<string, number>();
  for (const a of board) for (const id of a.holders) tally.set(id, (tally.get(id) ?? 0) + 1);
  const top = [...tally.entries()].sort((x, y) => y[1] - x[1]).slice(0, 10);
  return (
    <div className="space-y-8">
      {top.length > 0 && (
        <section aria-label={t("Больше всего достижений")}>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
            <h2 className="text-title text-fg">{t("Больше всего достижений")}</h2>
            <p className="text-meta text-fg-3">{t("Всего достижений: {n}", { n: board.length })}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            {top.map(([id, n], i) => {
              const p = who(id);
              return (
                <Link key={id} href={`/players/${id}`} className="flex items-center gap-3 rounded-surface border border-line-subtle bg-surface px-3 py-2.5 transition-colors hover:border-line-strong">
                  <RankBadge n={i + 1} />
                  <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                  <span className="min-w-0 flex-1 truncate text-[14px] font-semibold text-fg">{p.nickname}</span>
                  <span className="num text-[18px] font-extrabold text-fg">{n}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section aria-label={t("Все достижения")}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <h2 className="text-title text-fg">{t("Все достижения")}</h2>
          <p className="text-meta text-fg-3">{t("Выдаются сами по сыгранным играм. Свои — в профиле игрока.")}</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {board.map((a) => (
            <div key={a.key} className={cn("rounded-surface border bg-surface p-4", a.holders.length ? TIER[a.tier].ring : "border-line-subtle")}>
              <div className="flex items-start gap-3">
                <Medal tier={a.tier} off={!a.holders.length} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-[15px] font-bold text-fg">{t(a.label)}</span>
                    <span className={cn("shrink-0 text-micro font-semibold uppercase tracking-[0.1em]", TIER[a.tier].text)}>{t(TIER[a.tier].label)}</span>
                  </div>
                  <div className="mt-0.5 text-meta text-fg-3">{t(a.hint)}</div>
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                {a.holders.length === 0 ? (
                  <span className="text-meta text-fg-3">{t("Ещё никто не получил — будьте первым")}</span>
                ) : (
                  <>
                    <span className="flex -space-x-1.5">
                      {a.holders.slice(0, 6).map((id) => {
                        const p = who(id);
                        return (
                          <Link key={id} href={`/players/${id}`} title={p.nickname}>
                            <Avatar src={p.avatar_url} name={p.nickname} size="xs" className="ring-2 ring-surface" />
                          </Link>
                        );
                      })}
                    </span>
                    <span className="text-meta text-fg-3">{t("есть у {n} из {m}", { n: a.holders.length, m: players })}</span>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ───────────────────────── график рейтинга

/**
 * Рейтинг игрока по игровым дням: одна линия, пунктир — средний игрок (1.00).
 * Подписаны первая и последняя точки и лучший день; у каждой точки — подсказка с датой и числом карт.
 */
export function RatingChart({ points, t }: { points: HistoryPoint[]; t: T }) {
  if (points.length < 2) return <p className="text-meta text-fg-3">{t("График появится после второго игрового дня.")}</p>;
  const W = 560;
  const H = 190;
  const pad = { l: 34, r: 40, t: 22, b: 26 };
  const values = points.map((p) => p.rating);
  const lo = Math.min(0.8, Math.floor((Math.min(...values) - 0.05) * 10) / 10);
  const hi = Math.max(1.4, Math.ceil((Math.max(...values) + 0.05) * 10) / 10);
  const x = (i: number) => pad.l + (i * (W - pad.l - pad.r)) / (points.length - 1);
  const y = (v: number) => pad.t + ((hi - v) * (H - pad.t - pad.b)) / (hi - lo);
  const day = (iso: string) => new Intl.DateTimeFormat(intlLocale(t.lang), { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
  const bestAt = values.indexOf(Math.max(...values));
  const labelled = new Set([0, points.length - 1, bestAt]);
  const ticks = [lo, 1, hi].filter((v, i, a) => a.indexOf(v) === i);
  const summary = points.map((p) => `${day(p.day)} — ${p.rating.toFixed(2)}`).join(", ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={t("Рейтинг по игровым дням: {list}", { list: summary })} className="block h-auto w-full">
      {ticks.map((v) => (
        <g key={v}>
          <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--color-line-subtle)" strokeWidth={1} strokeDasharray={v === 1 ? "4 4" : undefined} />
          <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="num fill-fg-3 text-[11px]">
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      <polyline points={points.map((p, i) => `${x(i).toFixed(1)},${y(p.rating).toFixed(1)}`).join(" ")} fill="none" stroke="var(--color-accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
      {points.map((p, i) => (
        <g key={p.day}>
          <circle cx={x(i)} cy={y(p.rating)} r={4.5} fill="var(--color-accent)" stroke="var(--color-surface)" strokeWidth={2} />
          {labelled.has(i) && (
            <text x={x(i)} y={y(p.rating) - 10} textAnchor={i === 0 ? "start" : i === points.length - 1 ? "end" : "middle"} className="num fill-fg text-[12px] font-bold">
              {p.rating.toFixed(2)}
            </text>
          )}
          {(i === 0 || i === points.length - 1) && (
            <text x={x(i)} y={H - 6} textAnchor={i === 0 ? "start" : "end"} className="fill-fg-3 text-[11px]">
              {day(p.day)}
            </text>
          )}
          {/* цель наведения крупнее самой точки */}
          <circle cx={x(i)} cy={y(p.rating)} r={14} fill="transparent">
            <title>{t("{day}: рейтинг {rating}, карт {n}", { day: day(p.day), rating: p.rating.toFixed(2), n: p.maps })}</title>
          </circle>
        </g>
      ))}
    </svg>
  );
}
