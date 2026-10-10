"use client";

import Link from "next/link";
import { ArrowRight, ChevronRight, Trophy } from "lucide-react";
import { useEffect, useState } from "react";
import { bracketLabel, formatDateTime, formatMoney } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import type { TournamentStatus } from "@/lib/types";
import { Button, EmptyState, Status, cn, tournamentStatus } from "@/components/ds";

/*
 * Список турниров с фильтром по состоянию (в браузере: страница из кэша CDN, ?f= в адресе).
 * Главный текущий турнир — крупнее, остальные — строками с тем, что нужно для решения.
 */

export type TournamentItem = {
  id: string;
  slug: string;
  name: string;
  status: TournamentStatus;
  format: string;
  bracket_type: string;
  is_lan: boolean;
  location: string | null;
  starts_at: string | null;
  registration_closes_at: string | null;
  max_teams: number;
  approved: number;
  prize_pool: string | null;
  cover_url: string | null;
};

const FILTERS: { key: string; label: string; match: TournamentStatus[] }[] = [
  { key: "all", label: "Все", match: [] },
  { key: "registration", label: "Регистрация", match: ["registration"] },
  { key: "soon", label: "Скоро", match: ["registration_closed", "checkin"] },
  { key: "live", label: "Идут", match: ["live"] },
  { key: "finished", label: "Завершённые", match: ["finished", "cancelled"] },
];

const modeShort = (f: string) => (modeOf(f).size === 5 ? "5v5" : modeOf(f).size === 2 ? "2v2" : "1v1");
const place = (t: TournamentItem) => (t.is_lan ? (t.location ? `LAN · ${t.location}` : "LAN") : (t.location ?? "Онлайн"));
const realPrize = (v: string | null) => !!v && !/^\s*0+\s*$/.test(v);

function facts(t: TournamentItem) {
  return [modeShort(t.format), bracketLabel[t.bracket_type] ?? t.bracket_type, place(t)];
}

function cta(t: TournamentItem) {
  if (t.status === "registration") return "Подать заявку";
  if (t.status === "checkin") return "Check-in";
  if (t.status === "live") return "Смотреть";
  return "Открыть";
}

export function TournamentList({ items, featuredId }: { items: TournamentItem[]; featuredId: string | null }) {
  const [filter, setFilter] = useState("all");
  useEffect(() => {
    const f = new URLSearchParams(window.location.search).get("f");
    if (f && FILTERS.some((x) => x.key === f)) {
      const id = setTimeout(() => setFilter(f), 0);
      return () => clearTimeout(id);
    }
  }, []);
  const choose = (key: string) => {
    setFilter(key);
    const url = new URL(window.location.href);
    if (key === "all") url.searchParams.delete("f");
    else url.searchParams.set("f", key);
    window.history.replaceState(window.history.state, "", url);
  };

  const def = FILTERS.find((f) => f.key === filter)!;
  const shown = items.filter((t) => !def.match.length || def.match.includes(t.status));
  const featured = shown.find((t) => t.id === featuredId) ?? null;
  const rest = shown.filter((t) => t.id !== featured?.id);
  const count = (f: (typeof FILTERS)[number]) => (f.match.length ? items.filter((t) => f.match.includes(t.status)).length : items.length);

  return (
    <div>
      <div role="group" aria-label="Фильтр турниров" className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {FILTERS.map((f) => {
          const n = count(f);
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => choose(f.key)}
              className={cn(
                "inline-flex h-9 shrink-0 items-center gap-2 rounded-control border px-3 text-[14px] font-medium transition-colors duration-[var(--dur-hover)]",
                filter === f.key ? "border-line-strong bg-white/[0.07] text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {f.label}
              <span className="num text-micro text-fg-3">{n}</span>
            </button>
          );
        })}
      </div>

      <div className="mt-6 space-y-8">
        {featured && <Featured t={featured} />}
        {rest.length > 0 && (
          <div className="divide-y divide-line-subtle overflow-hidden rounded-surface border border-line-subtle bg-surface">
            {rest.map((t) => (
              <Row key={t.id} t={t} />
            ))}
          </div>
        )}
        {!featured && rest.length === 0 && (
          <EmptyState
            icon={<Trophy />}
            title={filter === "all" ? "Турниров пока нет" : "В этом разделе турниров нет"}
            text={filter === "all" ? "Следующий турнир F16 Arena будет объявлен здесь — пока можно собрать команду." : "Загляните в другие разделы или в «Все»."}
            action={
              filter === "all" ? (
                <Button href="/team/create" variant="secondary" size="sm">
                  Собрать команду
                </Button>
              ) : (
                <Button variant="ghost" size="sm" onClick={() => choose("all")}>
                  Показать все
                </Button>
              )
            }
          />
        )}
      </div>
    </div>
  );
}

/** Главный текущий турнир: крупнее, обложка — фон */
function Featured({ t }: { t: TournamentItem }) {
  const free = Math.max(0, t.max_teams - t.approved);
  return (
    <Link href={`/tournaments/${t.slug}`} className="group relative block overflow-hidden rounded-feature border border-line bg-surface transition-colors duration-[var(--dur-hover)] hover:border-line-strong">
      {t.cover_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={t.cover_url} alt="" className="absolute inset-0 h-full w-full object-cover opacity-25" />
      )}
      <span className="absolute inset-0 bg-gradient-to-r from-surface via-surface/90 to-surface/50" aria-hidden />
      <div className="relative flex flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <Status info={tournamentStatus[t.status]} />
          <h2 className="mt-3 break-words text-[24px] font-semibold leading-tight tracking-[-0.015em] text-fg sm:text-[28px]">{t.name}</h2>
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-fg-2">
            {facts(t).map((x, i) => (
              <span key={i} className="flex items-center gap-3">
                {i > 0 && <span className="text-fg-4" aria-hidden>·</span>}
                {x}
              </span>
            ))}
          </div>
          <dl className="mt-4 flex flex-wrap gap-x-8 gap-y-2">
            <div>
              <dt className="text-micro text-fg-3">Старт</dt>
              <dd className="text-[14px] font-medium text-fg">{t.starts_at ? formatDateTime(t.starts_at) : "Уточняется"}</dd>
            </div>
            <div>
              <dt className="text-micro text-fg-3">{modeOf(t.format).size === 1 ? "Участники" : "Команды"}</dt>
              <dd className="num text-[14px] font-medium text-fg">
                {t.approved} / {t.max_teams}
                {t.status === "registration" && <span className="text-fg-3"> · свободно {free}</span>}
              </dd>
            </div>
            {realPrize(t.prize_pool) && (
              <div>
                <dt className="text-micro text-fg-3">Призовой фонд</dt>
                <dd className="text-[14px] font-medium text-fg">{formatMoney(t.prize_pool)}</dd>
              </div>
            )}
          </dl>
        </div>
        <span className="inline-flex h-12 shrink-0 items-center gap-2 self-start rounded-control bg-accent px-6 text-[15px] font-semibold text-accent-ink transition-colors group-hover:bg-accent-strong md:self-auto">
          {cta(t)} <ArrowRight className="size-4" />
        </span>
      </div>
    </Link>
  );
}

function Row({ t }: { t: TournamentItem }) {
  const free = Math.max(0, t.max_teams - t.approved);
  return (
    <Link href={`/tournaments/${t.slug}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-[var(--dur-hover)] hover:bg-surface-2 sm:flex-nowrap">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <div className="truncate text-[15px] font-semibold text-fg group-hover:text-accent">{t.name}</div>
        <div className="mt-0.5 truncate text-meta text-fg-3">
          {facts(t).join(" · ")} · {t.starts_at ? formatDateTime(t.starts_at) : "дата уточняется"}
        </div>
      </div>
      <div className="num w-28 shrink-0 text-meta text-fg-2 sm:text-right">
        {t.approved}/{t.max_teams}
        {t.status === "registration" && <span className="block text-micro text-fg-3">свободно {free}</span>}
      </div>
      <Status info={tournamentStatus[t.status]} size="sm" />
      <ChevronRight className="hidden size-4 text-fg-4 group-hover:text-fg-2 sm:block" aria-hidden />
    </Link>
  );
}
