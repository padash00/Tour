"use client";

import { useRouter } from "next/navigation";
import { CornerDownLeft, Search, Swords, Trophy, Users, X } from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import type { SearchResult } from "@/lib/search";
import { Avatar, FaceitLevel, ModalLayer, Score, Spinner, Status, TeamLogo, cn, matchStatus, tournamentStatus, useModal } from "@/components/ds";
import type { MatchStatus, TournamentStatus } from "@/lib/types";

/*
 * Глобальный поиск шапки: игроки, команды, турниры, матчи найденных команд.
 * Открывается кнопкой в шапке, Ctrl/⌘+K или «/». Стрелки — по результатам, Enter — открыть, Esc — закрыть.
 */

type Item = { key: string; href: string; group: "players" | "teams" | "tournaments" | "matches"; node: ReactNode };
const GROUPS: { key: Item["group"]; title: string; icon: ReactNode }[] = [
  { key: "players", title: "Игроки", icon: <Users /> },
  { key: "teams", title: "Команды", icon: <Users /> },
  { key: "tournaments", title: "Турниры", icon: <Trophy /> },
  { key: "matches", title: "Матчи", icon: <Swords /> },
];

function toItems(r: SearchResult): Item[] {
  return [
    ...r.players.map((p) => ({
      key: `p${p.id}`,
      href: p.href,
      group: "players" as const,
      node: (
        <>
          <Avatar src={p.avatar_url} name={p.nickname} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium">{p.nickname}</span>
          <FaceitLevel level={p.faceit_level} />
        </>
      ),
    })),
    ...r.teams.map((t) => ({
      key: `t${t.id}`,
      href: t.href,
      group: "teams" as const,
      node: (
        <>
          <TeamLogo src={t.logo_url} tag={t.tag} size="sm" />
          <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
          <span className="num text-meta text-fg-3">{t.tag}</span>
        </>
      ),
    })),
    ...r.tournaments.map((t) => ({
      key: `r${t.id}`,
      href: t.href,
      group: "tournaments" as const,
      node: (
        <>
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-white/[0.05] text-fg-3">
            <Trophy className="size-4" />
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{t.name}</span>
          <span className="hidden min-[420px]:inline-flex"><Status info={tournamentStatus[t.status as TournamentStatus] ?? tournamentStatus.finished} size="sm" /></span>
        </>
      ),
    })),
    ...r.matches.map((m) => ({
      key: `m${m.id}`,
      href: m.href,
      group: "matches" as const,
      node: (
        <>
          <span className="grid size-8 shrink-0 place-items-center rounded-control bg-white/[0.05] text-fg-3">
            <Swords className="size-4" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate font-medium">
              {m.team1} — {m.team2}
            </span>
            <span className="block truncate text-meta text-fg-3">
              {m.tournament} · матч #{m.number}
            </span>
          </span>
          {m.status === "finished" || m.status === "live" ? <Score a={m.team1_score} b={m.team2_score} size="sm" /> : null}
          <span className="hidden min-[460px]:inline-flex"><Status info={matchStatus(m.status as MatchStatus)} size="sm" /></span>
        </>
      ),
    })),
  ];
}

function useSearch(q: string) {
  const [state, setState] = useState<{ q: string; result: SearchResult | null; loading: boolean; error: boolean }>({ q: "", result: null, loading: false, error: false });
  useEffect(() => {
    const query = q.trim();
    if (query.length < 2) return;
    const ctrl = new AbortController();
    const start = setTimeout(() => setState((s) => ({ ...s, loading: true, error: false })), 0);
    // пауза после ввода — не дёргаем сервер на каждую букву
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: ctrl.signal });
        if (!r.ok) throw new Error(String(r.status));
        setState({ q: query, result: (await r.json()) as SearchResult, loading: false, error: false });
      } catch (e) {
        if ((e as Error).name !== "AbortError") setState((s) => ({ ...s, loading: false, error: true }));
      }
    }, 220);
    return () => {
      clearTimeout(start);
      clearTimeout(t);
      ctrl.abort();
    };
  }, [q]);
  return q.trim().length < 2 ? { q: "", result: null, loading: false, error: false } : state;
}

export function SearchDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const panel = useModal(open, onClose);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const listId = useId();
  const { result, loading, error } = useSearch(q);
  const items = useMemo(() => (result ? toItems(result) : []), [result]);
  const list = useRef<HTMLDivElement>(null);

  const go = useCallback(
    (href: string) => {
      onClose();
      setQ("");
      router.push(href);
    },
    [onClose, router],
  );

  useEffect(() => {
    list.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open || typeof document === "undefined") return null;
  const short = q.trim().length < 2;
  const empty = !short && !loading && !error && result && items.length === 0;
  let index = -1;

  return (
    <ModalLayer onClose={onClose} align="top">
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Поиск"
        className="relative flex max-h-[88dvh] w-full max-w-[640px] flex-col overflow-hidden rounded-feature border border-line bg-elevated shadow-[var(--shadow-pop)] animate-[pop_var(--dur-modal)_cubic-bezier(.2,.8,.2,1)] sm:max-h-[80dvh]"
      >
        <div className="flex items-center gap-2 border-b border-line-subtle px-3 sm:gap-3 sm:px-4">
          <Search className="size-5 text-fg-3" aria-hidden />
          <input
            data-autofocus
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-activedescendant={items[active] ? `${listId}-${active}` : undefined}
            aria-autocomplete="list"
            aria-label="Поиск игроков, команд и турниров"
            value={q}
            onChange={(e) => { setQ(e.target.value); setActive(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setActive((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setActive((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter" && items[active]) {
                e.preventDefault();
                go(items[active].href);
              }
            }}
            placeholder="Игроки, команды, турниры"
            className="h-14 min-w-0 flex-1 bg-transparent text-[16px] text-fg outline-none placeholder:text-fg-3"
          />
          {loading ? (
            <Spinner className="size-4 text-fg-3" />
          ) : q ? (
            <button type="button" onClick={() => { setQ(""); setActive(0); }} aria-label="Очистить запрос" className="grid size-8 place-items-center rounded-tiny text-fg-3 hover:bg-white/[0.06] hover:text-fg">
              <X className="size-4" />
            </button>
          ) : null}
          <kbd className="kbd hidden sm:inline-grid">Esc</kbd>
          {/* на телефоне Esc нет: отдельное закрытие (крестик рядом — очистка запроса) */}
          <button type="button" onClick={onClose} className="-mr-1 h-10 shrink-0 rounded-control px-2 text-[14px] font-medium text-accent hover:text-accent-strong sm:hidden">
            Отмена
          </button>
        </div>

        <div ref={list} id={listId} role="listbox" aria-label="Результаты поиска" className="min-h-0 flex-1 overflow-y-auto p-2">
          {short && <p className="px-3 py-8 text-center text-[14px] text-fg-3">Начните вводить ник, название команды или турнира — от 2 символов.</p>}
          {error && <p className="px-3 py-8 text-center text-[14px] text-danger">Поиск не ответил. Попробуйте ещё раз.</p>}
          {empty && (
            <p className="px-3 py-8 text-center text-[14px] text-fg-3">
              По запросу «<span className="text-fg">{q.trim()}</span>» ничего не нашли.
            </p>
          )}
          {GROUPS.map((g) => {
            const groupItems = items.filter((i) => i.group === g.key);
            if (!groupItems.length) return null;
            return (
              <div key={g.key} role="group" aria-label={g.title} className="mb-1">
                <div className="px-3 pb-1 pt-3 text-micro font-semibold uppercase tracking-[0.14em] text-fg-3">{g.title}</div>
                {groupItems.map((it) => {
                  index++;
                  const i = index;
                  const on = i === active;
                  return (
                    <div
                      key={it.key}
                      id={`${listId}-${i}`}
                      data-index={i}
                      role="option"
                      aria-selected={on}
                      onMouseMove={() => setActive(i)}
                      onClick={() => go(it.href)}
                      className={cn("flex min-h-12 cursor-pointer items-center gap-3 rounded-control px-3 py-2 text-[14px] text-fg", on && "bg-white/[0.07]")}
                    >
                      {it.node}
                      {on && <CornerDownLeft className="size-4 shrink-0 text-fg-3" aria-hidden />}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
        <div className="hidden items-center gap-4 border-t border-line-subtle px-4 py-2.5 text-micro text-fg-3 sm:flex">
          <span>
            <kbd className="kbd">↑</kbd> <kbd className="kbd">↓</kbd> выбрать
          </span>
          <span>
            <kbd className="kbd">Enter</kbd> открыть
          </span>
          <span className="ml-auto">
            <kbd className="kbd">Ctrl</kbd> <kbd className="kbd">K</kbd> — поиск с любой страницы
          </span>
        </div>
      </div>
    </ModalLayer>
  );
}

/** Кнопка поиска в шапке: на широком экране — как поле, на узком — иконка. Ctrl/⌘+K и «/» открывают поиск */
export function SearchTrigger() {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
      if ((e.key.toLowerCase() === "k" || e.key.toLowerCase() === "л") && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "/" && !typing) {
        e.preventDefault();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Поиск"
        aria-keyshortcuts="Control+K"
        className="hidden h-10 w-56 items-center gap-2.5 rounded-control border border-line bg-white/[0.02] px-3 text-[14px] text-fg-3 transition-colors duration-[var(--dur-hover)] hover:border-line-strong hover:text-fg-2 xl:flex"
      >
        <Search className="size-4" />
        <span className="flex-1 text-left">Поиск</span>
        <kbd className="kbd">Ctrl K</kbd>
      </button>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Поиск"
        className="grid size-10 place-items-center rounded-control text-fg-2 transition-colors duration-[var(--dur-hover)] hover:bg-white/[0.06] hover:text-fg xl:hidden"
      >
        <Search className="size-[18px]" />
      </button>
      <SearchDialog open={open} onClose={close} />
    </>
  );
}
