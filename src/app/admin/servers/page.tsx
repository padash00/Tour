import type { Metadata } from "next";
import Link from "next/link";
import { hostCommand, serverRcon } from "@/app/actions/admin-server";
import { getAgentBundle } from "@/lib/agent-bundle";
import type { LobbyGame } from "@/lib/lobby";
import { formatShortDateTime } from "@/lib/format";
import { getServerState, type AgentCommand } from "@/lib/server-control";
import { db } from "@/lib/supabase";
import { ServerActions } from "@/components/admin/server-actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/components/ui";
import { Status } from "@/components/ds";
import { ADMIN_CARD, AdminHeader, AlertRow, Dot } from "@/components/admin/control";
import { ServerStatus, humanPlayers } from "@/components/admin/instance-card";
import { Section, Strip, StripCell, instanceState, minutesSince, serverNow, toneBar } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";
import { getCs2UpdateCheck, getSelfCheck } from "@/lib/server/ops";
import { OpsAlerts, type OpsInfo } from "@/components/admin/ops-alerts";
import { SelfCheckPanel } from "@/components/admin/self-check";
import { AgentHealth } from "@/components/admin/agent-health";
import { CommandLog } from "@/components/admin/command-log";
import { F16HudPanel, ObsOverlayPanel } from "@/components/admin/obs-overlay";
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
    <div className="space-y-10">
      <LiveRefresh watch="servers" intervalMs={5000} />
      <AdminHeader
        title="Серверы"
        description={
          host?.lan_ip
            ? `Здесь включают и выключают игровые серверы, проверяют их перед турниром и обслуживают. Серверный ПК: ${host.lan_ip}. Страница обновляется сама каждые 5 секунд.`
            : "Здесь включают и выключают игровые серверы. Серверный ПК ещё не выходил на связь."
        }
        actions={
          <Status info={{ label: online ? "Серверный ПК на связи" : "Серверный ПК не на связи", tone: online ? "ok" : "danger", pulse: !online }} />
        }
      />

      {online && !playerIp && host?.lan_ip && upnpIp && host.lan_ip !== upnpIp && (
        <AlertRow tone="warn" title="Адрес для игроков не задан">
          Адрес серверного ПК: {host.lan_ip}, адрес роутера: {upnpIp}. Если игровые компьютеры в другой сети, укажите адрес, доступный им, в{" "}
          <Link href="/admin/settings?tab=servers" className="underline">настройках серверов</Link>: он будет общим для турниров и лобби.
        </AlertRow>
      )}

      {!online && (
        <AlertRow tone="danger" title="Серверный ПК не на связи">
          {host?.last_seen_at ? `Последний сигнал был ${formatShortDateTime(host.last_seen_at)}. ` : ""}Проверьте, что серверный ПК включён: программа
          запускается после входа в Windows задачей «F16 Server Agent». Подробная инструкция есть ниже, в блоке «Состояние серверного ПК».
        </AlertRow>
      )}
      {busy && (
        <AlertRow tone="warn" title="Серверный ПК сейчас занят">
          {busy === "self_check" ? "Идёт проверка перед турниром" : busy}. Серверы могут быть недоступны, пока он не закончит.
        </AlertRow>
      )}
      {online && <OpsAlerts info={(host?.info ?? {}) as OpsInfo} cs2={cs2Check} />}

      {/* ── игровые серверы — главное на странице ── */}
      <Section
        title="Игровые серверы"
        count={instances.length}
        action={
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-[14px] text-fg-2">
            <span className="flex items-center gap-2">
              <Dot tone="ok" /> свободно: {free}
            </span>
            <span className="flex items-center gap-2">
              <Dot tone="danger" /> идёт игра: {inMatch}
            </span>
            <span className="flex items-center gap-2">
              <Dot tone="muted" /> выключено: {instances.filter((i) => !i.running).length}
            </span>
          </div>
        }
      >
        <p className="-mt-2 mb-4 max-w-read text-[14.5px] text-fg-3">
          «Включить» запускает сервер. «Перезапустить» включает его заново, если он завис. «Освободить сервер» убирает с него матч. «Выключить» останавливает сервер совсем.
        </p>
        <div className="space-y-4">
          {instances.map((s) => {
            const st = instanceState(s, online);
            const m = assigned.get(s.name);
            const live = st.text === "LIVE";
            const players = humanPlayers(s);
            const waited = m?.status === "ready" && m.server_state === "ready" ? minutesSince(m.server_ready_at, now) : null;
            return (
              <div key={s.name} className={cn(ADMIN_CARD, "relative overflow-hidden", live && "bg-danger/[0.03]")}>
                <span className={cn("absolute left-0 inset-y-0 w-1", toneBar[st.tone], live && "animate-pulse")} />
                <div className="grid items-center gap-x-8 gap-y-4 py-5 pl-7 pr-6 md:grid-cols-[minmax(0,200px)_minmax(0,1fr)] xl:grid-cols-[minmax(0,200px)_minmax(0,1fr)_auto]">
                  <div className="min-w-0">
                    <div className="num text-[20px] font-bold tracking-[-0.01em]">{s.name}</div>
                    <div className="mt-1 text-[13.5px] text-fg-3">
                      порт игры <span className="font-mono">{s.port}</span> · порт трансляции <span className="font-mono">{s.port + 5}</span>
                      {s.role === "reserve" ? " · запасной" : ""}
                    </div>
                    {/* назначение выставляет сайт сам (server-balance.ts): турнирное время — турнирам, иначе — лобби */}
                    <div className="mt-1 text-[13.5px] text-fg-3" title="Переключается автоматически: в день турнира — турниру, в остальное время — лобби">
                      {s.for_lobby ? "Сейчас отдан под лобби" : "Сейчас для турниров"} (переключается само)
                    </div>
                  </div>
                  <div className="min-w-0 space-y-2">
                    <ServerStatus text={st.text} tone={st.tone} />
                    <div className="text-[15px]">
                      {m ? (
                        <Link href={`/admin/matches/${m.id}`} className="block truncate hover:text-accent">
                          <span className="font-semibold">
                            Матч №{m.number}: {m.team1?.tag ?? "TBD"} <span className="font-normal text-fg-3">против</span> {m.team2?.tag ?? "TBD"}
                          </span>
                          {m.status === "live" && <span className="ml-2 num font-bold">{m.team1_score}:{m.team2_score}</span>}
                          {m.server_state === "loading" && <span className="ml-2 text-[13.5px] font-medium text-warn">загружается…</span>}
                          {m.server_state === "error" && <span className="ml-2 text-[13.5px] font-medium text-danger">карта не загрузилась</span>}
                          {waited != null && (
                            <span className={cn("ml-2 text-[13.5px] num", waited >= 15 ? "font-semibold text-danger" : waited >= 10 ? "font-medium text-warn" : "text-fg-3")}>
                              ждём игроков {waited} мин
                            </span>
                          )}
                        </Link>
                      ) : lobbyOn.has(s.name) ? (
                        <Link href={`/lobby/${lobbyOn.get(s.name)!.lobby?.code ?? ""}`} className="block truncate hover:text-accent">
                          <span className="font-semibold">
                            Лобби {lobbyOn.get(s.name)!.lobby?.code}: {lobbyOn.get(s.name)!.team1.name} <span className="font-normal text-fg-3">против</span>{" "}
                            {lobbyOn.get(s.name)!.team2.name}
                          </span>
                          {lobbyOn.get(s.name)!.server_state === "loading" && <span className="ml-2 text-[13.5px] font-medium text-warn">загружается…</span>}
                        </Link>
                      ) : (
                        <span className="text-fg-3">Матча на сервере нет</span>
                      )}
                    </div>
                    <div className="text-[14px] text-fg-3">
                      Карта: <span className="font-mono text-fg-2">{s.map ?? "—"}</span>
                      <span className="mx-2">·</span>
                      {players != null ? `игроков: ${players} из 10` : "игроков нет"}
                    </div>
                  </div>
                  <div className="md:col-span-2 xl:col-span-1">
                    {online ? <ServerActions instance={s.name} running={!!s.running} /> : <span className="text-[14px] text-fg-3">Серверный ПК не на связи, управлять нельзя.</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Section>

      {/* ── проверка перед турниром ── */}
      <Section title="Проверка перед турниром">
        <SelfCheckPanel report={selfReport} running={selfCheckRunning || busy === "self_check"} disabled={!online ? "Серверный ПК не на связи, проверку запустить нельзя." : null} />
      </Section>

      {/* ── обслуживание ── */}
      <Section title="Обслуживание серверов">
        <div className={cn(ADMIN_CARD, "p-5 sm:p-6")}>
          <div className="grid gap-6 md:grid-cols-3">
            {[
              {
                type: "update_cs2",
                label: "Обновить CS2",
                hint: "Скачать свежую версию игры на серверы. Нужно, когда вышло обновление CS2. Займёт несколько минут.",
                confirm: "Остановить все серверы и обновить CS2 через SteamCMD? Займёт несколько минут.",
              },
              {
                type: "update_plugins",
                label: "Обновить плагины",
                hint: "Скачать последние плагины для матчей и перезапустить серверы.",
                confirm: "Скачать последние Metamod, CounterStrikeSharp и MatchZy и перезапустить серверы?",
              },
              {
                type: "restart_all",
                label: "Перезапустить все серверы",
                hint: "Включить заново все работающие серверы. Помогает, если что-то зависло.",
                confirm: "Перезапустить все активные серверы?",
              },
            ].map((c) => (
              <ActionForm key={c.type} action={hostCommand}>
                <input type="hidden" name="type" value={c.type} />
                <SubmitButton size="md" variant="secondary" className="w-full" confirm={c.confirm}>
                  {c.label}
                </SubmitButton>
                <p className="mt-2 text-[13.5px] leading-snug text-fg-3">{c.hint}</p>
              </ActionForm>
            ))}
          </div>
          <p className="mt-5 border-t border-ink/[0.06] pt-4 text-[14px] text-fg-3">
            Эти кнопки работают, только когда нет идущих матчей. Новые версии программ и настройки CS2 доезжают до серверного ПК сами после обновления сайта.
          </p>
        </div>
      </Section>

      {/* ── состояние серверного ПК ── */}
      <Section title="Состояние серверного ПК">
        <div className="space-y-5">
          <AgentHealth lastSeen={host?.last_seen_at ?? null} initialNow={nowTs} pending={pending ?? 0} inflight={inflight ?? 0}
            metrics={metrics} dispatch={jobMetrics.get("AGENT_DISPATCH_METRICS") ?? null} maintenance={jobMetrics.get("AGENT_MAINTENANCE_METRICS") ?? null} />
          <Strip className="grid-cols-2 md:grid-cols-4 lg:[&>*:nth-child(n+5)]:border-t lg:[&>*:nth-child(n+5)]:border-ink/[0.06]">
            {/* связь с серверным ПК — в блоке выше; здесь только железо и версии: ровно 8 ячеек, 2 ряда по 4 */}
            <StripCell label="Загрузка процессора" value={cpu != null ? `${cpu}%` : "—"} tone={cpu == null ? undefined : cpu > 85 ? "danger" : cpu > 65 ? "warn" : undefined} />
            <StripCell label="Память" value={info.ram_used_gb ?? "—"} hint={info.ram_total_gb ? `ГБ из ${info.ram_total_gb}` : undefined} />
            <StripCell label="Свободно на диске D" value={info.disk_free_gb ?? "—"} hint="ГБ" />
            <StripCell label="Адрес для игроков" value={playerIp || "Автоматически"} hint={playerIp ? "задан в настройках" : "адрес ПК или роутера"} />
            <StripCell label="Версия игры CS2" value={info.cs2_build ?? "—"} />
            <StripCell label="Плагин матчей MatchZy" value={versions.matchzy ?? "—"} />
            <StripCell label="Плагины CounterStrikeSharp" value={versions.counterstrikesharp ?? "—"} hint={versions.metamod ? `Metamod ${versions.metamod}` : undefined} />
            <StripCell
              label="Программа на серверном ПК"
              value={info.agent_version ? String(info.agent_version).slice(0, 7) : "—"}
              tone={info.agent_version === siteBundle ? "ok" : "warn"}
              hint={info.agent_version && info.agent_version !== siteBundle ? "обновится сама" : "актуальная версия"}
            />
          </Strip>
        </div>
      </Section>

      {/* ── оверлей трансляции: ссылка для OBS на каждый сервер ── */}
      <Section title="Трансляция в OBS">
        <div className="space-y-4">
        <F16HudPanel />
        <ObsOverlayPanel
          instances={instances.map((s) => {
            const m = assigned.get(s.name);
            return { name: s.name, match: m ? `№${m.number} ${m.team1?.tag ?? "TBD"} против ${m.team2?.tag ?? "TBD"}` : null };
          })}
        />
        </div>
      </Section>

      <Section title="Команда серверу (для опытных)">
        <div className={cn(ADMIN_CARD, "p-5 sm:p-6")}>
          <ActionForm action={serverRcon}>
            <div className="flex flex-wrap gap-2">
              <select name="instance" aria-label="На каком сервере выполнить" className="field !h-11 w-36">
                {instances.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
              <input name="command" placeholder="css_plugins list" aria-label="Команда" className="field !h-11 num flex-1 min-w-[200px]" />
              <SubmitButton variant="secondary" size="md">Выполнить</SubmitButton>
            </div>
            <p className="mt-3 text-[14px] text-fg-3">Выберите сервер и впишите команду консоли CS2. Ответ появится в журнале ниже. Если не уверены, что вводить, лучше не трогать.</p>
          </ActionForm>
        </div>
      </Section>

      <Section title="Журнал команд серверному ПК" count={(commands ?? []).length}>
        <CommandLog commands={(commands ?? []) as AgentCommand[]} />
      </Section>
    </div>
  );
}
