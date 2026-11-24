import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { cupTeams } from "@/lib/cup-core";
import { playersNeeded } from "@/lib/lobby-settings";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { listOpenLobbies, playerLobby } from "@/lib/lobby";
import { getMapImages } from "@/lib/settings";
import { TWENTY_MIN_MAPS, getTwenty } from "@/lib/twenty";
import { Avatar, Button, Container, ContextNav, EmptyState, PageTitle, Section, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { CreatePotButton } from "@/components/lobby/pot";
import { RankBadge } from "@/components/public/data-table";
import { BestMapChip, RoleChip, Streak, Trend } from "@/components/twenty/bits";
import { MapsTab, Nominations, RatingTable, RecordsTab, StyleTab, whoOf } from "@/components/twenty/tabs";

export const dynamic = "force-dynamic";

const CODE = /^[A-Z0-9]{4,10}$/;
const STEAM = /^\d{17}$/;
const MAP = /^[a-z0-9_]{3,40}$/;
const TABS = ["rating", "maps", "style", "records"] as const;
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

  const player = await getCurrentPlayer();
  const [twenty, lobbies, mine, images] = await Promise.all([getTwenty({ code }), listOpenLobbies(), player ? playerLobby(player.id) : null, tab === "maps" ? getMapImages() : {}]);
  const { rows, evenings, matches } = twenty;
  const who = whoOf(twenty.players);
  // игры на банк («Десятка») и большие лобби; комнаты отдельных матчей сетки не показываем — в них ведёт само лобби
  const open = lobbies.filter((l) => (l.settings.pot || cupTeams(l.settings.players) > 0) && !l.settings.cup_of);
  const king = rows[0];
  const kingWho = king ? who(king.steam_id, king.name) : null;

  /** ссылка внутри раздела: вкладка и выбранный вечер сохраняются */
  const href = (target: Tab, params: Record<string, string> = {}) => {
    const q = new URLSearchParams();
    if (target !== "rating") q.set("tab", target);
    if (code) q.set("lobby", code);
    for (const [k, v] of Object.entries(params)) q.set(k, v);
    const s = q.toString();
    return s ? `/twenty?${s}` : "/twenty";
  };

  return (
    <Container className="space-y-8 pb-16 pt-8 sm:pt-10">
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

      {king && (
        <ContextNav
          match="tab"
          items={[
            { key: "rating", label: t("Рейтинг"), href: href("rating") },
            { key: "maps", label: t("Карты"), href: href("maps") },
            { key: "style", label: t("Стиль игры"), href: href("style") },
            { key: "records", label: t("Рекорды"), href: href("records") },
          ]}
        />
      )}

      {king && kingWho && tab === "rating" && (
        <>
          {/* король слева — главный объект страницы; справа узкая колонка: что идёт сейчас и следующие два места */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-label={t("Король")} className="relative overflow-hidden rounded-surface border border-gold/40 bg-gradient-to-br from-gold/[0.14] via-gold/[0.05] to-transparent p-6 sm:p-8">
              <div className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.14em] text-gold">
                {Icon.crown("size-4")} {code ? t("Лучший игрок вечера") : t("Король микса")}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-5">
                <span className="rounded-full p-1 ring-2 ring-gold/60">
                  <Avatar src={kingWho.avatar_url} name={kingWho.nickname} size="xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${king.steam_id}`} className="block truncate text-[30px] font-extrabold leading-tight text-fg hover:text-accent sm:text-[36px]">
                    {kingWho.nickname}
                  </Link>
                  <div className="mt-1 text-meta text-fg-3">{t("Карт: {maps} · побед {wins} из {matches}", { maps: king.maps, wins: king.wins, matches: king.matches })}</div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <RoleChip role={king.role} t={t} />
                    <BestMapChip cell={king.best} t={t} />
                    <Streak n={king.streak} t={t} />
                    <Trend value={king.trend} t={t} />
                  </div>
                </div>
              </div>
              <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  [t("Рейтинг"), king.rating.toFixed(2)],
                  ["K/D", king.kd.toFixed(2)],
                  ["ADR", String(Math.round(king.adr))],
                  ["HS%", `${Math.round(king.hsPct)}%`],
                ].map(([label, value], i) => (
                  <div key={label} className={cn("rounded-control border px-4 py-3", i === 0 ? "border-gold/50 bg-gold/[0.12]" : "border-line-subtle bg-surface/70")}>
                    <dt className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{label}</dt>
                    <dd className="num mt-1 text-[26px] font-extrabold leading-none text-fg">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>

            <div className="flex flex-col gap-4">
              {!code && (
                <section aria-label={t("Идут сейчас")} className="rounded-surface border border-line-subtle bg-surface p-4">
                  <h2 className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("Идут сейчас")}</h2>
                  <div className="mt-3 flex flex-col gap-2">
                    {open.length === 0 && <p className="text-meta text-fg-3">{t("Сейчас игр нет — соберите свою.")}</p>}
                    {open.map((l) => (
                      <Link key={l.code} href={`/lobby/${l.code}`} className="flex items-center justify-between gap-3 rounded-control border border-line-subtle bg-shell/60 px-3 py-2.5 transition-colors hover:border-line-strong">
                        <span className="min-w-0">
                          <span className="block truncate text-[14px] font-semibold text-fg">
                            <span className="num text-fg-3">#{l.code}</span> {l.host.nickname}
                          </span>
                          <span className="block truncate text-micro text-fg-3">
                            {t("{n} игроков", { n: playersNeeded(l.settings) })} · BO{l.settings.best_of} · {l.status === "playing" ? t("идёт игра") : t("набор: {have} из {need}", { have: l.pool, need: playersNeeded(l.settings) })}
                          </span>
                        </span>
                        <span className={cn("shrink-0 text-meta font-semibold", l.status === "playing" ? "text-live" : "text-accent")}>{l.status === "playing" ? t("Смотреть") : t("Войти")}</span>
                      </Link>
                    ))}
                  </div>
                </section>
              )}
              {rows.slice(1, 3).map((r, i) => {
                const p = who(r.steam_id, r.name);
                return (
                  <Link key={r.steam_id} href={`/players/${r.steam_id}`} className="flex items-center gap-3 rounded-surface border border-line-subtle bg-surface p-4 transition-colors hover:border-line-strong">
                    <RankBadge n={i + 2} />
                    <Avatar src={p.avatar_url} name={p.nickname} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-fg">{p.nickname}</span>
                      <span className="num block text-micro text-fg-3">
                        K/D {r.kd.toFixed(2)} · ADR {Math.round(r.adr)}
                      </span>
                    </span>
                    <span className="num text-[22px] font-extrabold text-fg">{r.rating.toFixed(2)}</span>
                  </Link>
                );
              })}
            </div>
          </div>

          <Nominations items={twenty.nominations} who={who} t={t} evening={!!code} />

          <section aria-label={t("Все игроки")}>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
              <h2 className="text-title text-fg">{t("Все игроки")}</h2>
              <p className="text-meta text-fg-3">{code ? t("Матчей в лобби: {n}", { n: matches }) : t("В таблице — сыгравшие от {n} карт. Матчей учтено: {m}", { n: TWENTY_MIN_MAPS, m: matches })}</p>
            </div>
            <RatingTable rows={rows} who={who} t={t} meSteamId={player?.steam_id ?? null} />
            <p className="mt-2 text-meta text-fg-3">{t("Под ником — роль игрока и его коронная карта. Стрелка у рейтинга — форма: последний игровой день против прежних.")}</p>
          </section>
        </>
      )}

      {king && tab === "maps" && <MapsTab boards={twenty.boards} rows={rows} who={who} t={t} images={images} selected={map} href={(params) => href("maps", params)} meSteamId={player?.steam_id ?? null} />}

      {king && tab === "style" && <StyleTab rows={rows} who={who} t={t} a={a ?? player?.steam_id ?? null} b={b} href={(params) => href("style", params)} />}

      {king && tab === "records" && (
        <>
          {code && <p className="text-meta text-fg-3">{t("Рекорды и связки считаются по всем играм, а не по одному вечеру.")}</p>}
          <RecordsTab records={twenty.records} duos={twenty.duos} who={who} t={t} />
        </>
      )}

      {!king && (
        <>
          {!code && open.length > 0 && (
            <Section title={t("Идут сейчас")}>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {open.map((l) => (
                  <Link key={l.code} href={`/lobby/${l.code}`} className="flex items-center justify-between gap-3 rounded-surface border border-line-subtle bg-surface px-4 py-3 transition-colors hover:border-line-strong">
                    <span className="min-w-0 truncate text-[15px] font-semibold text-fg">
                      <span className="num text-fg-3">#{l.code}</span> {l.host.nickname}
                    </span>
                    <span className={cn("shrink-0 text-meta font-medium", l.status === "playing" ? "text-live" : "text-accent")}>{l.status === "playing" ? t("Смотреть") : t("Войти")}</span>
                  </Link>
                ))}
              </div>
            </Section>
          )}
          <EmptyState
            title={code ? t("В этом лобби ещё нет сыгранных матчей") : t("Рейтинга пока нет")}
            text={code ? t("Таблица появится после первой сыгранной карты.") : t("Он появится после первых сыгранных матчей.")}
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
