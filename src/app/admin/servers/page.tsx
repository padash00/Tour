import type { Metadata } from "next";
import Link from "next/link";
import { hostCommand, serverRcon, toggleLobbyServer } from "@/app/actions/admin-server";
import { ActionToggle } from "@/components/admin/action-toggle";
import { getAgentBundle } from "@/lib/agent-bundle";
import type { LobbyGame } from "@/lib/lobby";
import { formatShortDateTime, formatTime } from "@/lib/format";
import { getServerState, type AgentCommand } from "@/lib/server-control";
import { db } from "@/lib/supabase";
import { ServerActions } from "@/components/admin/server-actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/components/ui";
import { ADMIN_CARD, AdminHeader, AlertRow, Dot } from "@/components/admin/control";
import { humanPlayers } from "@/components/admin/instance-card";
import { Section, Strip, StripCell, instanceState, minutesSince, serverNow, toneBar, toneText } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";
import { getCs2UpdateCheck, getSelfCheck } from "@/lib/server/ops";
import { OpsAlerts, type OpsInfo } from "@/components/admin/ops-alerts";
import { SelfCheckPanel } from "@/components/admin/self-check";
import { AgentHealth } from "@/components/admin/agent-health";
import { CommandLog } from "@/components/admin/command-log";
import { ObsOverlayPanel } from "@/components/admin/obs-overlay";
import type { SyncMetrics } from "@/lib/server/agent-report";
import { getSetting } from "@/lib/settings";

export const metadata: Metadata = { title: "Серверы — F16 Control" };

export default async function ServersPage() {
  await requireAdmin("/admin/servers"); // права проверяются в каждой странице, не только в layout
  const { host, online, instances } = await getServerState();
  const [{ data: matches }, { data: commands }, cs2Check, selfReport, { data: lobbyGames }, { count: pending }, { count: inflight }, { data: timing }, { data: jobTimings }, playerIp] = await Promise.all([
    db()
      .from("matches")
      .select(
        "id, number, status, server_instance, server_state, server_ready_at, team1_score, team2_score, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag)",
      )
      .not("server_instance", "is", null)
      .in("status", ["ready", "live"]),
    db().from("agent_commands").select("*").order("created_at", { ascending: false }).limit(25),
    getCs2UpdateCheck(),
    getSelfCheck(),
    db()
      .from("lobby_games")
      .select("id, status, server_instance, server_state, team1, team2, lobby:lobbies!lobby_games_lobby_id_fkey(code)")
      .not("server_instance", "is", null)
      .in("status", ["waiting", "live"])
      .overrideTypes<Pick<LobbyGame, "team1" | "team2">[]>(),
    db().from("agent_commands").select("id", { head: true, count: "exact" }).eq("status", "pending"),
    db().from("agent_commands").select("id", { head: true, count: "exact" }).eq("status", "sent"),
    db().from("app_settings").select("value").eq("key", "AGENT_SYNC_METRICS").maybeSingle(),
    db().from("app_settings").select("key, value").in("key", ["AGENT_DISPATCH_METRICS", "AGENT_MAINTENANCE_METRICS"]),
    getSetting("PLAYER_IP"),
  ]);
  let metrics: SyncMetrics | null = null;
  try { metrics = timing?.value ? JSON.parse(timing.value) as SyncMetrics : null; } catch {}
  const jobMetrics = new Map<string, SyncMetrics>();
  for (const row of jobTimings ?? []) {
    try { jobMetrics.set(row.key, JSON.parse(row.value) as SyncMetrics); } catch {}
  }
  const lobbyOn = new Map((lobbyGames ?? []).map((g) => [g.server_instance, g]));
  const nowTs = serverNow();
  const selfCheckRunning = ((commands ?? []) as AgentCommand[]).some(
    (c) => c.type === "self_check" && (c.status === "pending" || c.status === "sent") && nowTs - new Date(c.created_at).getTime() < 15 * 60_000,
  );
  const assigned = new Map((matches ?? []).map((m) => [m.server_instance, m]));
  const info = (host?.info ?? {}) as Record<string, string | number>;
  const versions = ((host?.info as { versions?: Record<string, string> } | undefined)?.versions ?? {}) as Record<string, string>;
  const upnpIp = (host?.info as { upnp?: { ip?: string | null } } | undefined)?.upnp?.ip ?? null;
  const busy = (host?.info as { busy?: string | null } | undefined)?.busy ?? null;
  const siteBundle = getAgentBundle().version;
  const cpu = info.cpu_load != null ? Number(info.cpu_load) : null;
  const now = serverNow();
  const free = instances.filter((i) => i.running && (i.gamestate ?? "none") === "none").length;
  const inMatch = instances.filter((i) => i.running && (i.gamestate ?? "none") !== "none").length;

  return (
    <div className="space-y-8">
      <LiveRefresh watch="servers" intervalMs={5000} />
      <AdminHeader
        eyebrow="F16 Control"
        title="Серверы"
        description={host?.lan_ip ? `Серверный ПК ${host.lan_ip} · обновляется каждые 5 секунд` : "Серверный ПК ещё не выходил на связь"}
        actions={
          <span className="flex items-center gap-2 text-[13px]">
            <Dot tone={online ? "ok" : "danger"} pulse={!online} />
            <span className={online ? "text-ok" : "text-danger"}>Агент {online ? "на связи" : "не на связи"}</span>
          </span>
        }
      />

      <AgentHealth lastSeen={host?.last_seen_at ?? null} initialNow={nowTs} pending={pending ?? 0} inflight={inflight ?? 0}
        metrics={metrics} dispatch={jobMetrics.get("AGENT_DISPATCH_METRICS") ?? null} maintenance={jobMetrics.get("AGENT_MAINTENANCE_METRICS") ?? null} />

      {online && !playerIp && host?.lan_ip && upnpIp && host.lan_ip !== upnpIp && (
        <AlertRow tone="warn" title="Адрес для игроков не задан">
          Сервер: {host.lan_ip}, роутер: {upnpIp}. Если игровые ПК в другой подсети, укажите доступный им адрес в{" "}
          <Link href="/admin/settings?tab=servers" className="underline">настройках серверов</Link> — он будет общим для турниров и лобби.
        </AlertRow>
      )}

      {!online && (
        <AlertRow tone="danger" title="F16 Server Agent не на связи">
          {host?.last_seen_at ? `Последний сигнал ${formatShortDateTime(host.last_seen_at)}. ` : ""}Проверьте, что серверный ПК включён — агент
          запускается после входа в Windows задачей «F16 Server Agent».
        </AlertRow>
      )}
      {busy && (
        <AlertRow tone="warn" title="Агент занят">
          {busy === "self_check" ? "идёт проверка перед турниром" : busy}. Серверы могут быть недоступны.
        </AlertRow>
      )}
      {online && <OpsAlerts info={(host?.info ?? {}) as OpsInfo} cs2={cs2Check} />}

      {/* ── проверка перед турниром ── */}
      <Section title="Проверка перед турниром">
        <SelfCheckPanel report={selfReport} running={selfCheckRunning || busy === "self_check"} disabled={!online ? "Агент не на связи." : null} />
      </Section>

      {/* ── хост ── */}
      <Strip className="grid-cols-2 md:grid-cols-4 lg:[&>*:nth-child(n+5)]:border-t lg:[&>*:nth-child(n+5)]:border-white/[0.06]">
        <StripCell
          label="Синхронизация"
          value={host?.last_seen_at ? formatTime(host.last_seen_at) : "—"}
          tone={online ? "ok" : "danger"}
          hint={online ? "агент на связи" : "нет сигнала"}
        />
        <StripCell label="CPU" value={cpu != null ? `${cpu}%` : "—"} tone={cpu == null ? undefined : cpu > 85 ? "danger" : cpu > 65 ? "warn" : undefined} />
        <StripCell label="RAM" value={info.ram_used_gb ?? "—"} hint={info.ram_total_gb ? `из ${info.ram_total_gb} GB` : undefined} />
        <StripCell label="Диск D" value={info.disk_free_gb ?? "—"} hint="GB свободно" />
        <StripCell label="Адрес игроков" value={playerIp || "Автоматически"} hint={playerIp ? "задан в настройках" : "LAN или адрес роутера"} />
        <StripCell label="CS2 build" value={info.cs2_build ?? "—"} />
        <StripCell label="MatchZy" value={versions.matchzy ?? "—"} />
        <StripCell label="CSSharp" value={versions.counterstrikesharp ?? "—"} hint={versions.metamod ? `Metamod ${versions.metamod}` : undefined} />
        <StripCell
          label="Агент"
          value={info.agent_version ? String(info.agent_version).slice(0, 7) : "—"}
          tone={info.agent_version === siteBundle ? "ok" : "warn"}
          hint={info.agent_version && info.agent_version !== siteBundle ? "обновится сам" : "актуален"}
        />
      </Strip>

      {/* ── стойка инстансов ── */}
      <Section
        title="Стойка"
        count={instances.length}
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
            <span className="flex items-center gap-1.5">
              <Dot tone="ok" /> свободно {free}
            </span>
            <span className="flex items-center gap-1.5">
              <Dot tone="danger" /> в матче {inMatch}
            </span>
            <span className="flex items-center gap-1.5">
              <Dot tone="muted" /> выключено {instances.filter((i) => !i.running).length}
            </span>
          </div>
        }
      >
        <div className="space-y-2">
          {instances.map((s) => {
            const st = instanceState(s, online);
            const m = assigned.get(s.name);
            const live = st.text === "LIVE";
            const players = humanPlayers(s);
            const waited = m?.status === "ready" && m.server_state === "ready" ? minutesSince(m.server_ready_at, now) : null;
            return (
              <div key={s.name} className={cn(ADMIN_CARD, "relative overflow-hidden", live && "bg-danger/[0.03]")}>
                <span className={cn("absolute left-0 inset-y-0 w-[3px]", toneBar[st.tone], live && "animate-pulse")} />
                <div className="grid gap-x-6 gap-y-3 pl-5 pr-4 py-4 grid-cols-2 md:grid-cols-[150px_130px_minmax(0,1fr)_150px_80px] xl:grid-cols-[150px_130px_minmax(0,1fr)_150px_80px_auto] items-center">
                  <div>
                    <div className="num text-[15px] font-semibold">{s.name}</div>
                    <div className="num text-[11px] text-fg-3">
                      game :{s.port} · tv :{s.port + 5}
                      {s.role === "reserve" ? " · резерв" : ""}
                    </div>
                    <ActionToggle
                      action={toggleLobbyServer}
                      fields={{ instance: s.name }}
                      on={s.for_lobby ?? false}
                      label={`Использовать ${s.name} для лобби`}
                      onLabel="Для лобби"
                      offLabel="Для турниров"
                      className="mt-1"
                    />
                  </div>
                  <div className={cn("flex items-center gap-2 text-[13px] font-medium", toneText[st.tone])}>
                    <Dot tone={st.tone === "muted" ? "muted" : st.tone} pulse={live} />
                    {st.text}
                  </div>
                  <div className="min-w-0 text-[13px] col-span-2 md:col-span-1">
                    {m ? (
                      <Link href={`/admin/matches/${m.id}`} className="block truncate hover:text-accent">
                        <span className="font-medium">
                          #{m.number} {m.team1?.tag ?? "TBD"} <span className="text-fg-3">vs</span> {m.team2?.tag ?? "TBD"}
                        </span>
                        {m.status === "live" && <span className="ml-2 num">{m.team1_score}:{m.team2_score}</span>}
                        {m.server_state === "loading" && <span className="ml-2 text-[12px] text-warn">загрузка…</span>}
                        {m.server_state === "error" && <span className="ml-2 text-[12px] text-danger">ошибка карты</span>}
                        {waited != null && (
                          <span className={cn("ml-2 text-[12px] num", waited >= 15 ? "text-danger" : waited >= 10 ? "text-warn" : "text-fg-3")}>
                            ждём {waited} мин
                          </span>
                        )}
                      </Link>
                    ) : lobbyOn.has(s.name) ? (
                      <Link href={`/lobby/${lobbyOn.get(s.name)!.lobby?.code ?? ""}`} className="block truncate hover:text-accent">
                        <span className="font-medium">
                          Лобби #{lobbyOn.get(s.name)!.lobby?.code} · {lobbyOn.get(s.name)!.team1.name} <span className="text-fg-3">vs</span>{" "}
                          {lobbyOn.get(s.name)!.team2.name}
                        </span>
                        {lobbyOn.get(s.name)!.server_state === "loading" && <span className="ml-2 text-[12px] text-warn">загрузка…</span>}
                      </Link>
                    ) : (
                      <span className="text-fg-3">матча нет</span>
                    )}
                  </div>
                  <span className="num text-[13px] text-fg-2 truncate">{s.map ?? "—"}</span>
                  <span className="num text-[13px] text-right">{players != null ? `${players}/10` : "—"}</span>
                  <div className="col-span-2 md:col-span-5 xl:col-span-1">
                    {online ? <ServerActions instance={s.name} running={!!s.running} /> : <span className="text-[12px] text-fg-3">агент офлайн</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── оверлей трансляции: ссылка для OBS на каждый инстанс ── */}
      <Section title="Трансляция в OBS">
        <ObsOverlayPanel
          instances={instances.map((s) => {
            const m = assigned.get(s.name);
            return { name: s.name, match: m ? `#${m.number} ${m.team1?.tag ?? "TBD"} vs ${m.team2?.tag ?? "TBD"}` : null };
          })}
        />
      </Section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
        <Section title="RCON">
          <div className={`${ADMIN_CARD} p-4`}>
            <ActionForm action={serverRcon}>
              <div className="flex flex-wrap gap-2">
                <select name="instance" aria-label="Инстанс" className="field !h-10 w-32">
                  {instances.map((s) => (
                    <option key={s.name}>{s.name}</option>
                  ))}
                </select>
                <input name="command" placeholder="css_plugins list" aria-label="Команда" className="field !h-10 num flex-1 min-w-[200px]" />
                <SubmitButton variant="secondary">Выполнить</SubmitButton>
              </div>
              <p className="mt-2 text-[12px] text-fg-3">Ответ появится в журнале команд ниже.</p>
            </ActionForm>
          </div>
        </Section>

        <Section title="Обслуживание">
          <div className={`${ADMIN_CARD} p-4`}>
            <div className="flex flex-wrap gap-2">
              {[
                { type: "update_cs2", label: "Обновить CS2", confirm: "Остановить все серверы и обновить CS2 через SteamCMD? Займёт несколько минут." },
                { type: "update_plugins", label: "Обновить плагины", confirm: "Скачать последние Metamod, CounterStrikeSharp и MatchZy и перезапустить серверы?" },
                { type: "restart_all", label: "Перезапустить все", confirm: "Перезапустить все активные серверы?" },
              ].map((c) => (
                <ActionForm key={c.type} action={hostCommand}>
                  <input type="hidden" name="type" value={c.type} />
                  <SubmitButton size="sm" variant="secondary" confirm={c.confirm}>
                    {c.label}
                  </SubmitButton>
                </ActionForm>
              ))}
            </div>
            <p className="mt-2 text-[12px] text-fg-3">
              Запускается, только если нет активных матчей. Код агента и конфиги CS2 доезжают до серверного ПК автоматически после деплоя.
            </p>
          </div>
        </Section>
      </div>

      <Section title="Журнал команд агенту" count={(commands ?? []).length}>
        <CommandLog commands={(commands ?? []) as AgentCommand[]} />
      </Section>
    </div>
  );
}
