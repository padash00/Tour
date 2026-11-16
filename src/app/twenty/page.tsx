import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { cupTeams } from "@/lib/cup-core";
import { playersNeeded } from "@/lib/lobby-settings";
import { formatDateTime } from "@/lib/format";
import { getT } from "@/lib/i18n/server";
import { listOpenLobbies, playerLobby } from "@/lib/lobby";
import { TWENTY_MIN_MAPS, twentyRating } from "@/lib/twenty";
import { Avatar, Button, Container, EmptyState, PageTitle, Panel, Section, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { CreatePotButton } from "@/components/lobby/pot";
import { DATA_TABLE, NUM_CELL, RankBadge, RatingBar } from "@/components/public/data-table";

export const dynamic = "force-dynamic";

const CODE = /^[A-Z0-9]{4,10}$/;

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: t("Двадцатка"),
    description: "Двадцатка F16 Arena: большие лобби CS2 на 20, 30 и 40 игроков и общий рейтинг игроков — кто король.",
    alternates: { canonical: "/twenty" },
  };
}

/** «Двадцатка»: рейтинг игроков больших лобби — общий или за один вечер (?lobby=КОД) — и сами лобби */
export default async function TwentyPage(props: PageProps<"/twenty">) {
  const t = await getT();
  const sp = await props.searchParams;
  const raw = typeof sp.lobby === "string" ? sp.lobby.trim().toUpperCase() : "";
  const code = CODE.test(raw) ? raw : undefined;

  const player = await getCurrentPlayer();
  const [{ rows, evenings, matches }, lobbies, mine] = await Promise.all([twentyRating({ code }), listOpenLobbies(), player ? playerLobby(player.id) : null]);
  // игры на банк («Десятка») и большие лобби; комнаты отдельных матчей сетки не показываем — в них ведёт само лобби
  const open = lobbies.filter((l) => (l.settings.pot || cupTeams(l.settings.players) > 0) && !l.settings.cup_of);
  const king = rows[0];

  return (
    <Container className="space-y-8 pb-16 pt-8 sm:pt-10">
      <header className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <PageTitle>{code ? t("Рейтинг лобби #{code}", { code }) : t("Двадцатка")}</PageTitle>
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
        </div>
      </header>

      {king ? (
        <>
          {/* король слева — главный объект страницы; справа узкая колонка: что идёт сейчас и следующие два места */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
            <section aria-label={t("Король")} className="relative overflow-hidden rounded-surface border border-gold/40 bg-gradient-to-br from-gold/[0.14] via-gold/[0.05] to-transparent p-6 sm:p-8">
              <div className="flex items-center gap-2 text-micro font-semibold uppercase tracking-[0.14em] text-gold">
                {Icon.crown("size-4")} {code ? t("Лучший игрок вечера") : t("Король двадцатки")}
              </div>
              <div className="mt-5 flex flex-wrap items-center gap-5">
                <span className="rounded-full p-1 ring-2 ring-gold/60">
                  <Avatar src={king.avatar_url} name={king.nickname} size="xl" />
                </span>
                <div className="min-w-0 flex-1">
                  <Link href={`/players/${king.steam_id}`} className="block truncate text-[30px] font-extrabold leading-tight text-fg hover:text-accent sm:text-[36px]">
                    {king.nickname}
                  </Link>
                  <div className="mt-1 text-meta text-fg-3">{t("Карт: {maps} · побед {wins} из {matches}", { maps: king.maps, wins: king.wins, matches: king.matches })}</div>
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
              {rows.slice(1, 3).map((r, i) => (
                <Link key={r.steam_id} href={`/players/${r.steam_id}`} className="flex items-center gap-3 rounded-surface border border-line-subtle bg-surface p-4 transition-colors hover:border-line-strong">
                  <RankBadge n={i + 2} />
                  <Avatar src={r.avatar_url} name={r.nickname} size="md" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-fg">{r.nickname}</span>
                    <span className="num block text-micro text-fg-3">
                      K/D {r.kd.toFixed(2)} · ADR {Math.round(r.adr)}
                    </span>
                  </span>
                  <span className="num text-[22px] font-extrabold text-fg">{r.rating.toFixed(2)}</span>
                </Link>
              ))}
            </div>
          </div>

          <Section title={t("Все игроки")} description={code ? t("Матчей в лобби: {n}", { n: matches }) : t("В таблице — сыгравшие от {n} карт. Матчей учтено: {m}", { n: TWENTY_MIN_MAPS, m: matches })}>
            <Panel padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className={cn(DATA_TABLE, "min-w-[720px]")}>
                  <thead>
                    <tr>
                      <th className="w-14">#</th>
                      <th>{t("Игрок")}</th>
                      {[t("Карт"), t("Побед"), "K/D", "ADR", "HS%", "MVP"].map((h) => (
                        <th key={h} className="w-[84px] !text-right">
                          {h}
                        </th>
                      ))}
                      <th className="w-[120px] !text-right">{t("Рейтинг")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => {
                      const me = player?.steam_id === r.steam_id;
                      return (
                        <tr key={r.steam_id} className={cn(me && "bg-accent-dim/60")}>
                          <td>
                            <RankBadge n={i + 1} />
                          </td>
                          <td>
                            <Link href={`/players/${r.steam_id}`} className="flex min-w-0 items-center gap-3 font-medium text-fg hover:text-accent">
                              <Avatar src={r.avatar_url} name={r.nickname} size="sm" />
                              <span className="truncate">{r.nickname}</span>
                              {i === 0 && <span className="shrink-0 text-gold">{Icon.crown("size-4")}</span>}
                              {me && <span className="shrink-0 rounded-chip bg-accent px-1.5 py-0.5 text-micro font-semibold text-accent-ink">{t("вы")}</span>}
                            </Link>
                          </td>
                          <td className={NUM_CELL}>{r.maps}</td>
                          <td className={NUM_CELL}>
                            {r.wins}/{r.matches}
                          </td>
                          <td className={cn(NUM_CELL, r.kd >= 1 ? "text-ok" : "text-fg-2")}>{r.kd.toFixed(2)}</td>
                          <td className={NUM_CELL}>{Math.round(r.adr)}</td>
                          <td className={NUM_CELL}>{Math.round(r.hsPct)}%</td>
                          <td className={NUM_CELL}>{r.mvp}</td>
                          <td className={cn(NUM_CELL, r.rating >= 1.15 ? "text-ok" : r.rating < 0.9 ? "text-fg-3" : "text-fg")}>
                            <span className="text-[16px] font-extrabold">{r.rating.toFixed(2)}</span>
                            <RatingBar value={r.rating} className="mt-1" />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </Section>
        </>
      ) : (
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

      {!code && evenings.length > 0 && (
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
