import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import {
  forceResult,
  reopenMatch,
  resetVeto,
  saveMapScore,
  setBestOf,
  setMatchLive,
  setServerInfo,
  startVeto,
} from "@/app/actions/admin-match";
import { sendMatchToServer, serverCommand, serverRcon } from "@/app/actions/admin-server";
import { resolveDispute } from "@/app/actions/dispute";
import { replaceRosterPlayer, setSchedule } from "@/app/actions/admin-match";
import { getMatchRosters } from "@/lib/matches";
import { db } from "@/lib/supabase";
import type { Dispute, Player } from "@/lib/types";
import { formatDateTime, mapName, toLocalInput } from "@/lib/format";
import { getServerState } from "@/lib/server-control";
import { applyVetoTimeouts, getMatch } from "@/lib/matches";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChipInput, PlayerPicker, Stepper } from "@/components/pickers";
import { LiveRefresh } from "@/components/live-refresh";
import { MatchStatusBadge } from "@/components/match-bits";
import { Avatar, Field, FaceitLevel, TeamLogo, cn } from "@/components/ui";
import { AdminHeader, Dot, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Матч — F16 Control" };

/** Блок действий в правой колонке */
function ActionBlock({ title, children, tone }: { title: string; children: ReactNode; tone?: "danger" }) {
  return (
    <div className={cn("p-5 space-y-3", tone === "danger" && "bg-danger/[0.04] border-t border-danger/20")}>
      <div className={cn("text-[10px] font-medium uppercase tracking-[0.24em]", tone === "danger" ? "text-danger" : "text-[#7f93b0]")}>{title}</div>
      {children}
    </div>
  );
}

/** Время запроса (серверный компонент рендерится один раз на запрос) */
function serverNow() {
  return Date.now();
}

/**
 * «Следующий шаг» — одно главное действие оператора для текущего этапа матча.
 * Использует те же серверные действия, что и правая колонка.
 */
function NextStep({
  id,
  status,
  serverInstance,
  serverState,
  serverReadyAt,
  vetoSteps,
  agentOnline,
  liveMap,
  score,
  winner,
}: {
  id: string;
  status: string;
  serverInstance: string | null;
  serverState: string | null;
  serverReadyAt: string | null;
  vetoSteps: number;
  agentOnline: boolean;
  liveMap: string | null;
  score: string;
  winner: string | null;
}) {
  let tone: "accent" | "warn" | "danger" | "ok" | "muted" = "accent";
  let title: string;
  let text: ReactNode = null;
  let action: ReactNode = null;

  if (status === "pending") {
    tone = "muted";
    title = "Ждём соперников";
    text = "Матч откроется, когда определятся обе команды.";
  } else if (status === "upcoming") {
    title = "Начать вето";
    text = "Команды готовы. На шаг вето — 60 секунд.";
    action = (
      <ActionForm action={startVeto}>
        <input type="hidden" name="matchId" value={id} />
        <SubmitButton size="sm">Начать вето</SubmitButton>
      </ActionForm>
    );
  } else if (status === "veto") {
    tone = "warn";
    title = `Идёт вето · шаг ${vetoSteps + 1}`;
    text = "Капитаны выбирают карты на странице матча.";
    action = (
      <Link href={`/matches/${id}`} className="text-[13px] text-accent hover:underline">
        Смотреть вето →
      </Link>
    );
  } else if (status === "ready" && (!serverInstance || serverState === "error")) {
    tone = serverState === "error" ? "danger" : "accent";
    title = serverState === "error" ? "Сервер не загрузил матч" : "Отправить на сервер";
    text = !agentOnline
      ? "Агент не на связи — сначала проверьте серверный ПК."
      : serverState === "error"
        ? "Перенесите матч на свободный сервер."
        : "Сайт выберет свободный сервер и выдаст адрес игрокам.";
    action = (
      <ActionForm action={sendMatchToServer}>
        <input type="hidden" name="matchId" value={id} />
        <input type="hidden" name="instance" value="" />
        <SubmitButton size="sm" variant={serverState === "error" ? "danger" : "primary"}>
          {serverState === "error" ? "Перенести на свободный" : "Отправить на сервер"}
        </SubmitButton>
      </ActionForm>
    );
  } else if (status === "ready" && serverState !== "ready") {
    tone = "warn";
    title = `${serverInstance} загружает матч`;
    text = "Адрес появится у игроков, когда на сервере будет нужная карта.";
  } else if (status === "ready") {
    const waited = serverReadyAt ? Math.floor((serverNow() - new Date(serverReadyAt).getTime()) / 60000) : 0;
    tone = waited >= 15 ? "danger" : waited >= 10 ? "warn" : "ok";
    title = waited >= 15 ? `Неявка: ждём ${waited} мин` : `Ждём игроков · ${waited} мин`;
    text = `Сервер ${serverInstance} готов. Матч станет LIVE сам, когда игроки начнут.`;
    action = (
      <ActionForm action={setMatchLive}>
        <input type="hidden" name="matchId" value={id} />
        <SubmitButton size="sm" variant="secondary">
          Отметить LIVE вручную
        </SubmitButton>
      </ActionForm>
    );
  } else if (status === "live") {
    tone = "danger";
    title = `LIVE · ${score}`;
    text = liveMap ?? "Матч идёт на сервере.";
    action = (
      <a href="#maps" className="text-[13px] text-accent hover:underline">
        Счёт карт ↓
      </a>
    );
  } else {
    tone = "ok";
    title = winner ? `Завершён · победа ${winner}` : "Матч завершён";
    text = `Итог ${score}.`;
  }

  const bar = { accent: "before:bg-accent", warn: "before:bg-warn", danger: "before:bg-danger", ok: "before:bg-ok", muted: "before:bg-fg-3/60" }[tone];
  const label = { accent: "text-accent", warn: "text-warn", danger: "text-danger", ok: "text-ok", muted: "text-fg-3" }[tone];

  return (
    <div
      className={cn(
        "relative flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 pl-6 pr-5 py-4",
        "before:absolute before:left-0 before:inset-y-3 before:w-[3px] before:rounded-full",
        bar,
      )}
    >
      <div className="min-w-0 flex-1">
        <div className={cn("text-[10px] font-medium uppercase tracking-[0.24em]", label)}>Следующий шаг</div>
        <div className="mt-1.5 text-[17px] font-semibold tracking-[-0.01em]">{title}</div>
        {text && <div className="mt-0.5 text-[13px] text-fg-3">{text}</div>}
      </div>
      {action}
    </div>
  );
}

export default async function AdminMatchPage(props: PageProps<"/admin/matches/[id]">) {
  const { id } = await props.params;
  await applyVetoTimeouts(id);
  const m = await getMatch(id);
  if (!m) notFound();
  const [servers, rosters, disputesRes] = await Promise.all([
    getServerState(),
    getMatchRosters(m),
    db().from("disputes").select("*, opener:players!disputes_opened_by_fkey(nickname)").eq("match_id", m.id).order("created_at", { ascending: false }),
  ]);
  // для замены: все игроки платформы + участники обеих команд, которых нет в турнирном составе
  const [{ data: playersData }, { data: membersData }] = await Promise.all([
    db().from("players").select("steam_id, nickname").eq("is_banned", false).order("nickname").limit(1000),
    db()
      .from("team_members")
      .select("team_id, player:players(steam_id, nickname)")
      .in("team_id", [m.team1_id, m.team2_id].filter(Boolean) as string[])
      .is("left_at", null),
  ]);
  const allPlayers = (playersData ?? []) as { steam_id: string; nickname: string }[];
  const inRoster = new Set([...rosters.team1, ...rosters.team2].map((r) => r.player.steam_id));
  const bench = ((membersData ?? []) as unknown as { team_id: string; player: { steam_id: string; nickname: string } }[])
    .filter((x) => !inRoster.has(x.player.steam_id))
    .map((x) => ({ ...x.player, hint: x.team_id === m.team1_id ? (m.team1?.tag ?? "") : (m.team2?.tag ?? "") }));
  const disputes = (disputesRes.data ?? []) as (Dispute & { opener: Pick<Player, "nickname"> | null })[];
  const t1 = m.team1?.name ?? "TBD";
  const t2 = m.team2?.name ?? "TBD";
  const inst = m.server_instance ? servers.instances.find((i) => i.name === m.server_instance) : undefined;
  const currentMap = m.maps.find((x) => x.status === "live") ?? m.maps.find((x) => x.status !== "finished");
  const openDisputes = disputes.filter((d) => d.status === "open").length;

  const serverState = !m.server_instance
    ? { text: "не назначен", tone: "muted" as const }
    : m.server_state === "ready"
      ? { text: "готов", tone: "ok" as const }
      : m.server_state === "error"
        ? { text: "ошибка", tone: "danger" as const }
        : { text: "загружается", tone: "warn" as const };

  return (
    <div className="space-y-6">
      {(["veto", "live"].includes(m.status) || m.server_state === "loading") && <LiveRefresh intervalMs={4000} />}
      <AdminHeader
        back={{ href: "/admin/matches", label: "Матчи" }}
        eyebrow={`${m.tournament.name} · матч #${m.number}`}
        title={
          <span className="flex flex-wrap items-center gap-3">
            {t1} <span className="text-fg-3 font-normal">vs</span> {t2}
            <MatchStatusBadge status={m.status} />
          </span>
        }
        actions={
          <Link href={`/matches/${m.id}`} className="text-[12px] text-fg-3 hover:text-fg">
            Публичная страница ↗
          </Link>
        }
      />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_360px] gap-6 items-start">
        {/* ── состояние ── */}
        <div className="space-y-6 min-w-0">
          <NextStep
            id={m.id}
            status={m.status}
            serverInstance={m.server_instance}
            serverState={m.server_state}
            serverReadyAt={m.server_ready_at}
            vetoSteps={m.veto.length}
            agentOnline={servers.online}
            liveMap={currentMap ? `Карта ${currentMap.map_number} · ${mapName(currentMap.map_name)}` : null}
            score={`${m.team1_score}:${m.team2_score}`}
            winner={m.winner_id ? (m.winner_id === m.team1_id ? t1 : t2) : null}
          />

          {/* табло */}
          <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-6 px-7 py-7">
              <div className="flex items-center gap-3 min-w-0">
                {m.team1 && <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={52} />}
                <span className={cn("text-[18px] font-semibold truncate", m.winner_id && m.winner_id === m.team1_id && "text-ok")}>{t1}</span>
              </div>
              <div className="num text-[44px] font-semibold tracking-[-0.03em] text-center leading-none">
                {["live", "finished"].includes(m.status) ? `${m.team1_score} : ${m.team2_score}` : "— : —"}
              </div>
              <div className="flex items-center gap-3 justify-end min-w-0">
                <span className={cn("text-[18px] font-semibold truncate text-right", m.winner_id && m.winner_id === m.team2_id && "text-ok")}>{t2}</span>
                {m.team2 && <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={52} />}
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 border-t border-white/[0.06] divide-x divide-white/[0.06] text-[13px]">
              <div className="px-5 py-3">
                <div className="text-[12px] text-fg-3">Формат</div>
                <div className="mt-0.5">BO{m.best_of}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-[12px] text-fg-3">Карта</div>
                <div className="mt-0.5 truncate">{currentMap ? mapName(currentMap.map_name) : "—"}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-[12px] text-fg-3">Время</div>
                <div className="mt-0.5 num">{m.scheduled_at ? formatDateTime(m.scheduled_at) : "—"}</div>
              </div>
              <div className="px-5 py-3">
                <div className="text-[12px] text-fg-3">Вето</div>
                <div className="mt-0.5">{m.status === "veto" ? `идёт · ${m.veto.length} шаг.` : m.veto.length ? "завершено" : "—"}</div>
              </div>
            </div>
          </div>

          {/* сервер */}
          <Panel title="Сервер">
            <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 grid grid-cols-2 md:grid-cols-5 divide-x divide-white/[0.06] text-[13px]">
              <div className="px-4 py-3">
                <div className="text-[12px] text-fg-3">Инстанс</div>
                <div className="mt-0.5 num">{m.server_instance ?? "—"}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[12px] text-fg-3">Состояние</div>
                <div className="mt-0.5 flex items-center gap-2">
                  <Dot tone={serverState.tone} pulse={serverState.tone === "warn"} />
                  {serverState.text}
                </div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[12px] text-fg-3">MatchZy</div>
                <div className="mt-0.5 num">{inst ? (inst.running ? (inst.gamestate ?? "none") : "выключен") : "—"}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[12px] text-fg-3">Карта на сервере</div>
                <div className="mt-0.5 num truncate">{inst?.map ?? "—"}</div>
              </div>
              <div className="px-4 py-3">
                <div className="text-[12px] text-fg-3">Игроки</div>
                <div className="mt-0.5 num">{inst?.running ? Math.max(0, (inst.players ?? 0) - 1) : "—"}</div>
              </div>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
              <span className="flex items-center gap-1.5">
                <Dot tone={servers.online ? "ok" : "danger"} /> агент {servers.online ? "на связи" : "не на связи"}
              </span>
              {m.server_address && <span className="num">адрес у игроков: {m.server_address}</span>}
              {m.server_state === "error" && <span className="text-danger">ошибка загрузки — журнал команд на странице «Серверы»</span>}
            </div>
          </Panel>

          {/* карты */}
          {m.maps.length > 0 && (
            <Panel title="Карты" className="scroll-mt-6">
              <span id="maps" className="block -mt-2" />
              <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
                {m.maps.map((map) => (
                  <div key={map.id} className={cn("p-4", map.status === "live" && "bg-danger/[0.03]")}>
                    <div className="flex items-center gap-3 text-[13px]">
                      <span className="num text-fg-3 w-12">Map {map.map_number}</span>
                      <span className="flex-1 font-medium">{mapName(map.map_name)}</span>
                      {map.status === "finished" && (
                        <span className="num text-fg">
                          {map.team1_score} : {map.team2_score}
                        </span>
                      )}
                      <span className={cn("text-[12px] w-16 text-right", map.status === "live" ? "text-danger" : "text-fg-3")}>
                        {map.status === "finished" ? "сыграна" : map.status === "live" ? "идёт" : "ожидает"}
                      </span>
                    </div>
                    {m.status === "live" && map.status === "live" && (
                      <ActionForm action={saveMapScore} className="mt-3">
                        <input type="hidden" name="matchId" value={m.id} />
                        <input type="hidden" name="mapId" value={map.id} />
                        <div className="flex flex-wrap items-end gap-3">
                          <Stepper name="score1" label={t1} defaultValue={map.team1_score} />
                          <Stepper name="score2" label={t2} defaultValue={map.team2_score} />
                          <SubmitButton size="sm" variant="secondary" name="finish" value="0">
                            Обновить счёт
                          </SubmitButton>
                          <SubmitButton size="sm" name="finish" value="1" confirm="Завершить карту с этим счётом?">
                            Карта завершена
                          </SubmitButton>
                        </div>
                      </ActionForm>
                    )}
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {m.status === "finished" && (
            <div className="border-l-2 border-ok bg-white/[0.02] rounded-r-lg px-4 py-3 text-[13px] text-fg-2">
              Матч завершён: {m.winner_id === m.team1_id ? t1 : t2} побеждает {m.team1_score}:{m.team2_score}
              {m.is_walkover ? " (техническая победа)" : ""}.
            </div>
          )}

          {/* составы */}
          {(m.team1_id || m.team2_id) && (
            <Panel title="Составы">
              <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]">
                {[
                  { name: t1, list: rosters.team1 },
                  { name: t2, list: rosters.team2 },
                ].map((side) => (
                  <div key={side.name} className="p-4">
                    <div className="text-[13px] font-semibold mb-2">{side.name}</div>
                    <ul className="space-y-1">
                      {side.list.map((r) => (
                        <li key={r.player.id} className="flex items-center gap-2.5 h-8 text-[13px]">
                          <Avatar src={r.player.avatar_url} name={r.player.nickname} size={22} />
                          <span className="flex-1 truncate">{r.player.nickname}</span>
                          {r.role === "sub" && <span className="text-[11px] text-fg-3">запас</span>}
                          <FaceitLevel level={r.player.faceit_level} />
                          <span className="num text-[11px] text-fg-3 hidden md:block">{r.player.steam_id}</span>
                        </li>
                      ))}
                      {side.list.length === 0 && <li className="text-[13px] text-fg-3">—</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* споры */}
          <Panel
            title={
              <span className="flex items-center gap-2">
                Споры {m.under_review && <span className="text-[11px] font-semibold text-warn">на рассмотрении</span>}
              </span>
            }
          >
            {disputes.length === 0 ? (
              <p className="text-[13px] text-fg-3">Споров нет. Капитаны могут открыть спор на странице матча.</p>
            ) : (
              <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
                {disputes.map((d) => (
                  <div key={d.id} className="p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-[12px] text-fg-3">
                      <span>
                        {d.opener?.nickname ?? "—"}
                        {d.team_id ? ` · ${d.team_id === m.team1_id ? t1 : t2}` : " · админ"} · {formatDateTime(d.created_at)}
                      </span>
                      <span className={d.status === "open" ? "text-warn" : d.status === "resolved" ? "text-ok" : "text-fg-3"}>
                        {d.status === "open" ? "открыт" : d.status === "resolved" ? "принят" : "отклонён"}
                      </span>
                    </div>
                    <p className="mt-2 text-[13px] text-fg whitespace-pre-line">{d.reason}</p>
                    {d.decision && (
                      <p className="mt-2 text-[13px] text-fg-2">
                        Решение: {d.decision}
                        {d.result_after ? " · результат изменён" : ""}
                      </p>
                    )}
                    {d.status === "open" && (
                      <ActionForm action={resolveDispute} className="mt-3">
                        <input type="hidden" name="disputeId" value={d.id} />
                        <textarea name="decision" rows={2} placeholder="Решение (увидят обе команды)" className="field resize-y text-[13px]" />
                        <div className="mt-2 flex flex-wrap gap-2">
                          <SubmitButton size="sm" name="outcome" value="resolved">
                            Принять
                          </SubmitButton>
                          <SubmitButton size="sm" variant="secondary" name="outcome" value="rejected">
                            Отклонить
                          </SubmitButton>
                        </div>
                        <p className="mt-2 text-[12px] text-fg-3">
                          Чтобы изменить результат — сначала «Отменить результат» / «Тех. победа» справа, затем закройте спор.
                        </p>
                      </ActionForm>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Panel>
        </div>

        {/* ── действия ── */}
        <aside className="xl:sticky xl:top-6 overflow-hidden rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 divide-y divide-white/[0.06]">
          {openDisputes > 0 && (
            <div className="px-4 py-3 text-[12px] text-warn">Открытых споров: {openDisputes}</div>
          )}

          <ActionBlock title="Формат и вето">
            {["pending", "upcoming"].includes(m.status) && (
              <div className="flex flex-wrap gap-1.5">
                {[1, 3, 5].map((bo) => (
                  <ActionForm key={bo} action={setBestOf}>
                    <input type="hidden" name="matchId" value={m.id} />
                    <input type="hidden" name="bestOf" value={bo} />
                    <SubmitButton size="sm" variant={m.best_of === bo ? "primary" : "secondary"}>
                      BO{bo}
                    </SubmitButton>
                  </ActionForm>
                ))}
              </div>
            )}
            {m.status === "pending" && <p className="text-[12px] text-fg-3">Ждём, пока определятся обе команды.</p>}
            {m.status === "upcoming" && (
              <ActionForm action={startVeto}>
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton size="sm">Начать вето</SubmitButton>
                <p className="mt-2 text-[12px] text-fg-3">На шаг — 60 секунд, потом карта выбирается случайно.</p>
              </ActionForm>
            )}
            {m.status === "veto" && (
              <p className="text-[12px] text-fg-2">
                Идёт вето.{" "}
                <Link href={`/matches/${m.id}`} className="text-accent hover:underline">
                  Смотреть →
                </Link>
              </p>
            )}
            {["ready", "live", "finished"].includes(m.status) && m.maps.length > 0 && (
              <p className="text-[12px] text-fg-2">{m.maps.map((x) => mapName(x.map_name)).join(" → ")}</p>
            )}
            {["veto", "ready"].includes(m.status) && (
              <ActionForm action={resetVeto}>
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton size="sm" variant="ghost" confirm="Сбросить вето и начать заново?">
                  Сбросить вето
                </SubmitButton>
              </ActionForm>
            )}
          </ActionBlock>

          <ActionBlock title="Время матча">
            <ActionForm action={setSchedule}>
              <input type="hidden" name="matchId" value={m.id} />
              <div className="flex gap-2">
                <input type="datetime-local" name="scheduledAt" defaultValue={toLocalInput(m.scheduled_at)} className="field h-8 text-[13px]" />
                <SubmitButton size="sm" variant="secondary">
                  OK
                </SubmitButton>
              </div>
              <p className="mt-1.5 text-[12px] text-fg-3">Время Алматы. Капитаны получат уведомление.</p>
            </ActionForm>
          </ActionBlock>

          <ActionBlock title="Сервер">
            {["ready", "live"].includes(m.status) ? (
              <ActionForm action={sendMatchToServer}>
                <input type="hidden" name="matchId" value={m.id} />
                <select name="instance" className="field h-8 text-[13px]" defaultValue="">
                  <option value="">Свободный сервер автоматически</option>
                  {servers.instances.map((i) => (
                    <option key={i.name} value={i.name}>
                      {i.name} · {!i.running ? "выключен" : (i.gamestate ?? "none") === "none" ? "свободен" : i.gamestate}
                      {i.role === "reserve" ? " · резерв" : ""}
                    </option>
                  ))}
                </select>
                <div className="mt-2">
                  <SubmitButton size="sm" variant={m.server_instance ? "secondary" : "primary"}>
                    {m.server_instance ? "Перенести на другой сервер" : "Отправить на сервер"}
                  </SubmitButton>
                </div>
              </ActionForm>
            ) : (
              <p className="text-[12px] text-fg-3">Сервер назначается после вето.</p>
            )}
            {m.status === "ready" && (
              <ActionForm action={setMatchLive}>
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton size="sm" variant="secondary">
                  Матч начался → LIVE
                </SubmitButton>
              </ActionForm>
            )}
            {m.server_instance && inst?.running && (
              <div className="pt-1 space-y-2">
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { cmd: "css_forcepause", label: "Тех. пауза" },
                    { cmd: "css_forceunpause", label: "Снять паузу" },
                  ].map((c) => (
                    <ActionForm key={c.cmd} action={serverRcon}>
                      <input type="hidden" name="instance" value={m.server_instance!} />
                      <input type="hidden" name="command" value={c.cmd} />
                      <SubmitButton size="sm" variant="secondary">
                        {c.label}
                      </SubmitButton>
                    </ActionForm>
                  ))}
                </div>
                <ActionForm action={serverRcon} className="flex gap-1.5">
                  <input type="hidden" name="instance" value={m.server_instance} />
                  <input name="command" placeholder="RCON: css_restore 5" className="field h-8 num text-[12px]" />
                  <SubmitButton size="sm" variant="ghost">
                    ↵
                  </SubmitButton>
                </ActionForm>
              </div>
            )}
            <details>
              <summary className="cursor-pointer text-[12px] text-fg-3 hover:text-fg-2">Адрес вручную (если агент недоступен)</summary>
              <ActionForm action={setServerInfo} className="mt-2 space-y-2">
                <input type="hidden" name="matchId" value={m.id} />
                <Field label="Адрес (ip:port)">
                  <input name="address" defaultValue={m.server_address ?? ""} placeholder="192.168.0.159:27015" className="field h-8 num text-[13px]" />
                </Field>
                <Field label="Пароль">
                  <input name="password" defaultValue={m.server_password ?? ""} className="field h-8 num text-[13px]" />
                </Field>
                <SubmitButton size="sm" variant="secondary">
                  Сохранить
                </SubmitButton>
              </ActionForm>
            </details>
          </ActionBlock>

          {(m.team1_id || m.team2_id) && (
            <ActionBlock title="Замена игрока">
              <ActionForm action={replaceRosterPlayer} className="space-y-2">
                <input type="hidden" name="matchId" value={m.id} />
                <Field label="Кого заменить">
                  <select name="outPlayerId" className="field h-8 text-[13px]">
                    {[...rosters.team1, ...rosters.team2].map((r) => (
                      <option key={r.player.id} value={r.player.id}>
                        {r.player.nickname}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Новый игрок">
                  <PlayerPicker name="inSteamId" players={allPlayers} suggested={bench} />
                </Field>
                <Field label="Причина">
                  <ChipInput name="reason" chips={["Игрок не пришёл", "Техническая проблема", "Болезнь / травма"]} />
                </Field>
                <SubmitButton size="sm" variant="secondary" confirm="Заменить игрока в турнирном составе?">
                  Заменить
                </SubmitButton>
                <p className="text-[12px] text-fg-3">Игрок должен хотя бы раз войти через Steam. Если матч на сервере — замена сразу уйдёт в MatchZy.</p>
              </ActionForm>
            </ActionBlock>
          )}

          {/* опасные действия — отдельно, внизу */}
          {(m.server_instance || (m.team1_id && m.team2_id)) && (
            <ActionBlock title="Опасные действия" tone="danger">
              {m.server_instance && (
                <div className="flex flex-wrap gap-1.5">
                  <ActionForm action={serverCommand}>
                    <input type="hidden" name="instance" value={m.server_instance} />
                    <input type="hidden" name="type" value="restart" />
                    <SubmitButton size="sm" variant="ghost" confirm={`Перезапустить ${m.server_instance}? Матч придётся загрузить заново.`}>
                      Перезапустить инстанс
                    </SubmitButton>
                  </ActionForm>
                  <ActionForm action={serverCommand}>
                    <input type="hidden" name="instance" value={m.server_instance} />
                    <input type="hidden" name="type" value="end_match" />
                    <SubmitButton size="sm" variant="ghost" confirm={`Завершить матч на ${m.server_instance} (MatchZy end match)?`}>
                      Снять матч с сервера
                    </SubmitButton>
                  </ActionForm>
                </div>
              )}
              {m.team1_id && m.team2_id && m.status !== "finished" && (
                <ActionForm action={forceResult} className="space-y-2">
                  <input type="hidden" name="matchId" value={m.id} />
                  <Field label="Техническая победа">
                    <select name="winner" className="field h-8 text-[13px]">
                      <option value="">— победитель —</option>
                      <option value="1">{t1}</option>
                      <option value="2">{t2}</option>
                    </select>
                  </Field>
                  <ChipInput name="reason" chips={["Неявка команды", "Дисквалификация", "Отказ от игры", "Техническая проблема"]} placeholder="Причина" />
                  <SubmitButton size="sm" variant="danger" confirm="Зафиксировать техническую победу?">
                    Тех. победа
                  </SubmitButton>
                </ActionForm>
              )}
              {m.team1_id && m.team2_id && m.status === "finished" && (
                <ActionForm action={reopenMatch} className="space-y-2">
                  <input type="hidden" name="matchId" value={m.id} />
                  <ChipInput name="reason" chips={["Ошибка в счёте", "Решение по спору", "Сбой сервера"]} placeholder="Причина отмены результата" />
                  <SubmitButton size="sm" variant="danger" confirm="Отменить результат матча? Команды уберутся из следующих матчей.">
                    Отменить результат
                  </SubmitButton>
                  <p className="text-[12px] text-fg-3">Возможно, только пока следующие матчи не начались.</p>
                </ActionForm>
              )}
            </ActionBlock>
          )}
        </aside>
      </div>
    </div>
  );
}
