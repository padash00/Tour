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
import { humanPlayers, plainState } from "@/components/admin/instance-card";
import { buttonClass } from "@/components/ds";
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
        <AdminHeader title="Табло турнира" description="Один экран на день турнира: что идёт на каждом сервере и что дальше." />
        <EmptyState compact title="Сейчас нет идущих турниров" description="Табло показывает турнир, который идёт, на отметке участников или с открытой регистрацией." />
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
            {t.name} · начало в {formatTime(t.starts_at)}
            {eta?.finishAt ? ` · закончится примерно в ${formatTime(new Date(eta.finishAt).toISOString())}` : ""}
            {eta ? ` · одна карта в среднем ${eta.mapMinutes} мин` : ""}
          </>
        }
        actions={
          tournaments.length > 1 ? (
            <div className="flex flex-wrap gap-2">
              {tournaments.map((x) => (
                <Link key={x.id} href={`/admin/board?t=${x.id}`} className={buttonClass(x.id === t.id ? "primary" : "secondary", "sm", "sm:h-10")}>
                  {x.name}
                </Link>
              ))}
            </div>
          ) : (
            <Link href={`/admin/tournaments/${t.id}`} className={buttonClass("secondary", "md")}>
              Открыть турнир →
            </Link>
          )
        }
      />

      <div className={cn(ADMIN_CARD, "grid grid-cols-2 gap-x-6 gap-y-6 p-6 sm:grid-cols-3 lg:grid-cols-6")}>
        <Metric label="Идут сейчас" value={live.length} tone={live.length ? "danger" : undefined} />
        <Metric label="Ждут игроков" value={waitingPlayers.length} tone={noShow.length ? "danger" : waitingPlayers.length ? "warn" : undefined} hint={noShow.length ? `не пришли: ${noShow.length}` : undefined} />
        <Metric label="Ждут сервер" value={needServer.length} tone={needServer.length && !freeServers.length ? "warn" : undefined} />
        <Metric label="Выбирают карты" value={inVeto.length} />
        <Metric label="Серверов свободно" value={servers.online ? freeServers.length : "—"} tone={servers.online ? undefined : "danger"} hint={servers.online ? undefined : "серверный ПК не на связи"} />
        <Metric label="Сыграно" value={`${finished.length} / ${real.length}`} />
      </div>

      <Panel title="Что сейчас на серверах">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {servers.instances.map((i) => {
            const m = onServer.get(i.name);
            const st = instanceState(i, servers.online);
            const cur = m ? [...m.maps].sort((a, b) => a.map_number - b.map_number).find((x) => x.status === "live") ?? null : null;
            const waited = m && m.status === "ready" && m.server_state === "ready" ? minutesSince(m.server_ready_at, now) : null;
            const playing = m?.status === "live" ? minutesSince(m.started_at, now) : null;
            return (
              <div key={i.name} className={cn(ADMIN_CARD, "relative overflow-hidden px-6 py-5")}>
                <span className={cn("absolute left-0 inset-y-0 w-1", m ? (m.status === "live" ? "bg-danger" : "bg-warn") : toneBar[st.tone])} />
                <div className="flex items-baseline justify-between gap-3">
                  <span className="num text-[18px] font-bold">{i.name}</span>
                  <span className={cn("text-[14px] font-medium", m ? "text-fg-3" : toneText[st.tone])}>
                    {m ? `игроков: ${humanPlayers(i) ?? 0}` : lobbyOn.has(i.name) ? "идёт игра лобби" : i.running && (i.gamestate ?? "none") === "none" ? "свободен" : plainState(st.text)}
                  </span>
                </div>
                {m ? (
                  <Link href={`/admin/matches/${m.id}`} className="mt-2 block hover:text-accent">
                    <div className="truncate text-[17px] font-bold">
                      №{m.number} {m.team1?.tag ?? "TBD"} <span className="font-normal text-fg-3">против</span> {m.team2?.tag ?? "TBD"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[14px] text-fg-3">
                      <span>{matchStage(m, matches)}</span>
                      {m.best_of > 1 && <span className="num">серия {m.team1_score}:{m.team2_score}</span>}
                      {cur && (
                        <span className="num text-fg-2">
                          {mapName(cur.map_name)} {cur.team1_score}:{cur.team2_score}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 text-[14px]">
                      {m.server_state === "loading" ? (
                        <span className="font-medium text-warn">Загружается карта…</span>
                      ) : waited != null ? (
                        <span className={waited >= NO_SHOW_MIN ? "font-semibold text-danger" : waited >= 10 ? "text-warn" : "text-fg-3"}>
                          Ждём игроков {waited} мин{waited >= NO_SHOW_MIN ? " — похоже, не пришли" : ""}
                        </span>
                      ) : playing != null ? (
                        <span className="text-fg-3">Играют уже {playing} мин</span>
                      ) : null}
                    </div>
                  </Link>
                ) : (
                  <div className="mt-2 text-[14px] text-fg-3">{i.for_lobby ? "Сейчас отдан под лобби" : "Сейчас для турнира"} (переключается само)</div>
                )}
              </div>
            );
          })}
        </div>
      </Panel>

      {stageList.length > 0 && (
        <Panel title="Сколько матчей сыграно по этапам">
          <div className="flex flex-wrap gap-x-8 gap-y-3">
            {stageList.map(([label, s]) => (
              <div key={label} className="min-w-[120px]">
                <div className="text-[14px] font-medium text-fg-2">{label}</div>
                <div className="mt-1 flex items-center gap-2">
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-ink/[0.06]">
                    <div className={cn("h-full rounded-full", s.done === s.total ? "bg-ok" : "bg-accent")} style={{ width: `${(s.done / s.total) * 100}%` }} />
                  </div>
                  <span className="num text-[15px] font-semibold">
                    {s.done}/{s.total}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Panel>
      )}

      <Panel title="Очередь матчей">
        {queue.length === 0 ? (
          <EmptyState compact title="Очередь пуста" description={matches.length ? "Все матчи на серверах или сыграны." : "Сетка ещё не создана."} />
        ) : (
          <TableBox minWidth={720} maxHeight={560}>
            <thead>
              <tr>
                <th>№</th>
                <th>Этап</th>
                <th>Команды</th>
                <th>Статус</th>
                <th>Формат</th>
                <th>Начнётся примерно</th>
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
                        {m.team1?.name ?? "TBD"} <span className="font-normal text-fg-3">против</span> {m.team2?.name ?? "TBD"}
                      </Link>
                    </td>
                    <td>
                      {m.status === "ready" ? (
                        <span className={cn("text-[14px] font-semibold", m.server_state === "error" ? "text-danger" : "text-warn")}>
                          {m.server_state === "error" ? "Сервер не запустился" : "Ждёт свободный сервер"}
                        </span>
                      ) : (
                        <MatchStatusBadge status={m.status} />
                      )}
                    </td>
                    <td className="num">BO{m.best_of}</td>
                    <td className="num">{m.status === "ready" || m.status === "veto" ? "уже сейчас" : start ? formatTime(new Date(start).toISOString()) : "—"}</td>
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
