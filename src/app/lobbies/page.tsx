import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Lock, Search, Users } from "lucide-react";
import { getCurrentPlayer } from "@/lib/auth";
import { listOpenLobbies, playerLobby } from "@/lib/lobby";
import { getMapImages } from "@/lib/settings";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { LiveRefresh } from "@/components/live-refresh";
import { CreateLobbyButton } from "@/components/lobby/create-lobby";
import { MapThumb } from "@/components/lobby/settings";
import {
  Button,
  Container,
  DataRow,
  EmptyState,
  FeatureSurface,
  PageTitle,
  RowList,
  Status,
  lobbyStatus,
  cn,
} from "@/components/ds";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Лобби",
  description: "Лобби F16 Arena: игры на серверах клуба CS2 — собирайтесь и играйте без турнира.",
  alternates: { canonical: "/lobbies" },
};

type Filter = "all" | "waiting" | "playing";

function lobbyPhase(l: Awaited<ReturnType<typeof listOpenLobbies>>[number]) {
  if (!l.game) return "waiting" as const;
  if (l.game.status === "live") return "live" as const;
  if (l.game.status === "veto") return "veto" as const;
  return "server" as const;
}

export default async function LobbiesPage(props: PageProps<"/lobbies">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 60) : "";
  const filter: Filter = sp.state === "waiting" || sp.state === "playing" ? sp.state : "all";

  const [player, lobbies, images] = await Promise.all([getCurrentPlayer(), listOpenLobbies(), getMapImages()]);
  const mine = player ? await playerLobby(player.id) : null;

  const normalized = q.toLocaleLowerCase("ru");
  const filtered = lobbies.filter((l) => {
    if (filter === "waiting" && l.game) return false;
    if (filter === "playing" && !l.game) return false;
    if (!normalized) return true;
    const map = l.game?.map ?? l.settings.maps[0] ?? "";
    return [
      l.code,
      l.host.nickname,
      mapLabel(map),
      MODES[l.settings.mode].label,
      l.settings.network === "lan" ? "lan" : "internet",
    ].some((v) => v.toLocaleLowerCase("ru").includes(normalized));
  });

  const waitingCount = lobbies.filter((l) => !l.game).length;
  const playingCount = lobbies.length - waitingCount;

  const href = (state: Filter) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (state !== "all") p.set("state", state);
    const s = p.toString();
    return s ? `/lobbies?${s}` : "/lobbies";
  };

  return (
    <>
      <LiveRefresh intervalMs={5000} />

      <Container width="wide" className="pb-16 pt-8 sm:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-5">
          <div>
            <PageTitle>Лобби</PageTitle>
            <p className="mt-1 max-w-read text-meta text-fg-3">
              Неофициальные матчи на серверах F16. Создайте комнату, соберите игроков и настройте игру под себя.
            </p>
          </div>
          {!mine && <CreateLobbyButton loggedIn={!!player} />}
        </header>

        {mine && (
          <FeatureSurface className="mt-8 flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-micro font-semibold uppercase tracking-[0.14em] text-accent">Ваше лобби</div>
              <div className="mt-1 text-title text-fg">#{mine.code}</div>
              <p className="mt-1 text-meta text-fg-3">Вы уже состоите в активном лобби. Сначала завершите или покиньте его.</p>
            </div>
            <Button href={`/lobby/${mine.code}`} iconRight={<ArrowRight />}>
              Вернуться в лобби
            </Button>
          </FeatureSurface>
        )}

        <div className="mt-8 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <form action="/lobbies" method="get" className="relative max-w-xl">
            {filter !== "all" && <input type="hidden" name="state" value={filter} />}
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-3" aria-hidden />
            <input
              type="search"
              name="q"
              defaultValue={q}
              placeholder="Код, хост, карта или режим"
              aria-label="Поиск лобби"
              className="h-11 w-full rounded-control border border-line bg-shell pl-9 pr-24 text-[14px] text-fg outline-none placeholder:text-fg-3 focus:border-accent focus:shadow-[0_0_0_3px_var(--color-accent-dim)]"
            />
            <button type="submit" className="absolute right-1.5 top-1.5 h-8 rounded-control px-3 text-meta font-medium text-fg-2 hover:bg-white/[0.06] hover:text-fg">
              Найти
            </button>
          </form>

          <nav className="flex gap-1 overflow-x-auto rounded-control border border-line-subtle bg-shell p-1" aria-label="Состояние лобби">
            {[
              ["all", "Все", lobbies.length],
              ["waiting", "Набор", waitingCount],
              ["playing", "Идёт игра", playingCount],
            ].map(([key, label, count]) => {
              const active = filter === key;
              return (
                <Link
                  key={String(key)}
                  href={href(key as Filter)}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-8 shrink-0 items-center gap-2 rounded-[6px] px-3 text-meta font-medium transition-colors",
                    active ? "bg-elevated text-fg" : "text-fg-3 hover:text-fg",
                  )}
                >
                  {label}
                  <span className="num text-micro text-fg-3">{count}</span>
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="mt-8">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users />}
              title={q || filter !== "all" ? "Подходящих лобби нет" : "Открытых лобби нет"}
              text={q || filter !== "all" ? "Измените поиск или фильтр состояния." : "Создайте своё лобби и пригласите друзей по ссылке."}
              action={
                q || filter !== "all" ? (
                  <Button href="/lobbies" variant="secondary" size="sm">
                    Сбросить фильтры
                  </Button>
                ) : mine ? undefined : (
                  <CreateLobbyButton loggedIn={!!player} />
                )
              }
            />
          ) : (
            <RowList>
              {filtered.map((l) => {
                const map = l.game?.map ?? l.settings.maps[0] ?? "de_mirage";
                const total = l.settings.team_size * 2;
                const phase = lobbyPhase(l);
                const status = lobbyStatus[phase];
                const full = l.players >= total;
                return (
                  <DataRow
                    key={l.code}
                    href={`/lobby/${l.code}`}
                    className="min-h-[76px] sm:min-h-[82px]"
                    leading={
                      <MapThumb map={map} image={images[map]} className="h-12 w-[72px] rounded-control border border-line-subtle sm:h-14 sm:w-24">
                        <span className="absolute bottom-1.5 left-2 max-w-[82px] truncate text-[11px] font-medium text-fg">
                          {mapLabel(map)}
                        </span>
                      </MapThumb>
                    }
                    title={
                      <span className="flex min-w-0 items-center gap-2">
                        <span className="num shrink-0 text-fg-3">#{l.code}</span>
                        <span className="truncate">{l.host.nickname}</span>
                        {l.visibility === "closed" && <Lock className="size-3.5 shrink-0 text-fg-3" aria-label="Вход по паролю" />}
                      </span>
                    }
                    meta={
                      <span>
                        {MODES[l.settings.mode].label.replace(" на ", "×")} · BO{l.settings.best_of} · {l.settings.network === "lan" ? "LAN" : "Интернет"} ·{" "}
                        <span className={full ? "text-fg-3" : "text-fg-2"}>{l.players}/{total} игроков</span>
                        {l.settings.filter ? " · фильтр" : ""}
                      </span>
                    }
                    trailing={
                      <>
                        <div className="hidden -space-x-1.5 sm:flex">
                          {l.members.slice(0, 4).map((member, i) => (
                            <span
                              key={i}
                              className="grid size-6 place-items-center overflow-hidden rounded-full border border-bg bg-surface-3 text-[9px] font-semibold text-fg-3"
                              title={member.nickname}
                            >
                              {member.avatar_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={member.avatar_url} alt="" className="size-full object-cover" />
                              ) : (
                                member.nickname.slice(0, 1).toUpperCase()
                              )}
                            </span>
                          ))}
                        </div>
                        <Status info={status} size="sm" />
                        <ArrowRight className="hidden size-4 text-fg-4 lg:block" aria-hidden />
                      </>
                    }
                  />
                );
              })}
            </RowList>
          )}
        </div>
      </Container>
    </>
  );
}
