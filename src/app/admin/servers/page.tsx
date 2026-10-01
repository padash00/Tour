import type { Metadata } from "next";
import Link from "next/link";
import { hostCommand, serverCommand, serverRcon } from "@/app/actions/admin-server";
import { getAgentBundle } from "@/lib/agent-bundle";
import { formatShortDateTime } from "@/lib/format";
import { getServerState, type AgentCommand } from "@/lib/server-control";
import { db } from "@/lib/supabase";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/components/ui";
import { AdminHeader, AlertRow, Dot, Metric, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Серверы — F16 Control" };

type Tone = "ok" | "warn" | "danger" | "accent" | "muted";

const stateLabel: Record<string, { text: string; tone: Tone }> = {
  none: { text: "Свободен", tone: "ok" },
  pre_veto: { text: "Подготовка", tone: "accent" },
  veto: { text: "Подготовка", tone: "accent" },
  warmup: { text: "Разминка", tone: "warn" },
  knife: { text: "Нож", tone: "warn" },
  waiting_for_knife_decision: { text: "Нож", tone: "warn" },
  going_live: { text: "Старт", tone: "danger" },
  live: { text: "LIVE", tone: "danger" },
  pending_restore: { text: "Восстановление", tone: "warn" },
  post_game: { text: "Завершение", tone: "muted" },
};

const toneText: Record<Tone, string> = {
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
  accent: "text-accent",
  muted: "text-fg-3",
};

export default async function ServersPage() {
  const { host, online, instances } = await getServerState();
  const [{ data: matches }, { data: commands }] = await Promise.all([
    db()
      .from("matches")
      .select("id, number, server_instance, server_state, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag)")
      .not("server_instance", "is", null)
      .in("status", ["ready", "live"]),
    db().from("agent_commands").select("*").order("created_at", { ascending: false }).limit(15),
  ]);
  type M = { id: string; number: number; server_instance: string; server_state: string; team1: { tag: string } | null; team2: { tag: string } | null };
  const assigned = new Map(((matches ?? []) as unknown as M[]).map((m) => [m.server_instance, m]));
  const info = (host?.info ?? {}) as Record<string, string | number>;
  const versions = ((host?.info as { versions?: Record<string, string> } | undefined)?.versions ?? {}) as Record<string, string>;
  const busy = (host?.info as { busy?: string | null } | undefined)?.busy ?? null;
  const siteBundle = getAgentBundle().version;
  const cpu = Number(info.cpu_load);

  return (
    <div className="space-y-8">
      <LiveRefresh intervalMs={5000} />
      <AdminHeader
        eyebrow="F16 Control"
        title="Серверы"
        description={host?.lan_ip ? `Серверный ПК ${host.lan_ip}` : undefined}
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
        <AlertRow tone="warn" title="Выполняется">
          {busy}. Серверы могут быть недоступны.
        </AlertRow>
      )}

      {/* хост */}
      <div className="rounded-xl border border-line bg-surface grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 divide-x divide-line">
        <div className="p-4"><Metric label="CPU" value={info.cpu_load != null ? `${info.cpu_load}%` : "—"} tone={cpu > 85 ? "danger" : cpu > 65 ? "warn" : undefined} /></div>
        <div className="p-4"><Metric label="RAM" value={info.ram_used_gb != null ? `${info.ram_used_gb}` : "—"} hint={info.ram_total_gb ? `из ${info.ram_total_gb} GB` : undefined} /></div>
        <div className="p-4"><Metric label="Диск D" value={info.disk_free_gb != null ? `${info.disk_free_gb}` : "—"} hint="GB свободно" /></div>
        <div className="p-4"><Metric label="CS2 build" value={info.cs2_build ?? "—"} /></div>
        <div className="p-4"><Metric label="MatchZy" value={versions.matchzy ?? "—"} /></div>
        <div className="p-4"><Metric label="CSSharp" value={versions.counterstrikesharp ?? "—"} hint={versions.metamod ? `Metamod ${versions.metamod}` : undefined} /></div>
        <div className="p-4">
          <Metric
            label="Агент"
            value={info.agent_version ? String(info.agent_version).slice(0, 7) : "—"}
            tone={info.agent_version === siteBundle ? "ok" : "warn"}
            hint={info.agent_version && info.agent_version !== siteBundle ? "обновится сам" : "актуален"}
          />
        </div>
      </div>

      {/* инстансы */}
      <Panel title="Инстансы">
        <div className="rounded-xl border border-line bg-surface divide-y divide-line overflow-x-auto">
          <div className="min-w-[900px] grid grid-cols-[150px_120px_minmax(0,1fr)_150px_90px_220px] gap-4 px-4 h-9 items-center text-[12px] text-fg-3">
            <span>Инстанс</span>
            <span>Состояние</span>
            <span>Матч</span>
            <span>Карта</span>
            <span className="text-right">Игроки</span>
            <span className="text-right">Действия</span>
          </div>
          {instances.map((s) => {
            const st: { text: string; tone: Tone } = !s.running
              ? s.role === "reserve"
                ? { text: "Резерв", tone: "muted" }
                : { text: "Выключен", tone: "danger" }
              : (stateLabel[s.gamestate ?? "none"] ?? { text: s.gamestate ?? "?", tone: "muted" });
            const m = assigned.get(s.name);
            const live = st.text === "LIVE";
            return (
              <div
                key={s.name}
                className={cn(
                  "min-w-[900px] grid grid-cols-[150px_120px_minmax(0,1fr)_150px_90px_220px] gap-4 px-4 h-14 items-center text-[13px]",
                  live && "bg-danger/[0.04]",
                )}
              >
                <div>
                  <div className="num font-semibold text-fg">{s.name}</div>
                  <div className="num text-[11px] text-fg-3">
                    :{s.port}
                    {s.role === "reserve" ? " · резерв" : ""}
                  </div>
                </div>
                <span className={cn("flex items-center gap-2", toneText[st.tone])}>
                  <Dot tone={st.tone} pulse={live} />
                  {st.text}
                </span>
                <div className="min-w-0 truncate">
                  {m ? (
                    <>
                      <Link href={`/admin/matches/${m.id}`} className="text-fg hover:text-accent">
                        #{m.number} {m.team1?.tag} vs {m.team2?.tag}
                      </Link>
                      {m.server_state !== "ready" && (
                        <span className={cn("ml-2 text-[12px]", m.server_state === "error" ? "text-danger" : "text-warn")}>{m.server_state}</span>
                      )}
                    </>
                  ) : (
                    <span className="text-fg-3">—</span>
                  )}
                </div>
                <span className="num text-fg-2 truncate">{s.map ?? "—"}</span>
                <span className="num text-right">{s.running ? `${Math.max(0, (s.players ?? 0) - 1)}/10` : "—"}</span>
                <div className="flex justify-end gap-1">
                  {(s.running ? ["end_match", "restart", "stop"] : ["start"]).map((type) => (
                    <ActionForm key={type} action={serverCommand}>
                      <input type="hidden" name="instance" value={s.name} />
                      <input type="hidden" name="type" value={type} />
                      <SubmitButton
                        size="sm"
                        variant={type === "start" ? "secondary" : "ghost"}
                        className={type === "stop" ? "text-danger/80 hover:text-danger" : undefined}
                        confirm={
                          type === "start"
                            ? undefined
                            : {
                                stop: `Остановить ${s.name}? Матч на нём прервётся.`,
                                restart: `Перезапустить ${s.name}?`,
                                end_match: `Снять матч с ${s.name}?`,
                              }[type]
                        }
                      >
                        {{ start: "Запустить", stop: "Стоп", restart: "Рестарт", end_match: "Снять матч" }[type]}
                      </SubmitButton>
                    </ActionForm>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-8">
        <Panel title="RCON">
          <ActionForm action={serverRcon}>
            <div className="flex flex-wrap gap-2">
              <select name="instance" className="field w-32">
                {instances.map((s) => (
                  <option key={s.name}>{s.name}</option>
                ))}
              </select>
              <input name="command" placeholder="css_plugins list" className="field num flex-1 min-w-[200px]" />
              <SubmitButton variant="secondary">Выполнить</SubmitButton>
            </div>
            <p className="mt-2 text-[12px] text-fg-3">Ответ появится в журнале команд ниже.</p>
          </ActionForm>
        </Panel>

        <Panel title="Обслуживание">
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
        </Panel>
      </div>

      <Panel title="Журнал команд агенту">
        {(commands ?? []).length === 0 ? (
          <p className="text-[13px] text-fg-3">Команд ещё не было.</p>
        ) : (
          <div className="rounded-xl border border-line bg-[#05080d] overflow-x-auto">
            <div className="min-w-[820px] py-2 font-mono text-[12px] leading-[22px]">
              {((commands ?? []) as AgentCommand[]).map((c) => (
                <div key={c.id} className="flex gap-4 px-4 hover:bg-white/[0.03]">
                  <span className="text-fg-3 shrink-0 w-[124px] whitespace-nowrap">{formatShortDateTime(c.created_at)}</span>
                  <span
                    className={cn(
                      "shrink-0 w-12",
                      c.status === "done" ? "text-ok" : c.status === "error" ? "text-danger" : "text-warn",
                    )}
                  >
                    {c.status}
                  </span>
                  <span className="text-fg-3 shrink-0 w-16">{c.instance ?? "host"}</span>
                  <span className="text-fg-2 shrink-0 max-w-[260px] truncate">
                    {c.type}
                    {c.type === "rcon" ? ` ${String(c.payload.command)}` : ""}
                  </span>
                  <span className="text-fg-3 min-w-0 flex-1">
                    {c.result && c.result.length > 100 ? (
                      <details>
                        <summary className="cursor-pointer truncate hover:text-fg-2">{c.result.split(/\r?\n/)[0].slice(0, 100)}…</summary>
                        <pre className="mt-1 mb-2 max-h-64 overflow-auto whitespace-pre-wrap break-all text-fg-2">{c.result}</pre>
                      </details>
                    ) : (
                      <span className="whitespace-pre-wrap break-all">{c.result ?? ""}</span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Panel>
    </div>
  );
}
