import type { Metadata } from "next";
import Link from "next/link";
import { hostCommand, serverCommand, serverRcon } from "@/app/actions/admin-server";
import { getAgentBundle } from "@/lib/agent-bundle";
import { formatShortDateTime } from "@/lib/format";
import { getServerState, type AgentCommand } from "@/lib/server-control";
import { db } from "@/lib/supabase";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { Card, Notice, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Серверы" };

const stateLabel: Record<string, { text: string; tone: "neutral" | "ok" | "warn" | "danger" | "live" | "accent" }> = {
  none: { text: "Free", tone: "ok" },
  pre_veto: { text: "Setup", tone: "accent" },
  veto: { text: "Setup", tone: "accent" },
  warmup: { text: "Warmup", tone: "warn" },
  knife: { text: "Knife", tone: "warn" },
  waiting_for_knife_decision: { text: "Knife", tone: "warn" },
  going_live: { text: "Going live", tone: "live" },
  live: { text: "Live", tone: "live" },
  pending_restore: { text: "Restore", tone: "warn" },
  post_game: { text: "Post game", tone: "neutral" },
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

  return (
    <div className="space-y-8">
      <LiveRefresh intervalMs={5000} />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Инфраструктура</div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Серверы</h1>
        </div>
        <Pill tone={online ? "ok" : "danger"} dot>
          Agent {online ? "online" : "offline"}
        </Pill>
      </div>

      {!online && (
        <Notice tone="danger">
          F16 Server Agent не на связи{host?.last_seen_at ? ` с ${formatShortDateTime(host.last_seen_at)}` : ""}. Запустите{" "}
          <span className="num">D:\cs2server\F16-agent.bat</span> на серверном ПК.
        </Notice>
      )}

      {host && (
        <Card className="p-5 grid grid-cols-2 sm:grid-cols-5 gap-4 text-sm">
          <div><div className="label">LAN IP</div><div className="mt-1 num">{host.lan_ip ?? "—"}</div></div>
          <div><div className="label">CPU</div><div className="mt-1 num">{info.cpu_load ?? "—"}%</div></div>
          <div><div className="label">RAM</div><div className="mt-1 num">{info.ram_used_gb ?? "—"} / {info.ram_total_gb ?? "—"} GB</div></div>
          <div><div className="label">Диск D</div><div className="mt-1 num">{info.disk_free_gb ?? "—"} GB своб.</div></div>
          <div><div className="label">CS2 build</div><div className="mt-1 num">{info.cs2_build ?? "—"}</div></div>
        </Card>
      )}

      <Card className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="label mb-3">Обслуживание</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-8 gap-y-2 text-sm">
              <div><span className="text-fg-3">Metamod</span> <span className="num">{versions.metamod ?? "—"}</span></div>
              <div><span className="text-fg-3">CSSharp</span> <span className="num">{versions.counterstrikesharp ?? "—"}</span></div>
              <div><span className="text-fg-3">MatchZy</span> <span className="num">{versions.matchzy ?? "—"}</span></div>
              <div>
                <span className="text-fg-3">Агент</span>{" "}
                <span className={`num ${info.agent_version === siteBundle ? "text-ok" : "text-warn"}`}>
                  {info.agent_version ?? "—"}
                </span>
              </div>
            </div>
            {info.agent_version && info.agent_version !== siteBundle && (
              <p className="mt-2 text-xs text-warn">Агент обновится до {siteBundle} автоматически в течение нескольких секунд.</p>
            )}
            {busy && <p className="mt-3 text-sm text-warn">Выполняется: {busy}. Серверы могут быть недоступны.</p>}
          </div>
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
        </div>
        <p className="mt-4 text-xs text-fg-3">
          Обновления запускаются, только если нет активных матчей. Код агента, скрипты и конфиги CS2 (MatchZy, инстансы)
          берутся из репозитория и доезжают до серверного ПК автоматически после деплоя.
        </p>
      </Card>

      <div className="card overflow-x-auto">
        <table className="tbl min-w-[860px]">
          <thead>
            <tr>
              <th>Инстанс</th>
              <th>Порт</th>
              <th>Состояние</th>
              <th>Матч</th>
              <th>Карта</th>
              <th className="text-right">Игроки</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {instances.map((s) => {
              const st = !s.running
                ? s.role === "reserve"
                  ? { text: "Standby", tone: "neutral" as const }
                  : { text: "Offline", tone: "danger" as const }
                : (stateLabel[s.gamestate ?? "none"] ?? { text: s.gamestate ?? "?", tone: "neutral" as const });
              const m = assigned.get(s.name);
              return (
                <tr key={s.name}>
                  <td className="font-semibold text-fg num">
                    {s.name} {s.role === "reserve" && <span className="text-[10px] text-fg-3 uppercase">резерв</span>}
                  </td>
                  <td className="num text-[13px]">{s.port}</td>
                  <td><Pill tone={st.tone} dot>{st.text}</Pill></td>
                  <td>
                    {m ? (
                      <Link href={`/admin/matches/${m.id}`} className="text-accent hover:underline">
                        #{m.number} {m.team1?.tag} vs {m.team2?.tag}
                      </Link>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                    {m && m.server_state !== "ready" && <span className="ml-2 text-xs text-warn">{m.server_state}</span>}
                  </td>
                  <td className="text-[13px]">{s.map ?? "—"}</td>
                  <td className="text-right num">{s.running ? `${Math.max(0, (s.players ?? 0) - 1)}/10` : "—"}</td>
                  <td className="text-right">
                    <div className="inline-flex gap-1">
                      {(s.running ? ["restart", "end_match", "stop"] : ["start"]).map((type) => (
                        <ActionForm key={type} action={serverCommand}>
                          <input type="hidden" name="instance" value={s.name} />
                          <input type="hidden" name="type" value={type} />
                          <SubmitButton
                            size="sm"
                            variant={type === "start" ? "secondary" : "ghost"}
                            confirm={type === "start" ? undefined : `${s.name}: ${type}?`}
                          >
                            {{ start: "Start", stop: "Stop", restart: "Restart", end_match: "End match" }[type]}
                          </SubmitButton>
                        </ActionForm>
                      ))}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Card className="p-6">
        <div className="label mb-4">RCON</div>
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
        </ActionForm>
      </Card>

      <section>
        <div className="label mb-3">Журнал команд агенту</div>
        {(commands ?? []).length === 0 ? (
          <p className="text-sm text-fg-3">Команд ещё не было.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="tbl min-w-[720px] text-[13px]">
              <tbody>
                {((commands ?? []) as AgentCommand[]).map((c) => (
                  <tr key={c.id}>
                    <td className="num text-fg-3 whitespace-nowrap">{formatShortDateTime(c.created_at)}</td>
                    <td className="num">{c.instance ?? "host"}</td>
                    <td className="num text-fg">{c.type}{c.type === "rcon" ? ` ${String(c.payload.command)}` : ""}</td>
                    <td>
                      <Pill tone={c.status === "done" ? "ok" : c.status === "error" ? "danger" : "warn"}>{c.status}</Pill>
                    </td>
                    <td className="num text-xs text-fg-3 max-w-[380px]">
                      {c.result && c.result.length > 90 ? (
                        <details>
                          <summary className="cursor-pointer truncate hover:text-fg-2">{c.result.split(/\r?\n/)[0].slice(0, 90)}…</summary>
                          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-lg bg-bg-2 border border-line p-3">{c.result}</pre>
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
      </section>
    </div>
  );
}
