import type { Metadata } from "next";
import Link from "next/link";
import { LiveRefresh } from "@/components/live-refresh";
import { db } from "@/lib/supabase";
import { requireAdmin } from "@/lib/auth";
import { getServerState } from "@/lib/server-control";
import { tournamentEta } from "@/lib/schedule";
import { formatTime, mapName } from "@/lib/format";
import type { MatchWithTeams } from "@/lib/matches";
import { MatchStatusBadge, matchStage } from "@/components/match-bits";
import { ADMIN_CARD, AdminHeader, Metric, Panel, TableBox } from "@/components/admin/control";
import { instanceState, minutesSince, serverNow, toneBar, toneText } from "@/components/admin/kit";
import { humanPlayers } from "@/components/admin/instance-card";
import { EmptyState, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Табло турнира — F16 Control" };

// Табло дня турнира: что идёт на каждом сервере, кто ждёт сервер, сколько сыграно по раундам и когда конец.
// Один экран для судьи, когда параллельно идут 5–7 матчей.

const NO_SHOW_MIN = 15;

type BoardMatch = MatchWithTeams & { maps: { map_number: number; map_name: string; status: string; team1_score: number; team2_score: number }[] };

export default async function AdminBoardPage(props: PageProps<"/admin/board">) {
  await requireAdmin("/admin/board");
  const sp = await props.searchParams;
  const { data: list } = await db()
    .from("tournaments")
    .select("id, name, status, starts_at, format")
    .in("status", ["live", "checkin", "registration"])
    .order("starts_at");
  // по умолчанию — идущий, затем check-in, затем ближайший по дате
  const rank = { live: 0, checkin: 1, registration: 2 } as Record<string, number>;
  const tournaments = [...(list ?? [])].sort((a, b) => rank[a.status] - rank[b.status]);
  const t = tournaments.find((x) => x.id === sp.t) ?? tournaments[0];

  if (!t) {
    return (
      <div className="space-y-6">
        <AdminHeader title="Табло турнира" />
        <EmptyState compact title="Нет идущих турниров" description="Табло показывает турнир в статусе «идёт», check-in или с открытой регистрацией." />
      </div>
    );
  }

  const [{ data: ms }, servers, eta, { data: lobbyGames }] = await Promise.all([
    db()
      .from("matches")
      .select("*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), maps:match_maps(map_number, map_name, status, team1_score, team2_score)")
      .eq("tournament_id", t.id)
      .neq("status", "cancelled")
      .order("number"),
    getServerState(),
    tournamentEta(t.id),
    db().from("lobby_games").select("server_instance").not("server_instance", "is", null).in("status", ["waiting", "live"]),
  ]);
  const matches = (ms ?? []) as unknown as BoardMatch[];
  const now = serverNow();
  const onServer = new Map(matches.filter((m) => m.server_instance && ["ready", "live"].includes(m.status)).map((m) => [m.server_instance!, m]));
  const lobbyOn = new Set((lobbyGames ?? []).map((g) => g.server_instance));

  const live = matches.filter((m) => m.status === "live");
  const waitingPlayers = matches.filter((m) => m.status === "ready" && m.server_state === "ready");
  const noShow = waitingPlayers.filter((m) => (minutesSince(m.server_ready_at, now) ?? 0) >= NO_SHOW_MIN);
  const needServer = matches.filter((m) => m.status === "ready" && (!m.server_instance || m.server_state === "error"));
  const inVeto = matches.filter((m) => m.status === "veto");
  const real = matches.filter((m) => !m.is_walkover);
  const finished = real.filter((m) => m.status === "finished");
  const freeServers = servers.instances.filter((i) => i.running && !onServer.has(i.name) && !lobbyOn.has(i.name) && (i.gamestate ?? "none") === "none");

  // прогресс по стадиям сетки
  const stages = new Map<string, { total: number; done: number; order: number }>();
  for (const m of real) {
    const label = matchStage(m, matches);
    const s = stages.get(label) ?? { total: 0, done: 0, order: (m.bracket === "third_place" ? 0.5 : 0) + m.round * 10 + (m.bracket === "grand_final" ? 1000 : 0) };
    s.total++;
    if (m.status === "finished") s.done++;
    stages.set(label, s);
  }
  const stageList = [...stages.entries()].sort((a, b) => a[1].order - b[1].order);

  // очередь: ещё не на сервере
  const order = { ready: 0, veto: 1, upcoming: 2, pending: 3 } as Record<string, number>;
  const queue = matches
    .filter((m) => ["veto", "upcoming", "pending"].includes(m.status) || (m.status === "ready" && (!m.server_instance || m.server_state === "error")))
    .sort((a, b) => order[a.status] - order[b.status] || a.round - b.round || a.number - b.number);

  return (
    <div className="space-y-8">
      <LiveRefresh watch="servers" intervalMs={4000} />
      <LiveRefresh watch="matches" intervalMs={4000} />
      <AdminHeader
        title="Табло турнира"
        description={
          <>
            {t.name} · начало {formatTime(t.starts_at)}
            {eta?.finishAt ? ` · окончание ≈ ${formatTime(new Date(eta.finishAt).toISOString())}` : ""}
            {eta ? ` · карта в среднем ${eta.mapMinutes} мин` : ""}
          </>
        }
        actions={
          tournaments.length > 1 ? (
            <div className="flex flex-wrap gap-3 text-[13px]">
              {tournaments.map((x) => (
                <Link key={x.id} href={`/admin/board?t=${x.id}`} className={cn(x.id === t.id ? "text-fg font-medium" : "text-fg-3 hover:text-fg-2")}>
                  {x.name}
                </Link>
              ))}
            </div>
          ) : (
            <Link href={`/admin/tournaments/${t.id}`} className="text-[13px] text-fg-3 hover:text-accent">
              Пульт турнира →
            </Link>
          )
        }
      />

      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-6">
        <Metric label="Идут" value={live.length} tone={live.length ? "danger" : undefined} />
        <Metric label="Ждут игроков" value={waitingPlayers.length} tone={noShow.length ? "danger" : waitingPlayers.length ? "warn" : undefined} hint={noShow.length ? `неявка: ${noShow.length}` : undefined} />
        <Metric label="Ждут сервер" value={needServer.length} tone={needServer.length && !freeServers.length ? "warn" : undefined} />
        <Metric label="Вето" value={inVeto.length} />
        <Metric label="Свободно серверов" value={servers.online ? freeServers.length : "—"} tone={servers.online ? undefined : "danger"} hint={servers.online ? undefined : "агент не на связи"} />
        <Metric label="Сыграно" value={`${finished.length} / ${real.length}`} />
      </div>

      <Panel title="Серверы">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {servers.instances.map((i) => {
            const m = onServer.get(i.name);
            const st = instanceState(i, servers.online);
            const cur = m ? [...m.maps].sort((a, b) => a.map_number - b.map_number).find((x) => x.status === "live") ?? null : null;
            const waited = m && m.status === "ready" && m.server_state === "ready" ? minutesSince(m.server_ready_at, now) : null;
            const playing = m?.status === "live" ? minutesSince(m.started_at, now) : null;
            return (
              <div key={i.name} className={cn(ADMIN_CARD, "relative overflow-hidden px-5 py-4")}>
                <span className={cn("absolute left-0 inset-y-0 w-[3px]", m ? (m.status === "live" ? "bg-danger" : "bg-warn") : toneBar[st.tone])} />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="num text-[15px] font-semibold">{i.name}</span>
                  <span className={cn("text-[12px]", m ? "text-fg-3" : toneText[st.tone])}>
                    {m ? `${humanPlayers(i) ?? 0} игроков` : lobbyOn.has(i.name) ? "игра лобби" : i.running && (i.gamestate ?? "none") === "none" ? "свободен" : st.text}
                  </span>
                </div>
                {m ? (
                  <Link href={`/admin/matches/${m.id}`} className="mt-2 block hover:text-accent">
                    <div className="truncate text-[14px] font-medium">
                      #{m.number} {m.team1?.tag ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.tag ?? "TBD"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[12px] text-fg-3">
                      <span>{matchStage(m, matches)}</span>
                      {m.best_of > 1 && <span className="num">серия {m.team1_score}:{m.team2_score}</span>}
                      {cur && (
                        <span className="num text-fg-2">
                          {mapName(cur.map_name)} {cur.team1_score}:{cur.team2_score}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[12px]">
                      {m.server_state === "loading" ? (
                        <span className="text-warn">грузится карта…</span>
                      ) : waited != null ? (
                        <span className={waited >= NO_SHOW_MIN ? "font-semibold text-danger" : waited >= 10 ? "text-warn" : "text-fg-3"}>
                          ждём игроков {waited} мин{waited >= NO_SHOW_MIN ? " — неявка?" : ""}
                        </span>
                      ) : playing != null ? (
                        <span className="text-fg-3">идёт {playing} мин</span>
                      ) : null}
                    </div>
                  </Link>
                ) : (
                  <div className="mt-2 text-[12px] text-fg-4">{i.for_lobby ? "отдан лобби · авто" : "для турнира · авто"}</div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {stageList.length > 0 && (
        <Panel title="Стадии">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {stageList.map(([label, s]) => (
              <div key={label} className="min-w-[120px]">
                <div className="text-[12px] text-fg-3">{label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/[0.06]">
                    <div className={cn("h-full rounded-full", s.done === s.total ? "bg-ok" : "bg-accent")} style={{ width: `${(s.done / s.total) * 100}%` }} />
                  </div>
                  <span className="num text-[13px]">
                    {s.done}/{s.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Очередь">
        {queue.length === 0 ? (
          <EmptyState compact title="Очередь пуста" description={matches.length ? "Все матчи на серверах или сыграны." : "Сетка ещё не создана."} />
        ) : (
          <TableBox minWidth={720} maxHeight={560}>
            <thead>
              <tr>
                <th>#</th>
                <th>Стадия</th>
                <th>Команды</th>
                <th>Статус</th>
                <th>Формат</th>
                <th>Начало ≈</th>
              </tr>
            </thead>
            <tbody>
              {queue.map((m) => {
                const start = eta?.matchStart.get(m.id);
                return (
                  <tr key={m.id}>
                    <td className="num text-fg-3">{m.number}</td>
                    <td className="text-fg-3">{matchStage(m, matches)}</td>
                    <td>
                      <Link href={`/admin/matches/${m.id}`} className="font-medium text-fg hover:text-accent">
                        {m.team1?.name ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.name ?? "TBD"}
                      </Link>
                    </td>
                    <td>
                      {m.status === "ready" ? (
                        <span className={cn("text-[12px] font-medium", m.server_state === "error" ? "text-danger" : "text-warn")}>
                          {m.server_state === "error" ? "ошибка сервера" : "ждёт сервер"}
                        </span>
                      ) : (
                        <MatchStatusBadge status={m.status} />
                      )}
                    </td>
                    <td className="num">BO{m.best_of}</td>
                    <td className="num">{m.status === "ready" || m.status === "veto" ? "сейчас" : start ? formatTime(new Date(start).toISOString()) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </TableBox>
        )}
      </Panel>
    </div>
  );
}
