import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";
import { formatDateTime, formatShortDateTime } from "@/lib/format";
import type { AuditLog, Player, Tournament } from "@/lib/types";
import type { MatchWithTeams } from "@/lib/matches";
import { BarCell, CARD, Label, StatusChip } from "@/components/admin/tournament-kit";
import { ButtonLink, EmptyState } from "@/components/ui";
import { AdminHeader, AlertRow, Dot, Panel } from "@/components/admin/control";
import { getServerState } from "@/lib/server-control";

export const metadata: Metadata = { title: "F16 Control" };

export default async function AdminOverview() {
  const [players, teams, pendingRes, tournamentsRes, logsRes, liveRes] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }),
    db().from("teams").select("id", { count: "exact", head: true }).is("disbanded_at", null),
    db()
      .from("tournament_registrations")
      .select("id, tournament:tournaments(id, name)")
      .eq("status", "pending"),
    db().from("tournaments").select("*").not("status", "in", "(finished,cancelled)").order("starts_at"),
    db().from("audit_logs").select("*, actor:players(nickname)").order("created_at", { ascending: false }).limit(10),
    db()
      .from("matches")
      .select("*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*)")
      .in("status", ["live", "veto", "ready"])
      .order("number"),
  ]);
  const servers = await getServerState();
  const { data: openDisputes } = await db()
    .from("disputes")
    .select("id, match:matches(id, number)")
    .eq("status", "open");
  const { data: waitingRows } = await db()
    .from("matches")
    .select("id, number, server_ready_at, server_state")
    .eq("status", "ready")
    .not("server_instance", "is", null);
  const now = serverNow();
  const waiting = (waitingRows ?? []).filter(
    (m) => m.server_state === "error" || (m.server_ready_at && now - new Date(m.server_ready_at).getTime() > 10 * 60_000),
  );
  const serverErrors = waiting.filter((m) => m.server_state === "error");
  const noShow = waiting.filter((m) => m.server_state !== "error");
  const disputes = (openDisputes ?? []) as unknown as { id: string; match: { id: string; number: number } }[];
  const pending = (pendingRes.data ?? []) as unknown as { id: string; tournament: { id: string; name: string } }[];
  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const logs = (logsRes.data ?? []) as (AuditLog & { actor: Pick<Player, "nickname"> | null })[];
  const active = (liveRes.data ?? []) as MatchWithTeams[];
  const live = active.filter((m) => m.status === "live");

  const current = tournaments.find((t) => t.status === "live") ?? tournaments[0] ?? null;
  const running = servers.instances.filter((s) => s.running);
  const busy = running.filter((s) => (s.gamestate ?? "none") !== "none");
  const disputeMatches = [...new Map(disputes.map((d) => [d.match.id, d.match])).values()];
  const pendingTournaments = [...new Map(pending.map((p) => [p.tournament.id, p.tournament])).values()];

  return (
    <div className="space-y-8">
      <AdminHeader
        eyebrow="F16 Control"
        title="Операции турнира"
        description={`${players.count ?? 0} игроков · ${teams.count ?? 0} команд`}
        actions={<ButtonLink href="/admin/tournaments/new" size="sm" className="rounded-[8px]">Новый турнир</ButtonLink>}
      />

      {/* сигналы по приоритету: агент → ошибка сервера → неявка → споры → заявки */}
      {(!servers.online || serverErrors.length > 0 || noShow.length > 0 || disputeMatches.length > 0 || pendingTournaments.length > 0) && (
        <div className="space-y-2">
          {!servers.online && (
            <AlertRow tone="danger" title="Агент не на связи" action={{ href: "/admin/servers", label: "Серверы" }}>
              Серверы не управляются: матчи не загрузятся, пока серверный ПК не выйдет на связь.
            </AlertRow>
          )}
          {serverErrors.length > 0 && (
            <AlertRow
              tone="danger"
              title={`Ошибка сервера: ${serverErrors.length}`}
              action={{ href: `/admin/matches/${serverErrors[0].id}`, label: "Перенести" }}
            >
              {serverErrors.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/matches/${m.id}`} className="text-accent hover:underline">
                    #{m.number}
                  </Link>
                </span>
              ))}{" "}
              — карта не загрузилась
            </AlertRow>
          )}
          {noShow.length > 0 && (
            <AlertRow tone="warn" title="Матчи стоят" action={{ href: `/admin/matches/${noShow[0].id}`, label: "Открыть" }}>
              {noShow.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/matches/${m.id}`} className="text-accent hover:underline">
                    #{m.number}
                  </Link>{" "}
                  — игроки не подключились {Math.floor((now - new Date(m.server_ready_at!).getTime()) / 60000)} мин
                </span>
              ))}
            </AlertRow>
          )}
          {disputeMatches.length > 0 && (
            <AlertRow tone="warn" title={`Споры: ${disputes.length}`} action={{ href: `/admin/matches/${disputeMatches[0].id}`, label: "Разобрать" }}>
              {disputeMatches.map((m, i) => (
                <span key={m.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/matches/${m.id}`} className="text-accent hover:underline">
                    матч #{m.number}
                  </Link>
                </span>
              ))}
            </AlertRow>
          )}
          {pendingTournaments.length > 0 && (
            <AlertRow
              tone="accent"
              title={`Заявки ждут: ${pending.length}`}
              action={{ href: `/admin/tournaments/${pendingTournaments[0].id}?tab=registration`, label: "Рассмотреть" }}
            >
              {pendingTournaments.map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/tournaments/${t.id}?tab=registration`} className="text-accent hover:underline">
                    {t.name}
                  </Link>
                </span>
              ))}
            </AlertRow>
          )}
        </div>
      )}

      {/* операционная полоса: турнир и ключевые счётчики в одной строке */}
      <div className={`${CARD} overflow-hidden`}>
        <div className="grid grid-cols-2 lg:grid-cols-[1.8fr_1fr_1fr_1fr_1fr] divide-y lg:divide-y-0 lg:divide-x divide-white/[0.06]">
          <div className="col-span-2 lg:col-span-1 p-5 min-w-0 bg-[linear-gradient(110deg,rgba(138,184,255,0.06),transparent_60%)]">
            <Label className="text-[10px]">Текущий турнир</Label>
            {current ? (
              <>
                <Link
                  href={`/admin/tournaments/${current.id}`}
                  className="mt-2 block text-[20px] font-semibold tracking-[-0.015em] truncate hover:text-accent"
                >
                  {current.name}
                </Link>
                <div className="mt-2 flex items-center gap-3 text-[12px] text-fg-3">
                  <StatusChip status={current.status} />
                  <span className="num">{formatDateTime(current.starts_at)}</span>
                </div>
              </>
            ) : (
              <div className="mt-2 text-[14px] text-fg-3">
                Нет активного турнира ·{" "}
                <Link href="/admin/tournaments/new" className="text-accent hover:underline">
                  создать
                </Link>
              </div>
            )}
          </div>
          <BarCell label="Live" value={live.length} tone={live.length ? "danger" : undefined} hint={`${active.length} в работе`} />
          <BarCell
            label="Серверы"
            value={servers.online ? `${running.length}/${servers.instances.length}` : "—"}
            tone={servers.online ? "ok" : "danger"}
            hint={servers.online ? `${busy.length} заняты` : "агент офлайн"}
          />
          <BarCell label="Заявки" value={pending.length} tone={pending.length ? "warn" : undefined} hint="на рассмотрении" />
          <BarCell label="Споры" value={disputes.length} tone={disputes.length ? "warn" : undefined} hint="открыто" />
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-8">
        <div className="space-y-8 min-w-0">
          <Panel title="Матчи в работе" action={<Link href="/admin/matches" className="text-[12px] text-fg-3 hover:text-fg">Все матчи →</Link>}>
            {active.length === 0 ? (
              <EmptyState compact title="Сейчас матчей нет" description="Здесь появятся матчи в вето, ожидании и live." />
            ) : (
              <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
                {active.map((m) => (
                  <Link
                    key={m.id}
                    href={`/admin/matches/${m.id}`}
                    className={`relative flex items-center gap-4 px-4 h-11 text-[13px] hover:bg-white/[0.03] ${m.status === "live" ? "bg-danger/[0.04] before:absolute before:left-0 before:inset-y-2 before:w-[2px] before:rounded-full before:bg-danger" : ""}`}
                  >
                    <span className="num text-fg-3 w-8">#{m.number}</span>
                    <span className="flex-1 min-w-0 truncate font-medium">
                      {m.team1?.name ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.name ?? "TBD"}
                    </span>
                    {m.status === "live" && (
                      <span className="num text-fg">
                        {m.team1_score}:{m.team2_score}
                      </span>
                    )}
                    <span className="num text-[12px] text-fg-3 w-16 hidden sm:block">{m.server_instance ?? "—"}</span>
                    <span className="w-16 text-right">
                      <span className={`text-[12px] ${m.status === "live" ? "text-danger" : m.status === "veto" ? "text-warn" : "text-ok"}`}>
                        {m.status === "live" ? "LIVE" : m.status === "veto" ? "Вето" : "Готов"}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Активные турниры" action={<Link href="/admin/tournaments" className="text-[12px] text-fg-3 hover:text-fg">Все турниры →</Link>}>
            {tournaments.length === 0 ? (
              <EmptyState
                compact
                title="Активных турниров нет"
                action={<ButtonLink href="/admin/tournaments/new" variant="secondary" size="sm">Создать турнир</ButtonLink>}
              />
            ) : (
              <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
                {tournaments.map((t) => (
                  <Link key={t.id} href={`/admin/tournaments/${t.id}`} className="flex items-center gap-4 px-4 h-11 text-[13px] hover:bg-white/[0.03]">
                    <span className="flex-1 min-w-0 truncate font-medium">{t.name}</span>
                    <span className="text-[12px] text-fg-3 hidden sm:block">{formatShortDateTime(t.starts_at)}</span>
                    <StatusChip status={t.status} />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
        </div>

        <div className="space-y-8 min-w-0">
          <Panel title="Серверы" action={<Link href="/admin/servers" className="text-[12px] text-fg-3 hover:text-fg">Управление →</Link>}>
            <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
              {servers.instances.map((s) => {
                const state = !servers.online
                  ? { t: "агент офлайн", tone: "muted" as const }
                  : !s.running
                    ? { t: s.role === "reserve" ? "резерв" : "выключен", tone: "muted" as const }
                    : (s.gamestate ?? "none") === "none"
                      ? { t: "свободен", tone: "ok" as const }
                      : { t: s.gamestate ?? "", tone: "danger" as const };
                return (
                  <div key={s.name} className="flex items-center gap-3 px-4 h-11 text-[13px]">
                    <Dot tone={state.tone} />
                    <span className="num font-medium w-16">{s.name}</span>
                    <span className="flex-1 text-fg-3 truncate">{s.map ?? ""}</span>
                    <span className="num text-[12px] text-fg-3">{s.running && s.players != null ? `${s.players} игр.` : ""}</span>
                    <span className="text-[12px] text-fg-2 w-24 text-right">{state.t}</span>
                  </div>
                );
              })}
            </div>
          </Panel>

          <Panel title="Последние действия" action={<Link href="/admin/logs" className="text-[12px] text-fg-3 hover:text-fg">Журнал →</Link>}>
            {logs.length === 0 ? (
              <EmptyState compact title="Журнал пуст" />
            ) : (
              <div className="rounded-[12px] border border-white/[0.08] bg-[#05080d] px-4 py-3 font-mono text-[12px] leading-6">
                {logs.map((l) => (
                  <div key={l.id} className="flex gap-3 min-w-0">
                    <span className="text-fg-3 shrink-0">{formatShortDateTime(l.created_at)}</span>
                    <span className="text-fg-2 shrink-0 w-24 truncate">{l.actor?.nickname ?? "system"}</span>
                    <span className="text-fg truncate">{l.action}</span>
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}

/** Время запроса (серверный компонент рендерится один раз на запрос) */
function serverNow() {
  return Date.now();
}
