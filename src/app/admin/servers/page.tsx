import type { Metadata } from "next";
import Link from "next/link";
import { hostCommand, serverRcon } from "@/app/actions/admin-server";
import { getAgentBundle } from "@/lib/agent-bundle";
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

export const metadata: Metadata = { title: "Серверы — F16 Control" };

const CMD_STATUS: Record<AgentCommand["status"], string> = {
  done: "text-ok",
  error: "text-danger",
  sent: "text-accent",
  pending: "text-warn",
};

export default async function ServersPage() {
  await requireAdmin("/admin/servers"); // права проверяются в каждой странице, не только в layout
  const { host, online, instances } = await getServerState();
  const [{ data: matches }, { data: commands }] = await Promise.all([
    db()
      .from("matches")
      .select(
        "id, number, status, server_instance, server_state, server_ready_at, team1_score, team2_score, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag)",
      )
      .not("server_instance", "is", null)
      .in("status", ["ready", "live"]),
    db().from("agent_commands").select("*").order("created_at", { ascending: false }).limit(25),
  ]);
  type M = {
    id: string;
    number: number;
    status: string;
    server_instance: string;
    server_state: string | null;
    server_ready_at: string | null;
    team1_score: number;
    team2_score: number;
    team1: { tag: string } | null;
    team2: { tag: string } | null;
  };
  const assigned = new Map(((matches ?? []) as unknown as M[]).map((m) => [m.server_instance, m]));
  const info = (host?.info ?? {}) as Record<string, string | number>;
  const versions = ((host?.info as { versions?: Record<string, string> } | undefined)?.versions ?? {}) as Record<string, string>;
  const busy = (host?.info as { busy?: string | null } | undefined)?.busy ?? null;
  const siteBundle = getAgentBundle().version;
  const cpu = info.cpu_load != null ? Number(info.cpu_load) : null;
  const now = serverNow();
  const free = instances.filter((i) => i.running && (i.gamestate ?? "none") === "none").length;
  const inMatch = instances.filter((i) => i.running && (i.gamestate ?? "none") !== "none").length;

  return (
    <div className="space-y-8">
      <LiveRefresh intervalMs={5000} />
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

      {!online && (
        <AlertRow tone="danger" title="F16 Server Agent не на связи">
          {host?.last_seen_at ? `Последний сигнал ${formatShortDateTime(host.last_seen_at)}. ` : ""}Проверьте, что серверный ПК включён — агент
          запускается автоматически задачей «F16 Server Agent».
        </AlertRow>
      )}
      {busy && (
        <AlertRow tone="warn" title="Агент занят">
          {busy}. Серверы могут быть недоступны.
        </AlertRow>
      )}

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
        {(commands ?? []).length === 0 ? (
          <p className="text-[13px] text-fg-3">Команд ещё не было.</p>
        ) : (
          <div className="rounded-[12px] border border-white/[0.08] bg-[#04070c] overflow-x-auto">
            <table className="w-full min-w-[860px] font-mono text-[12px]">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-[0.2em] text-[#7f93b0]">
                  <th className="px-4 h-9 font-medium w-[130px]">Время</th>
                  <th className="px-2 font-medium w-16">Статус</th>
                  <th className="px-2 font-medium w-20">Инстанс</th>
                  <th className="px-2 font-medium w-[220px]">Команда</th>
                  <th className="px-2 font-medium">Ответ</th>
                </tr>
              </thead>
              <tbody>
                {((commands ?? []) as AgentCommand[]).map((c) => (
                  <tr key={c.id} className="align-top border-t border-white/[0.04] hover:bg-white/[0.02]">
                    <td className="px-4 py-1.5 text-fg-3 whitespace-nowrap">{formatShortDateTime(c.created_at)}</td>
                    <td className={cn("px-2 py-1.5", CMD_STATUS[c.status])}>{c.status}</td>
                    <td className="px-2 py-1.5 text-fg-3">{c.instance ?? "host"}</td>
                    <td className="px-2 py-1.5 text-fg-2 max-w-[220px] truncate">
                      {c.type}
                      {c.type === "rcon" ? ` ${String(c.payload.command)}` : ""}
                    </td>
                    <td className="px-2 py-1.5 text-fg-3">
                      {c.result && c.result.length > 100 ? (
                        <details>
                          <summary className="cursor-pointer truncate hover:text-fg-2">{c.result.split(/\r?\n/)[0].slice(0, 100)}…</summary>
                          <pre className="mt-1 mb-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{c.result}</pre>
                        </details>
                      ) : (
                        <span className="whitespace-pre-wrap break-all">{c.result ?? ""}</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
