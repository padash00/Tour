import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { getActiveMembership } from "@/lib/data";
import { FINDER_MODES, FINDER_ROLES, getOwnPost, listFinderPosts } from "@/lib/finder";
import { PlayerPostCard, PostForm, TeamPostCard } from "@/components/public/finder";
import { Tabs } from "@/components/ui";
import { Button, EmptyCard, Wrap } from "@/components/primitives";
import { Container, PageTitle } from "@/components/ds";
import { TeamsNav } from "@/components/team/teams-nav";

export const metadata: Metadata = { title: "Поиск команды" };

type Tab = "players" | "teams";

export default async function FindPage(props: PageProps<"/find">) {
  const sp = await props.searchParams;
  const tab: Tab = sp.tab === "teams" ? "teams" : "players";
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  const role = str(sp.role);
  const mode = str(sp.mode);
  const lvl = (v: string) => (/^(10|[1-9])$/.test(v) ? Number(v) : undefined);
  const faceitMin = lvl(str(sp.min));
  const faceitMax = lvl(str(sp.max));

  const player = await getCurrentPlayer();
  const membership = player ? await getActiveMembership(player.id) : null;
  const isCaptain = !!membership && membership.team.captain_id === player?.id;

  const [posts, ownPlayerPost, ownTeamPost] = await Promise.all([
    listFinderPosts(tab === "players" ? "player" : "team", { role, mode, faceitMin, faceitMax }),
    player && tab === "players" && !membership ? getOwnPost("player", player.id) : Promise.resolve(null),
    isCaptain && tab === "teams" ? getOwnPost("team", membership!.team.id) : Promise.resolve(null),
  ]);

  const base = (t: Tab) => `/find${t === "teams" ? "?tab=teams" : ""}`;
  const filtered = !!(role || mode || faceitMin || faceitMax);

  // кому какая форма: игрок без команды — «ищу команду», капитан — «ищем игрока»
  const form =
    tab === "players" ? (
      !player ? null : membership ? null : <PostForm kind="player" post={ownPlayerPost} />
    ) : isCaptain && !membership!.team.is_solo ? (
      <PostForm kind="team" post={ownTeamPost} />
    ) : null;

  return (
    <>
      <Container className="pt-8 sm:pt-10">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>Поиск команды</PageTitle>
            <p className="mt-1 max-w-read text-meta text-fg-3">
              Игроки ищут команду, команды — игроков. Объявление живёт 14 дней, отклик и приглашение приходят уведомлением.
            </p>
          </div>
          {!player && (
            <Button href={`/login?next=${encodeURIComponent(base(tab))}`} size="md">
              Войти, чтобы разместить объявление
            </Button>
          )}
        </header>
        <div className="mt-6">
          <TeamsNav />
        </div>
      </Container>
      <Wrap className="pt-8">
        <Tabs
          active={tab}
          items={[
            { key: "players", label: "Ищут команду", href: base("players") },
            { key: "teams", label: "Ищут игрока", href: base("teams") },
          ]}
        />

        <div className="mt-8 grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
          <div className="min-w-0">
            {/* фильтры: обычная GET-форма, работает без JS */}
            <form className="mb-6 flex flex-wrap items-end gap-3" action="/find">
              {tab === "teams" && <input type="hidden" name="tab" value="teams" />}
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-fg-3">Роль</span>
                <select name="role" defaultValue={role || "all"} className="field h-10 w-[150px]">
                  <option value="all">Любая</option>
                  {FINDER_ROLES.filter((r) => r.key !== "any").map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-fg-3">Режим</span>
                <select name="mode" defaultValue={mode || "all"} className="field h-10 w-[120px]">
                  <option value="all">Все</option>
                  {FINDER_MODES.map((m) => (
                    <option key={m} value={m}>
                      {m === "2v2" ? "2×2" : "5×5"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-fg-3">FACEIT от</span>
                <select name="min" defaultValue={faceitMin ? String(faceitMin) : ""} className="field h-10 w-[100px]">
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="mb-1.5 block text-[11px] uppercase tracking-[0.2em] text-fg-3">до</span>
                <select name="max" defaultValue={faceitMax ? String(faceitMax) : ""} className="field h-10 w-[100px]">
                  <option value="">—</option>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              <button type="submit" className="h-10 rounded-[8px] border border-white/[0.14] px-4 text-[14px] font-semibold text-fg hover:border-white/30">
                Показать
              </button>
              {filtered && (
                <Link href={base(tab)} className="inline-flex h-10 items-center px-2 text-[13px] text-fg-3 hover:text-fg">
                  Сбросить
                </Link>
              )}
            </form>

            {posts.length === 0 ? (
              <EmptyCard
                dashed
                title={filtered ? "Ничего не найдено" : tab === "players" ? "Пока никто не ищет команду" : "Пока ни одна команда не ищет игроков"}
                text={
                  filtered
                    ? "Попробуйте снять часть фильтров."
                    : tab === "players"
                      ? "Разместите объявление первым — капитаны увидят ваш уровень FACEIT."
                      : "Капитаны могут разместить объявление на этой вкладке."
                }
              />
            ) : (
              <div className="grid gap-4 md:grid-cols-2">
                {posts.map((p) =>
                  tab === "players" ? (
                    <PlayerPostCard key={p.id} post={p} own={p.player_id === player?.id} canInvite={isCaptain && !membership!.team.is_solo} />
                  ) : (
                    <TeamPostCard key={p.id} post={p} own={!!membership && membership.team.id === p.team_id} canRespond={!!player && !player.is_banned} />
                  ),
                )}
              </div>
            )}
          </div>

          <aside className="lg:sticky lg:top-[calc(var(--shell-h)+24px)]">
            {form ?? (
              <EmptyCard
                title={tab === "players" ? (player ? "Вы уже в команде" : "Ищете команду?") : isCaptain ? "Команда не подходит" : "Ищете игроков?"}
                text={
                  tab === "players"
                    ? player
                      ? "Объявление «ищу команду» доступно игрокам без команды. Капитаны могут пригласить игрока из списка."
                      : "Войдите через Steam и разместите объявление."
                    : "Объявление от команды публикует капитан. Игроки могут откликнуться на объявления в списке."
                }
                action={
                  tab === "players" && membership && isCaptain ? (
                    <Button href={base("teams")} variant="secondary" size="md">
                      Разместить объявление команды
                    </Button>
                  ) : undefined
                }
              />
            )}
          </aside>
        </div>
      </Wrap>
    </>
  );
}
