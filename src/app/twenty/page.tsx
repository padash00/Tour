import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { cupTeams } from "@/lib/cup-core";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { listOpenLobbies, playerLobby } from "@/lib/lobby";
import { getMapImages } from "@/lib/settings";
import { SEASON_MIN_MAPS, SEASON_PRIZES, TWENTY_MIN_MAPS, currentSeason, getTwenty } from "@/lib/twenty";
import { Button, Container, ContextNav, EmptyState, PageTitle, Section } from "@/components/ds";
import { CreatePotButton } from "@/components/lobby/pot";
import { SelectNav } from "@/components/public/select-nav";
import { LiveGames } from "@/components/twenty/live-games";
import { Nominations, Podium, RecordsTab, SectionHead } from "@/components/twenty/panels";
import { AchievementsTab, HallOfFame, seasonDaysLeft, seasonLabel } from "@/components/twenty/season";
import { MapsTab, RatingTable, SORTS, StyleTab, whoOf, type SortKey } from "@/components/twenty/tabs";

export const dynamic = "force-dynamic";

const CODE = /^[A-Z0-9]{4,10}$/;
const STEAM = /^\d{17}$/;
const MAP = /^[a-z0-9_]{3,40}$/;
const SEASON = /^\d{4}-(0[1-9]|1[0-2])$/;
const TABS = ["rating", "maps", "style", "records", "awards"] as const;
type Tab = (typeof TABS)[number];

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Микс"),
    description: "Микс F16 Arena: игры CS2 на банк и большие лобби на 20, 30 и 40 игроков, общий рейтинг игроков, рейтинг по картам, роли и рекорды — кто король.",
    alternates: { canonical: "/twenty" },
  };
}

/**
 * «Микс»: игры на банк и рейтинг их игроков — общий или за один вечер (?lobby=КОД).
 * Вкладки (?tab=): рейтинг и номинации, карты, стиль игры и сравнение, рекорды и связки.
 */
export default async function TwentyPage(props: PageProps<"/twenty">) {
  const t = await getT();
  const sp = await props.searchParams;
  const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const rawCode = str(sp.lobby).toUpperCase();
  const code = CODE.test(rawCode) ? rawCode : undefined;
  const tab: Tab = (TABS as readonly string[]).includes(str(sp.tab)) ? (str(sp.tab) as Tab) : "rating";
  const map = MAP.test(str(sp.map)) ? str(sp.map) : null;
  const a = STEAM.test(str(sp.a)) ? str(sp.a) : null;
  const b = STEAM.test(str(sp.b)) ? str(sp.b) : null;
  const sort: SortKey = (SORTS as readonly string[]).includes(str(sp.sort)) ? (str(sp.sort) as SortKey) : "rating";
  // по умолчанию — сезон, который идёт сейчас; «all» — за всё время; вечер (код лобби) сезон не учитывает
  const nowSeason = currentSeason();
  const allTime = str(sp.season) === "all";
  const season = code || allTime ? undefined : SEASON.test(str(sp.season)) ? str(sp.season) : nowSeason;

  const player = await getCurrentPlayer();
  const [twenty, lobbies, mine, images] = await Promise.all([getTwenty({ code, season }), listOpenLobbies(), player ? playerLobby(player.id) : null, getMapImages()]);
  const { rows, evenings, matches } = twenty;
  const who = whoOf(twenty.players);
  // игры на банк («Десятка») и большие лобби; комнаты отдельных матчей сетки не показываем — в них ведёт само лобби
  const open = lobbies.filter((l) => (l.settings.pot || cupTeams(l.settings.players) > 0) && !l.settings.cup_of);
  const king = rows[0];

  /** ссылка внутри раздела: вкладка и выбранный вечер сохраняются */
  const href = (target: Tab, params: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (target !== "rating") q.set("tab", target);
    if (code) q.set("lobby", code);
    else if (allTime) q.set("season", "all");
    else if (season && season !== nowSeason) q.set("season", season);
    for (const [k, v] of Object.entries(params)) q.set(k, v);
    const s = q.toString();
    return s ? `/twenty?${s}` : "/twenty";
  };

  return (
    <Container className="space-y-10 pb-16 pt-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <PageTitle>{code ? t("Рейтинг лобби #{code}", { code }) : t("Микс")}</PageTitle>
          <p className="mt-1 max-w-read text-meta text-fg-3">
            {code
              ? t("Все игроки этого вечера по сыгранным картам. Рейтинг 1.00 — средний игрок.")
              : t("Игры на банк: «Десятка» и большие лобби на 20, 30 и 40 игроков. Капитаны разбирают игроков, команды играют между собой. Здесь такие игры создаются, и здесь общий рейтинг — кто король.")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {code && (
            <Button href="/twenty" variant="secondary">
              {t("Общий рейтинг")}
            </Button>
          )}
          {!code && (
            <SelectNav
              label={t("Сезон")}
              value={allTime ? "all" : season!}
              options={[
                // сезон, который идёт, есть в списке всегда — даже если в нём ещё не играли
                ...[...new Set([nowSeason, ...twenty.seasons.map((x) => x.key)])].map((key) => ({ value: key, label: key === nowSeason ? t("Сезон: {name}", { name: seasonLabel(key, t) }) : seasonLabel(key, t), href: key === nowSeason ? "/twenty" : `/twenty?season=${key}` })),
                { value: "all", label: t("За всё время"), href: "/twenty?season=all" },
              ]}
            />
          )}
          {!mine && !code && <CreatePotButton loggedIn={!!player} />}
          {/* кто уже сидит в лобби, новую игру собрать не может — показываем, куда вернуться, а не пустое место */}
          {mine && !code && (
            <div className="flex flex-col items-end gap-1">
              <Button href={`/lobby/${mine.code}`}>{t("Моё лобби #{code}", { code: mine.code })}</Button>
              <span className="text-micro text-fg-3">{t("Новую игру можно собрать после выхода из лобби")}</span>
            </div>
          )}
        </div>
      </header>

      {/* идущая игра — первым экраном на любой вкладке: её не должны пропустить */}
      {!code && <LiveGames games={open} images={images} t={t} mineCode={mine?.code ?? null} />}

      {(king || twenty.seasons.length > 0) && (
        <ContextNav
          match="tab"
          items={[
            { key: "rating", label: t("Рейтинг"), href: href("rating") },
            { key: "maps", label: t("Карты"), href: href("maps") },
            { key: "style", label: t("Стиль игры"), href: href("style") },
            { key: "records", label: t("Рекорды"), href: href("records") },
            { key: "awards", label: t("Достижения"), href: href("awards") },
          ]}
        />
      )}

      {king && tab === "rating" && (
        <>
          {/* тройка лидеров — один раз: место, приз, игрок и его цифры */}
          <Podium
            who={who}
            t={t}
            eyebrow={code ? t("Лучшие игроки вечера") : !season ? t("За всё время") : season === nowSeason ? t("Сезон идёт") : t("Сезон завершён")}
            title={code ? t("Лобби #{code}", { code }) : season ? seasonLabel(season, t) : t("Король микса")}
            meta={
              code
                ? t("Матчей в лобби: {n}", { n: matches })
                : season
                  ? `${season === nowSeason ? `${t.plural(seasonDaysLeft(season), "Остался {n} день", "Осталось {n} дня", "Осталось {n} дней").replace("{n}", String(seasonDaysLeft(season)))}. ` : ""}${t("Сезон — календарный месяц: первого числа таблица начинается заново. В зачёт идут сыгравшие за сезон от {n} карт.", { n: SEASON_MIN_MAPS })}`
                  : t("В таблице — сыгравшие от {n} карт. Матчей учтено: {m}", { n: TWENTY_MIN_MAPS, m: matches })
            }
            places={[0, 1, 2].map((i) => (season ? rows.filter((r) => r.qualified) : rows)[i] ?? null)}
            prizes={season ? SEASON_PRIZES : null}
            emptyText={season ? t("Место свободно — никто не набрал {n} карт", { n: SEASON_MIN_MAPS }) : t("Место свободно")}
            note={season ? (season === nowSeason ? t("Места меняются до конца сезона. Призы за 1–3 места вручает F16 Arena по итогам месяца.") : t("Итоги сезона окончательные. Призы за 1–3 места вручает F16 Arena.")) : undefined}
          />

          <Nominations items={twenty.nominations} who={who} t={t} evening={!!code} />

          <section aria-label={t("Все игроки")}>
            <SectionHead
              title={t("Все игроки")}
              meta={code ? t("Матчей в лобби: {n}", { n: matches }) : season ? t("Места и призы — среди сыгравших за сезон от {n} карт. Матчей в сезоне: {m}", { n: SEASON_MIN_MAPS, m: matches }) : t("В таблице — сыгравшие от {n} карт. Матчей учтено: {m}", { n: TWENTY_MIN_MAPS, m: matches })}
            />
            <RatingTable rows={rows} who={who} t={t} meSteamId={player?.steam_id ?? null} season={!!season} sort={sort} sortHref={(key) => href("rating", key === "rating" ? {} : { sort: key })} />
            <p className="mt-2 text-meta text-fg-3">{t("Под ником — роль игрока и его коронная карта. Стрелка у рейтинга — форма: последний игровой день против прежних.")} {t("Нажмите на заголовок столбца, чтобы отсортировать по нему.")}</p>
          </section>
        </>
      )}

      {king && tab === "maps" && <MapsTab boards={twenty.boards} rows={rows} who={who} t={t} images={images} selected={map} href={(params) => href("maps", params)} meSteamId={player?.steam_id ?? null} />}

      {king && tab === "style" && <StyleTab rows={rows} who={who} t={t} a={a ?? player?.steam_id ?? null} b={b} href={(params) => href("style", params)} />}

      {tab === "records" && twenty.records.length > 0 && (
        <>
          <RecordsTab records={twenty.records} duos={twenty.duos} who={who} t={t} />
          <HallOfFame seasons={twenty.seasons} who={who} t={t} admin={isAdmin(player)} />
          {(code || season) && <p className="text-meta text-fg-3">{t("Рекорды и связки считаются по всем играм, а не по одному сезону или вечеру.")}</p>}
        </>
      )}

      {tab === "awards" && twenty.records.length > 0 && <AchievementsTab board={twenty.achievementBoard()} who={who} t={t} players={Object.keys(twenty.players).length} />}

      {!king && (tab === "rating" || tab === "maps" || tab === "style" || twenty.records.length === 0) && (
        <>
          <EmptyState
            title={code ? t("В этом лобби ещё нет сыгранных матчей") : season ? t("В этом сезоне ещё не играли") : t("Рейтинга пока нет")}
            text={code ? t("Таблица появится после первой сыгранной карты.") : season ? t("Таблица сезона появится после первой сыгранной игры. Прошлые сезоны — в списке сверху.") : t("Он появится после первых сыгранных матчей.")}
          />
        </>
      )}

      {!code && tab === "rating" && evenings.length > 0 && (
        <Section title={t("Прошедшие игры")} description={t("Рейтинг каждого вечера отдельно")}>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
            {evenings.map((e) => (
              <Link key={e.code} href={`/twenty?lobby=${e.code}`} className="flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-surface px-4 py-3 text-[14px] transition-colors hover:border-line-strong">
                <span className="font-medium text-fg">
                  <span className="num text-fg-3">#{e.code}</span> · {formatDateTime(e.finished_at, t.lang)}
                </span>
                <span className="text-meta text-fg-3">{t("матчей: {n}", { n: e.matches })}</span>
              </Link>
            ))}
          </div>
        </Section>
      )}
    </Container>
  );
}
