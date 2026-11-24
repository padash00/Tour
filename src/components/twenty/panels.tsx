import Link from "next/link";
import type { ReactNode } from "react";
import { Avatar, cn } from "@/components/ds";
import { Icon } from "@/components/lobby/icons";
import { MapThumb } from "@/components/lobby/settings";
import { RankBadge } from "@/components/public/data-table";
import { formatDate } from "@/lib/format";
import type { T } from "@/lib/i18n/core";
import { mapLabel } from "@/lib/maps";
import { DUO_MIN, NOMINATIONS, RECORDS, ROLE_MIN_MAPS, type Duo, type MapBoard, type Nomination, type RecordItem, type TwentyRow } from "@/lib/twenty-core";
import type { TwentyPlayer } from "@/lib/twenty";
import { BestMapChip, RoleChip, Streak, Trend } from "./bits";
import { money } from "./money";

/*
 * Панели раздела «Микс». Общий приём: одна панель с тонкими линейками внутри вместо россыпи отдельных карточек,
 * заголовок раздела слева и пояснение справа на одной линейке, крупные цифры — главный графический элемент.
 */

type Who = (steamId: string, fallback?: string | null) => TwentyPlayer;
const pct = (a: number, b: number) => (b ? Math.round((100 * a) / b) : 0);

/** Заголовок раздела: название слева, пояснение справа, под ними линейка */
export function SectionHead({ title, meta }: { title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-8 gap-y-1 border-b border-line pb-2.5">
      <h2 className="text-title text-fg">{title}</h2>
      {meta && <p className="text-meta text-fg-3">{meta}</p>}
    </div>
  );
}

/** Сетка ячеек с линейками между ними: фон контейнера просвечивает в зазорах в 1 px */
export function CellGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("grid gap-px overflow-hidden rounded-surface border border-line-subtle bg-line-subtle", className)}>{children}</div>;
}
const CELL = "bg-surface p-4 sm:p-5";

// ───────────────────────── пьедестал

const PLACE = ["text-gold", "text-silver", "text-bronze"];

/**
 * Пьедестал: три места одной панелью. Номер места — крупной цифрой, первое место шире остальных.
 * Заменяет прежние плашку сезона, карточку лидера и две карточки рядом — тройка показана один раз.
 */
export function Podium({ eyebrow, title, meta, note, places, prizes, emptyText, who, t }: { eyebrow: string; title: string; meta?: ReactNode; note?: ReactNode; places: (TwentyRow | null)[]; prizes: number[] | null; emptyText: string; who: Who; t: T }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-surface border border-line-subtle bg-surface">
      <header className="flex flex-wrap items-end justify-between gap-x-10 gap-y-2 border-b border-line px-5 py-4 sm:px-6">
        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">{eyebrow}</div>
          <h2 className="mt-1 text-heading text-fg">{title}</h2>
        </div>
        {meta && <p className="max-w-read text-meta text-fg-3 lg:text-right">{meta}</p>}
      </header>
      <div className="grid divide-y divide-line-subtle lg:grid-cols-[1.3fr_1fr_1fr] lg:divide-x lg:divide-y-0">
        {places.map((r, i) => {
          const p = r ? who(r.steam_id, r.name) : null;
          const first = i === 0;
          return (
            <div key={i} className={cn("p-5 sm:p-6", first && "bg-gold/[0.05]")}>
              <div className="flex items-start justify-between gap-4">
                <span className={cn("num font-extrabold leading-[0.78] tracking-[-0.05em]", first ? "text-[84px] sm:text-[96px]" : "text-[64px] sm:text-[72px]", r ? PLACE[i] : "text-fg-4")} aria-label={t("{n} место", { n: i + 1 })}>
                  {i + 1}
                </span>
                {prizes?.[i] != null && (
                  <span className="text-right">
                    <span className={cn("num block font-extrabold leading-none text-fg", first ? "text-[24px]" : "text-[20px]")}>{money(prizes[i], t)}</span>
                    <span className="mt-1 block text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t("приз")}</span>
                  </span>
                )}
              </div>
              {r && p ? (
                <>
                  <Link href={`/players/${r.steam_id}`} className="group mt-5 flex min-w-0 items-center gap-3.5">
                    <Avatar src={p.avatar_url} name={p.nickname} size={first ? "lg" : "md"} />
                    <span className="min-w-0">
                      <span className={cn("flex min-w-0 items-center gap-2 font-extrabold leading-tight text-fg group-hover:text-accent", first ? "text-[26px] sm:text-[30px]" : "text-[20px]")}>
                        <span className="truncate">{p.nickname}</span>
                        {first && <span className="shrink-0 text-gold">{Icon.crown("size-5")}</span>}
                      </span>
                      <span className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <RoleChip role={r.role} t={t} />
                        <BestMapChip cell={r.best} t={t} />
                        <Streak n={r.streak} t={t} />
                        <Trend value={r.trend} t={t} />
                      </span>
                    </span>
                  </Link>
                  <dl className="mt-5 grid grid-cols-4 gap-3 border-t border-line-subtle pt-4">
                    {[
                      [t("Рейтинг"), r.rating.toFixed(2)],
                      ["K/D", r.kd.toFixed(2)],
                      ["ADR", String(Math.round(r.adr))],
                      ["HS%", `${Math.round(r.hsPct)}%`],
                    ].map(([label, value], k) => (
                      <div key={label}>
                        <dd className={cn("num font-extrabold leading-none text-fg", k === 0 ? (first ? "text-[30px]" : "text-[24px]") : first ? "text-[22px]" : "text-[18px]")}>{value}</dd>
                        <dt className="mt-1.5 text-micro uppercase tracking-[0.1em] text-fg-3">{label}</dt>
                      </div>
                    ))}
                  </dl>
                  <p className="num mt-3 text-meta text-fg-3">{t("Карт: {maps} · побед {wins} из {matches}", { maps: r.maps, wins: r.wins, matches: r.matches })}</p>
                </>
              ) : (
                <p className="mt-6 text-meta text-fg-3">{emptyText}</p>
              )}
            </div>
          );
        })}
      </div>
      {note && <p className="border-t border-line-subtle px-5 py-3 text-meta text-fg-3 sm:px-6">{note}</p>}
    </section>
  );
}

// ───────────────────────── номинации

function nominationNote(n: Nomination, t: T) {
  const d = n.detail;
  if (d.kind === "total") return t("за вечер");
  if (d.kind === "perMap") return t("в среднем за карту · всего {n}", { n: d.n ?? 0 });
  if (d.kind === "kills") return t("убийств: {n}", { n: d.kills ?? 0 });
  if (d.kind === "map") return `${d.map ? mapLabel(d.map) : "—"} · ${d.kills}–${d.deaths}`;
  return t("рейтинг {from} → {to}", { from: (d.from ?? 0).toFixed(2), to: (d.to ?? 0).toFixed(2) });
}

export function Nominations({ items, who, t, evening }: { items: Nomination[]; who: Who; t: T; evening: boolean }) {
  if (!items.length) return null;
  return (
    <section aria-label={t("Номинации")}>
      <SectionHead title={evening ? t("Номинации вечера") : t("Номинации")} meta={evening ? t("Лучшие в своём деле за этот вечер") : t("Лучшие в своём деле — в среднем за карту, от {n} карт", { n: ROLE_MIN_MAPS })} />
      <CellGrid className="sm:grid-cols-2 lg:grid-cols-4">
        {items.map((n) => {
          const p = who(n.steam_id, n.name);
          return (
            <Link key={n.key} href={n.game_id ? `/lobbies/games/${n.game_id}` : `/players/${n.steam_id}`} className={cn(CELL, "group transition-colors hover:bg-surface-2")}>
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3" title={t(NOMINATIONS[n.key].hint)}>
                  {t(NOMINATIONS[n.key].label)}
                </span>
                <span className="num text-[26px] font-extrabold leading-none text-fg">{n.value}</span>
              </div>
              <div className="mt-3 flex items-center gap-2.5">
                <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-fg group-hover:text-accent">{p.nickname}</span>
                  <span className="block truncate text-micro text-fg-3">{nominationNote(n, t)}</span>
                </span>
              </div>
            </Link>
          );
        })}
      </CellGrid>
    </section>
  );
}

// ───────────────────────── карта крупно

/** Выбранная карта баннером: название, сколько раз сыграна, и её хозяин с рейтингом */
export function MapHero({ board, image, who, t }: { board: MapBoard; image?: string; who: Who; t: T }) {
  const owner = board.rows[0];
  const p = owner ? who(owner.steam_id, owner.name) : null;
  return (
    <MapThumb map={board.map} image={image} className="rounded-surface">
      <span className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/25" />
      <div className="relative flex min-h-[190px] flex-col justify-end gap-5 p-5 sm:flex-row sm:items-end sm:justify-between sm:p-6">
        <div>
          <div className="text-micro font-semibold uppercase tracking-[0.14em] text-white/70">{t("Карта")}</div>
          <div className="mt-1 text-[40px] font-extrabold leading-none tracking-[-0.02em] text-white sm:text-[52px]">{mapLabel(board.map)}</div>
          <div className="num mt-2 text-[14px] text-white/80">
            {t("игр: {n}", { n: board.played })} · {board.minMaps > 1 ? t("В таблице — сыгравшие на карте от {n} игр", { n: board.minMaps }) : t("Карту играли редко — в таблице все, кто на ней был")}
          </div>
        </div>
        {owner && p && (
          <Link href={`/players/${owner.steam_id}`} className="group flex items-center gap-4 rounded-control bg-black/50 p-3.5 backdrop-blur-sm sm:p-4">
            <Avatar src={p.avatar_url} name={p.nickname} size="lg" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 text-micro font-semibold uppercase tracking-[0.14em] text-gold">
                {Icon.crown("size-4")} {t("Хозяин карты")}
              </span>
              <span className="mt-0.5 block truncate text-[22px] font-extrabold leading-tight text-white group-hover:underline">{p.nickname}</span>
              <span className="num block text-[13px] text-white/75">{t("Игр на карте: {n} · побед {wins} · K/D {kd} · ADR {adr}", { n: owner.maps, wins: owner.wins, kd: owner.kd.toFixed(2), adr: Math.round(owner.adr) })}</span>
            </span>
            <span className="num shrink-0 text-[44px] font-extrabold leading-none text-white">{owner.rating.toFixed(2)}</span>
          </Link>
        )}
      </div>
    </MapThumb>
  );
}

// ───────────────────────── рекорды и связки

export function RecordsTab({ records, duos, who, t }: { records: RecordItem[]; duos: Duo[]; who: Who; t: T }) {
  return (
    <div className="space-y-10">
      <section aria-label={t("Рекорды")}>
        <SectionHead title={t("Рекорды")} meta={t("За всё время. Побьёте — запись перейдёт к вам.")} />
        <CellGrid className="sm:grid-cols-2 xl:grid-cols-4">
          {records.map((r) => {
            const p = who(r.steam_id, r.name);
            return (
              <Link key={r.key} href={r.game_id ? `/lobbies/games/${r.game_id}` : `/players/${r.steam_id}`} className={cn(CELL, "group transition-colors hover:bg-surface-2")}>
                <div className="text-micro font-semibold uppercase tracking-[0.12em] text-fg-3">{t(RECORDS[r.key])}</div>
                <div className="num mt-2 text-[44px] font-extrabold leading-none tracking-[-0.03em] text-fg">{r.value}</div>
                <div className="mt-4 flex items-center gap-2.5 border-t border-line-subtle pt-3">
                  <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
                  <span className="min-w-0">
                    <span className="block truncate text-[14px] font-semibold text-fg group-hover:text-accent">{p.nickname}</span>
                    <span className="block truncate text-micro text-fg-3">{[r.map ? mapLabel(r.map) : null, r.note, r.at ? formatDate(r.at, t.lang) : null].filter(Boolean).join(" · ")}</span>
                  </span>
                </div>
              </Link>
            );
          })}
        </CellGrid>
      </section>

      <section aria-label={t("Лучшие связки")}>
        <SectionHead title={t("Лучшие связки")} meta={t("Пары, которые чаще всего выигрывают в одной команде. От {n} матчей вместе.", { n: DUO_MIN })} />
        {duos.length === 0 ? (
          <p className="rounded-surface border border-line-subtle bg-surface p-5 text-meta text-fg-3">{t("Пока никто не сыграл вместе {n} матча.", { n: DUO_MIN })}</p>
        ) : (
          <CellGrid className="grid-cols-1 lg:grid-cols-2">
            {duos.map((d, i) => {
              const pa = who(d.a);
              const pb = who(d.b);
              return (
                <div key={`${d.a}:${d.b}`} className="flex min-w-0 items-center gap-3 bg-surface px-4 py-3">
                  <RankBadge n={i + 1} />
                  <span className="flex shrink-0 -space-x-2">
                    <Avatar src={pa.avatar_url} name={pa.nickname} size="sm" className="ring-2 ring-surface" />
                    <Avatar src={pb.avatar_url} name={pb.nickname} size="sm" className="ring-2 ring-surface" />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-fg">
                    <Link href={`/players/${d.a}`} className="hover:text-accent">{pa.nickname}</Link>
                    <span className="text-fg-3"> + </span>
                    <Link href={`/players/${d.b}`} className="hover:text-accent">{pb.nickname}</Link>
                  </span>
                  <span className="num hidden shrink-0 text-meta text-fg-3 sm:inline">{t("{wins} из {games}", { wins: d.wins, games: d.games })}</span>
                  <span className={cn("num w-14 shrink-0 text-right text-[18px] font-extrabold", pct(d.wins, d.games) >= 60 ? "text-ok" : "text-fg")}>{pct(d.wins, d.games)}%</span>
                </div>
              );
            })}
          </CellGrid>
        )}
      </section>
    </div>
  );
}
