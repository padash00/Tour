import Link from "next/link";
import { Avatar, Button, Container, Section, cn } from "@/components/ds";
import { FormStrip } from "@/components/public/form-strip";
import { getT } from "@/lib/i18n/server";
import { mapLabel } from "@/lib/maps";
import { getTwentyProfile, MAP_MIN, seasonMinMaps } from "@/lib/twenty";
import type { Versus } from "@/lib/twenty-core";
import { Radar, RoleChip, Streak, Trend, ratingTone } from "./bits";
import { money } from "./money";
import { PlayerAchievements, RatingChart, seasonLabel } from "./season";
import { whoOf } from "./tabs";

/** Игрок в «Миксе»: место и рейтинг, роль и паутинка, карты, напарник и неудобный соперник. Нет игр — блока нет */
export async function PlayerTwenty({ steamId }: { steamId: string }) {
  const profile = await getTwentyProfile(steamId).catch((e) => {
    console.error("twenty profile", e);
    return null;
  });
  if (!profile) return null;
  const t = await getT();
  const { row, relations: rel, season } = profile;
  const who = whoOf(profile.players);
  const top = Math.max(1.3, ...row.byMap.map((c) => c.rating));

  const person = (label: string, hint: string, v: Versus | null, lost: boolean) => {
    if (!v) return null;
    const p = who(v.steam_id);
    return (
      <Link href={`/players/${v.steam_id}`} className="flex items-center gap-3 rounded-control border border-line-subtle bg-shell/60 px-3 py-2.5 transition-colors hover:border-line-strong" title={hint}>
        <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="block text-micro font-semibold uppercase tracking-[0.1em] text-fg-3">{label}</span>
          <span className="block truncate text-[14px] font-semibold text-fg">{p.nickname}</span>
        </span>
        <span className="num shrink-0 text-meta text-fg-2">{lost ? t("поражений {n} из {m}", { n: v.games - v.wins, m: v.games }) : t("побед {n} из {m}", { n: v.wins, m: v.games })}</span>
      </Link>
    );
  };

  return (
    <Container width="wide" className="pb-10">
      <Section
        title={t("Микс · {place} место из {total}", { place: profile.place, total: profile.total })}
        description={t("Игры на банк и большие лобби. В статистику турниров не входят.")}
        action={
          <Button href={`/twenty?tab=style&a=${steamId}`} variant="secondary" size="sm">
            {t("Сравнить в Миксе")}
          </Button>
        }
      >
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,300px)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <span className={cn("num rounded-control px-3 py-1.5 text-[30px] font-extrabold leading-none", ratingTone(row.rating))}>{row.rating.toFixed(2)}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <RoleChip role={row.role} t={t} />
                  <Streak n={row.streak} t={t} />
                  <Trend value={row.trend} t={t} />
                </div>
                <div className="num mt-1 text-meta text-fg-3">{t("Карт: {maps} · побед {wins} из {matches}", { maps: row.maps, wins: row.wins, matches: row.matches })}</div>
              </div>
            </div>
            {row.radar ? (
              <div className="mt-4">
                <Radar t={t} size={260} series={[{ name: who(steamId, row.name).nickname, values: row.radar }]} />
              </div>
            ) : (
              <p className="mt-4 text-meta text-fg-3">{t("Роль и паутинка стиля появятся после трёх сыгранных карт.")}</p>
            )}
          </div>

          <div className="min-w-0">
            <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("По картам")}</h3>
            <div className="mt-3 divide-y divide-line-subtle">
              {row.byMap.map((c) => (
                <div key={c.map} className={cn("py-2.5", c.maps < MAP_MIN && "opacity-60")}>
                  <div className="flex items-center gap-3">
                    <span className="flex-1 truncate font-semibold text-fg">
                      {mapLabel(c.map)}
                      {row.best?.map === c.map && <span className="ml-2 rounded-chip bg-gold/[0.14] px-1.5 py-0.5 text-micro font-semibold text-gold">{t("коронная")}</span>}
                    </span>
                    <span className="num text-meta text-fg-3">{t("{wins}/{played} побед", { wins: c.wins, played: c.maps })}</span>
                    <span className="num w-12 text-right font-semibold text-fg">{c.rating.toFixed(2)}</span>
                  </div>
                  <div className="mt-1.5 h-[3px] overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className={cn("h-full rounded-full", c.rating >= 1 ? "bg-accent/70" : "bg-fg-4")} style={{ width: `${Math.max(4, Math.min(100, (100 * c.rating) / top))}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-micro text-fg-3">{t("Бледные строки — одна игра на карте.")}</p>
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Последние матчи")}</h3>
              <FormStrip results={row.form} size="sm" className="mt-3" />
            </div>
            {(rel.partner || rel.nemesis || rel.victim) && (
              <div>
                <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Свои и чужие")}</h3>
                <div className="mt-3 flex flex-col gap-2">
                  {person(t("Лучший напарник"), t("С кем в одной команде выигрывает чаще всего"), rel.partner, false)}
                  {person(t("Неудобный соперник"), t("Кому проигрывает чаще всего"), rel.nemesis, true)}
                  {person(t("Любимый соперник"), t("Кого обыгрывает чаще всего"), rel.victim, false)}
                </div>
              </div>
            )}
            {season && (
              <Link href="/twenty" className="block rounded-control border border-line-subtle bg-shell/60 px-3 py-2.5 transition-colors hover:border-line-strong">
                <span className="block text-micro font-semibold uppercase tracking-[0.1em] text-fg-3">{t("Сезон · {name}", { name: seasonLabel(season.key, t) })}</span>
                <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[14px] font-semibold text-fg">
                  {season.qualified ? t("{n} место", { n: season.place }) : t("вне зачёта — до него карт: {n}", { n: Math.max(1, seasonMinMaps(season.key) - season.maps) })}
                  <span className="num text-fg-3">{season.rating.toFixed(2)}</span>
                  {season.prize != null && <span className="num rounded-chip bg-gold/20 px-1.5 py-0.5 text-micro font-bold text-gold">{money(season.prize, t)}</span>}
                </span>
              </Link>
            )}
            {row.sides && (
              <div>
                <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Стороны")}</h3>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  {([["ct", t("Защита"), "text-side-ct"], ["t", t("Атака"), "text-side-t"]] as const).map(([key, label, tone]) => {
                    const s = row.sides![key];
                    return (
                      <div key={key} className="rounded-control border border-line-subtle px-3 py-2.5">
                        <div className={cn("text-micro font-bold uppercase tracking-[0.1em]", tone)}>{label}</div>
                        <div className="num mt-1 text-[18px] font-extrabold leading-none text-fg">K/D {s.kd.toFixed(2)}</div>
                        <div className="num mt-1.5 text-micro text-fg-3">{t("раундов выиграно: {n}%", { n: s.rounds ? Math.round((100 * s.wins) / s.rounds) : 0 })}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            <dl className="grid grid-cols-3 gap-3 text-center">
              {[
                [t("Клатчи"), row.clutches],
                ["3K+", row.multi],
                ["Ace", row.aces],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-control border border-line-subtle px-2 py-2.5">
                  <dd className="num text-[20px] font-extrabold leading-none text-fg">{value}</dd>
                  <dt className="mt-1.5 text-micro uppercase tracking-[0.1em] text-fg-3">{label}</dt>
                </div>
              ))}
            </dl>
          </div>
        </div>

        <div className="mt-8 grid grid-cols-1 gap-8 border-t border-line-subtle pt-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="min-w-0">
            <h3 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Рейтинг по игровым дням")}</h3>
            <div className="mt-3">
              <RatingChart points={profile.history} t={t} />
            </div>
            <p className="mt-1 text-micro text-fg-3">{t("Пунктир — средний игрок, 1.00.")}</p>
          </div>
          <PlayerAchievements items={profile.achievements} t={t} />
        </div>
      </Section>
    </Container>
  );
}
