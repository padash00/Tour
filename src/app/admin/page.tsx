import type { Metadata } from "next";
import { ChatBox } from "@/components/admin/chat-box";
import Link from "next/link";
import { startVeto } from "@/app/actions/admin-match";
import { sendMatchToServer } from "@/app/actions/admin-server";
import { db } from "@/lib/supabase";
import { formatShortDateTime, formatTime } from "@/lib/format";
import type { AuditLog, Player, Tournament } from "@/lib/types";
import type { MatchWithTeams } from "@/lib/matches";
import { getServerState } from "@/lib/server-control";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/components/ui";
import { ButtonLink } from "@/components/ui";
import { MatchStatusChip, TournamentStatusChip } from "@/components/primitives";
import { ADMIN_CARD, AdminHeader, AlertRow } from "@/components/admin/control";
import { InstanceCard, ServerStatus, type InstanceMatch } from "@/components/admin/instance-card";
import { ServerActions } from "@/components/admin/server-actions";
import { Quiet, Section, SectionLink, Strip, StripCell, instanceState, minutesSince, serverNow } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";
import { getCs2UpdateCheck } from "@/lib/server/ops";
import { OpsAlerts, opsAlertCount, type OpsInfo } from "@/components/admin/ops-alerts";

export const metadata: Metadata = { title: "F16 Control" };

type QueueMatch = MatchWithTeams & { tournament: Pick<Tournament, "name" | "status"> | null };

export default async function AdminOverview() {
  await requireAdmin(); // права проверяются в каждой странице, не только в layout
  const [players, teams, pendingRes, tournamentsRes, logsRes, activeRes, queueRes, disputesRes] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }),
    db().from("teams").select("id", { count: "exact", head: true }).is("disbanded_at", null),
    db().from("tournament_registrations").select("id, tournament:tournaments(id, name)").eq("status", "pending"),
    db().from("tournaments").select("*").not("status", "in", "(finished,cancelled)").order("starts_at"),
    db().from("audit_logs").select("*, actor:players(nickname)").order("created_at", { ascending: false }).limit(14),
    db()
      .from("matches")
      .select(
        "id, number, status, server_instance, server_state, server_ready_at, team1_score, team2_score, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag), maps:match_maps(map_number, map_name, status, team1_score, team2_score)",
      )
      .in("status", ["live", "veto", "ready"]),
    db()
      .from("matches")
      .select("*, team1:teams!matches_team1_id_fkey(*), team2:teams!matches_team2_id_fkey(*), tournament:tournaments(name, status)")
      .in("status", ["upcoming", "ready"])
      .is("server_instance", null)
      .not("team1_id", "is", null)
      .not("team2_id", "is", null)
      .order("round")
      .order("number")
      .limit(10),
    db().from("disputes").select("id, match:matches(id, number)").eq("status", "open"),
  ]);
  const [servers, cs2Check] = await Promise.all([getServerState(), getCs2UpdateCheck()]);
  const opsInfo = (servers.host?.info ?? {}) as OpsInfo;
  const opsCount = servers.online ? opsAlertCount(opsInfo, cs2Check) : 0;
  const now = serverNow();

  const active: (InstanceMatch & { server_instance: string | null })[] = activeRes.data ?? [];
  const live = active.filter((m) => m.status === "live");
  const onServers = active.filter((m) => m.server_instance);
  const byInstance = new Map(onServers.map((m) => [m.server_instance as string, m] as const));
  const ready = active.filter((m) => m.status === "ready" && m.server_state === "ready");
  const serverErrors = active.filter((m) => m.status === "ready" && m.server_state === "error");
  const noShow = ready.filter((m) => (minutesSince(m.server_ready_at, now) ?? 0) >= 10);

  const disputes = disputesRes.data ?? [];
  const disputeMatches = [...new Map(disputes.map((d) => [d.match.id, d.match])).values()];
  const pending = pendingRes.data ?? [];
  const pendingTournaments = [...new Map(pending.map((p) => [p.tournament.id, p.tournament])).values()];
  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const current = tournaments.find((t) => t.status === "live") ?? tournaments.find((t) => t.status === "checkin") ?? tournaments[0] ?? null;
  const queue = ((queueRes.data ?? []) as QueueMatch[]).filter((m) => !["finished", "cancelled"].includes(m.tournament?.status ?? ""));
  const logs = (logsRes.data ?? []) as (AuditLog & { actor: Pick<Player, "nickname"> | null })[];

  const info = (servers.host?.info ?? {}) as Record<string, string | number>;
  const cpu = info.cpu_load != null ? Number(info.cpu_load) : null;
  const running = servers.instances.filter((s) => s.running);
  const alerts =
    Number(!servers.online) + opsCount + serverErrors.length + noShow.length + disputeMatches.length + pendingTournaments.length;

  return (
    <div className="space-y-8">
      <LiveRefresh intervalMs={10000} />
      <AdminHeader
        title="Главная"
        description={`Здесь видно всё важное: серверы, матчи и то, что ждёт вашего решения. Игроков: ${players.count ?? 0}, команд: ${teams.count ?? 0}. Страница обновляется сама каждые 10 секунд.`}
        actions={
          <ButtonLink href="/admin/tournaments/new" size="md">
            Создать турнир
          </ButtonLink>
        }
      />

      {/* ── полоса статуса ── */}
      <Strip className="grid-cols-2 lg:grid-cols-6">
        <StripCell
          label="Серверный ПК"
          value={servers.online ? "На связи" : "Не на связи"}
          tone={servers.online ? "ok" : "danger"}
          pulse={!servers.online}
          hint={servers.host?.last_seen_at ? `последний сигнал в ${formatTime(servers.host.last_seen_at)}` : "ещё ни разу не выходил на связь"}
          href="/admin/servers"
        />
        <StripCell
          label="Нагрузка ПК"
          value={cpu != null ? `${cpu}%` : "—"}
          tone={cpu == null ? undefined : cpu > 85 ? "danger" : cpu > 65 ? "warn" : undefined}
          hint={info.ram_used_gb != null ? `память ${info.ram_used_gb} из ${info.ram_total_gb ?? "?"} ГБ` : "процессор и память"}
          href="/admin/servers"
        />
        <StripCell
          label="Серверы включены"
          value={`${running.length} из ${servers.instances.length}`}
          hint={`с матчем: ${onServers.length}`}
          tone={servers.online && running.length ? "ok" : "muted"}
        />
        <StripCell label="Идут сейчас" value={live.length} tone={live.length ? "danger" : undefined} pulse={live.length > 0} hint={`матчей в работе: ${active.length}`} href="/admin/matches" />
        <StripCell
          label="Ждут игроков"
          value={ready.length}
          tone={noShow.length ? "danger" : ready.length ? "warn" : undefined}
          hint={noShow.length ? `${noShow.length} ждут дольше 10 минут` : "сервер уже выдан"}
        />
        <StripCell
          label="Ждут вашего решения"
          value={pending.length + disputes.length}
          tone={disputes.length ? "warn" : pending.length ? "accent" : undefined}
          hint={`заявок: ${pending.length} · споров: ${disputes.length}`}
        />
      </Strip>

      {/* ── серверы — главный блок пульта; тревоги и очередь рядом ── */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,1.75fr)_minmax(340px,1fr)]">
        <div className="min-w-0 space-y-8">
        {/* ── живая сетка серверов ── */}
        <Section title="Игровые серверы" action={<SectionLink href="/admin/servers">Все серверы и настройки</SectionLink>}>
          <p className="-mt-2 mb-4 text-[14.5px] text-fg-3">«Освободить сервер» убирает с него матч, «Перезапустить» включает заново, если завис, «Выключить» останавливает совсем.</p>
          {servers.instances.length === 0 ? (
            <Quiet>Серверы появятся здесь, когда серверный ПК выйдет на связь.</Quiet>
          ) : (
            <div className="space-y-4">
              {/* работающие — карточками с матчем и управлением; выключенные — одним списком, чтобы не забивали экран */}
              {servers.instances.some((i) => i.running || byInstance.has(i.name)) && (
                <div className="grid gap-5 lg:grid-cols-2">
                  {servers.instances
                    .filter((i) => i.running || byInstance.has(i.name))
                    .map((i) => (
                      <InstanceCard key={i.name} i={i} match={byInstance.get(i.name)} online={servers.online} now={now} hero />
                    ))}
                </div>
              )}
              {servers.instances.some((i) => !i.running && !byInstance.has(i.name)) && (
                <div className={cn(ADMIN_CARD, "divide-y divide-ink/[0.06]")}>
                  {servers.instances
                    .filter((i) => !i.running && !byInstance.has(i.name))
                    .map((i) => (
                      <div key={i.name} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3.5">
                        <span className="num w-20 text-[16px] font-bold text-fg">{i.name}</span>
                        <span className="flex-1 basis-40">
                          <ServerStatus {...instanceState(i, servers.online)} size="sm" />
                          <span className="ml-3 text-[13.5px] text-fg-3">порт <span className="font-mono">{i.port}</span></span>
                        </span>
                        {servers.online && <ServerActions instance={i.name} running={false} align="end" />}
                      </div>
                    ))}
                </div>
              )}
            </div>
          )}
        </Section>
        {/* ── сообщение игрокам ── */}
        {running.length > 0 && servers.online && (
          <Section title="Написать игрокам в чат игры">
            <div className={cn(ADMIN_CARD, "p-5")}>
              <ChatBox instances={running.map((i) => i.name)} />
            </div>
          </Section>
        )}
        </div>
        <div className="min-w-0 space-y-8">
        {/* ── очередь тревог по приоритету ── */}
        <Section title="Требует внимания" count={alerts}>
          {alerts === 0 ? (
            <Quiet>
              <span className="font-semibold text-ok">Всё спокойно.</span> Серверный ПК на связи, ничего не требует вашего решения.
            </Quiet>
          ) : (
            <div className="space-y-2">
              {!servers.online && (
                <AlertRow tone="danger" title="Серверный ПК не на связи" action={{ href: "/admin/servers", label: "Что делать" }}>
                  Матчи не загрузятся на серверы, пока компьютер с серверами не выйдет на связь
                  {servers.host?.last_seen_at ? ` (последний сигнал ${formatShortDateTime(servers.host.last_seen_at)})` : ""}.
                </AlertRow>
              )}
              {servers.online && <OpsAlerts info={opsInfo} cs2={cs2Check} />}
              {serverErrors.map((m) => (
                <AlertRow key={m.id} tone="danger" title={`Матч №${m.number}: сервер не запустился`} action={{ href: `/admin/matches/${m.id}`, label: "Выбрать другой сервер" }}>
                  {m.team1?.tag} против {m.team2?.tag}: карта не загрузилась, матч нужно перенести на другой сервер.
                </AlertRow>
              ))}
              {noShow.map((m) => (
                <AlertRow key={m.id} tone="warn" title={`Матч №${m.number}: игроки не пришли`} action={{ href: `/admin/matches/${m.id}`, label: "Открыть" }}>
                  {m.team1?.tag} против {m.team2?.tag}: игроки не подключились уже {minutesSince(m.server_ready_at, now)} мин.
                </AlertRow>
              ))}
              {disputeMatches.map((m) => (
                <AlertRow key={m.id} tone="warn" title={`Спор по матчу №${m.number}`} action={{ href: `/admin/matches/${m.id}`, label: "Разобрать" }}>
                  Капитан не согласен с результатом или ходом матча.
                </AlertRow>
              ))}
              {pendingTournaments.map((t) => (
                <AlertRow
                  key={t.id}
                  tone="accent"
                  title={`Новые заявки на участие: ${pending.filter((p) => p.tournament.id === t.id).length}`}
                  action={{ href: `/admin/tournaments/${t.id}?tab=registration`, label: "Рассмотреть" }}
                >
                  {t.name}: команды ждут, пока вы их одобрите.
                </AlertRow>
              ))}
            </div>
          )}
        </Section>
        {/* ── очередь матчей ── */}
        <Section title="Матчи в очереди" count={queue.length} action={<SectionLink href="/admin/matches">Все матчи</SectionLink>}>
          {queue.length === 0 ? (
            <Quiet>Очередь пуста. Новые матчи появятся, когда определятся соперники.</Quiet>
          ) : (
            <div className={`${ADMIN_CARD} divide-y divide-ink/[0.06]`}>
              {queue.map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 text-[15px]">
                  <span className="num w-10 text-[14px] font-semibold text-fg-3">№{m.number}</span>
                  <Link href={`/admin/matches/${m.id}`} className="min-w-0 flex-1 basis-56 font-semibold hover:text-accent">
                    <span className="block truncate">
                      {m.team1?.name ?? "TBD"} <span className="font-normal text-fg-3">против</span> {m.team2?.name ?? "TBD"}
                    </span>
                    <span className="mt-0.5 block truncate text-[13.5px] font-normal text-fg-3">
                      {m.tournament?.name} · раунд {m.round}
                      {m.scheduled_at ? ` · ${formatShortDateTime(m.scheduled_at)}` : ""}
                    </span>
                  </Link>
                  <MatchStatusChip status={m.status} />
                  {m.status === "upcoming" ? (
                    <ActionForm action={startVeto}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <SubmitButton size="sm" variant="secondary" className="sm:h-10">
                        Начать выбор карт
                      </SubmitButton>
                    </ActionForm>
                  ) : (
                    <ActionForm action={sendMatchToServer}>
                      <input type="hidden" name="matchId" value={m.id} />
                      <input type="hidden" name="instance" value="" />
                      <SubmitButton size="sm" className="sm:h-10">Отправить на сервер</SubmitButton>
                    </ActionForm>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <div className="contents">
          {/* ── текущий турнир ── */}
          <Section title="Ближайший турнир" action={<SectionLink href="/admin/tournaments">Все турниры</SectionLink>}>
            {current ? (
              <Link href={`/admin/tournaments/${current.id}`} className={`${ADMIN_CARD} block p-6 transition-shadow hover:shadow-[inset_0_0_0_1px_var(--color-line-strong),var(--shadow-soft)]`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-[20px] font-bold tracking-[-0.01em]">{current.name}</div>
                    <div className="mt-1 text-[14px] text-fg-3">Начало: {formatShortDateTime(current.starts_at)}</div>
                  </div>
                  <TournamentStatusChip status={current.status} size="md" />
                </div>
                {tournaments.length > 1 && <div className="mt-3 text-[14px] text-fg-3">Ещё активных турниров: {tournaments.length - 1}</div>}
                <div className="mt-4 text-[14px] font-semibold text-accent">Открыть турнир →</div>
              </Link>
            ) : (
              <Quiet>
                Активных турниров нет.{" "}
                <Link href="/admin/tournaments/new" className="text-accent hover:underline">
                  Создать турнир
                </Link>
                .
              </Quiet>
            )}
          </Section>

          {/* ── лента действий ── */}
          <Section title="Что происходило недавно" action={<SectionLink href="/admin/logs">Весь журнал</SectionLink>}>
            {logs.length === 0 ? (
              <Quiet>Пока ничего не происходило.</Quiet>
            ) : (
              <div className={cn(ADMIN_CARD, "divide-y divide-ink/[0.06] overflow-x-auto")}>
                {logs.map((l) => (
                  <div key={l.id} className="flex min-w-0 items-baseline gap-4 px-5 py-2.5 text-[14px] whitespace-nowrap">
                    <span className="num shrink-0 text-fg-3">{formatTime(l.created_at)}</span>
                    <span className="w-28 shrink-0 truncate font-semibold text-fg-2">{l.actor?.nickname ?? "система"}</span>
                    <span className="truncate text-fg">{l.action}</span>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}
