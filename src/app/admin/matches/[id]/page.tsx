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
import { formatDateTime, formatShortDateTime, mapName, toLocalInput } from "@/lib/format";
import { getServerState } from "@/lib/server-control";
import { applyVetoTimeouts, getMatch } from "@/lib/matches";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ChipInput, PlayerPicker, Stepper } from "@/components/pickers";
import { LiveRefresh } from "@/components/live-refresh";
import { Avatar, Field, FaceitLevel, TeamLogo, cn } from "@/components/ui";
import { MatchStatusChip } from "@/components/primitives";
import { ADMIN_CARD, AdminHeader, Dot } from "@/components/admin/control";
import { FactRow, Quiet, RailGroup, Section, SectionLink, Timeline, serverNow, type TimelineItem } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Матч — F16 Control" };

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
        "relative flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 pl-6 pr-5 py-4",
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
  await requireAdmin(); // права проверяются в каждой странице, не только в layout
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
  const scored = ["live", "finished"].includes(m.status);
  const vetoSorted = [...m.veto].sort((a, b) => a.step - b.step);

  const serverState = !m.server_instance
    ? { text: "не назначен", tone: "muted" as const }
    : m.server_state === "ready"
      ? { text: "готов", tone: "ok" as const }
      : m.server_state === "error"
        ? { text: "ошибка", tone: "danger" as const }
        : { text: "загружается", tone: "warn" as const };

  // хронология: вето → сервер → готов → live → итог
  const after = (st: string[]) => st.includes(m.status);
  const timeline: TimelineItem[] = [
    {
      label: "Вето",
      at: vetoSorted[0]?.created_at ?? null,
      state: m.status === "veto" ? "active" : vetoSorted.length || after(["ready", "live", "finished"]) ? "done" : "todo",
      note: vetoSorted.length ? `${vetoSorted.length} шаг.` : undefined,
    },
    {
      label: "Сервер",
      at: m.server_assigned_at,
      state: m.server_state === "error" ? "error" : m.server_state === "loading" ? "active" : m.server_assigned_at || after(["live", "finished"]) ? "done" : "todo",
      note: m.server_instance ?? undefined,
    },
    {
      label: "Готов",
      at: m.server_ready_at,
      state: m.status === "ready" && m.server_state === "ready" ? "active" : m.server_ready_at || after(["live", "finished"]) ? "done" : "todo",
      note: m.status === "ready" && m.server_ready_at ? `ждём ${Math.floor((serverNow() - new Date(m.server_ready_at).getTime()) / 60000)} мин` : undefined,
    },
    { label: "Live", at: m.started_at, state: m.status === "live" ? "active" : m.started_at || m.status === "finished" ? "done" : "todo" },
    {
      label: "Итог",
      at: m.finished_at,
      state: m.status === "finished" ? "done" : "todo",
      note: m.status === "finished" ? `${m.team1_score}:${m.team2_score}${m.is_walkover ? " · тех." : ""}` : undefined,
    },
  ];

  return (
    <div className="space-y-6">
      {(["veto", "live"].includes(m.status) || m.server_state === "loading" || m.status === "ready") && <LiveRefresh intervalMs={4000} />}
      <AdminHeader
        back={{ href: "/admin/matches", label: "Матчи" }}
        eyebrow={
          <Link href={`/admin/tournaments/${m.tournament_id}`} className="hover:text-fg">
            {m.tournament.name} · матч #{m.number} · раунд {m.round}
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            Пульт матча
            <MatchStatusChip status={m.status} />
            {openDisputes > 0 && <span className="text-[13px] font-medium text-warn">спор: {openDisputes}</span>}
          </span>
        }
        actions={
          <Link href={`/matches/${m.id}`} className="text-[12px] text-fg-3 hover:text-fg">
            Публичная страница ↗
          </Link>
        }
      />

      {/* ── табло ── */}
      <div className={cn(ADMIN_CARD, "relative overflow-hidden", m.status === "live" && "border-danger/25")}>
        {m.status === "live" && <span className="absolute inset-x-0 top-0 h-[3px] bg-danger animate-pulse" />}
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4 sm:gap-8 px-5 sm:px-8 py-7 sm:py-9">
          <div className="flex min-w-0 flex-col items-start gap-2 sm:flex-row sm:items-center sm:gap-4">
            {m.team1 && <TeamLogo src={m.team1.logo_url} tag={m.team1.tag} size={72} />}
            <div className="min-w-0">
              <div className={cn("line-clamp-2 break-words text-[15px] leading-tight sm:text-[24px] font-semibold tracking-[-0.01em]", m.winner_id && m.winner_id === m.team1_id && "text-ok")}>
                {t1}
              </div>
              <div className="text-[12px] text-fg-3">{m.team1?.tag ?? "—"}</div>
            </div>
          </div>
          <div className="text-center">
            <div className="num text-[44px] sm:text-[64px] font-semibold leading-none tracking-[-0.04em]">
              {scored ? (
                <>
                  <span className={m.winner_id === m.team1_id ? "text-ok" : undefined}>{m.team1_score}</span>
                  <span className="text-fg-3 mx-2">:</span>
                  <span className={m.winner_id === m.team2_id ? "text-ok" : undefined}>{m.team2_score}</span>
                </>
              ) : (
                <span className="text-fg-3">vs</span>
              )}
            </div>
            <div className="mt-2 text-[12px] text-fg-3">
              BO{m.best_of}
              {currentMap ? ` · ${mapName(currentMap.map_name)}` : ""}
              {m.scheduled_at ? ` · ${formatDateTime(m.scheduled_at)}` : ""}
            </div>
          </div>
          <div className="flex min-w-0 flex-col-reverse items-end gap-2 sm:flex-row sm:items-center sm:justify-end sm:gap-4">
            <div className="min-w-0 text-right">
              <div className={cn("line-clamp-2 break-words text-[15px] leading-tight sm:text-[24px] font-semibold tracking-[-0.01em]", m.winner_id && m.winner_id === m.team2_id && "text-ok")}>
                {t2}
              </div>
              <div className="text-[12px] text-fg-3">{m.team2?.tag ?? "—"}</div>
            </div>
            {m.team2 && <TeamLogo src={m.team2.logo_url} tag={m.team2.tag} size={72} />}
          </div>
        </div>
        {m.maps.length > 0 && (
          <div className="flex flex-wrap border-t border-white/[0.06]">
            {m.maps.map((map) => (
              <div
                key={map.id}
                className={cn(
                  "flex-1 min-w-[140px] px-5 py-3 border-r border-white/[0.06] last:border-r-0 text-[13px]",
                  map.status === "live" && "bg-danger/[0.05]",
                )}
              >
                <div className="text-[11px] text-fg-3">
                  Карта {map.map_number}
                  {map.picked_by ? ` · пик ${map.picked_by === m.team1_id ? (m.team1?.tag ?? "") : (m.team2?.tag ?? "")}` : " · decider"}
                </div>
                <div className="mt-0.5 flex items-center justify-between gap-2">
                  <span className="font-medium">{mapName(map.map_name)}</span>
                  <span className={cn("num", map.status === "live" ? "text-danger" : map.status === "finished" ? "text-fg" : "text-fg-3")}>
                    {map.status === "pending" ? "—" : `${map.team1_score}:${map.team2_score}`}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <Timeline items={timeline} format={formatShortDateTime} />

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-6 items-start">
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

          {/* сервер */}
          <Section title="Сервер" action={<SectionLink href="/admin/servers">Стойка</SectionLink>}>
            <FactRow
              className="grid-cols-2 md:grid-cols-5"
              items={[
                { label: "Инстанс", value: <span className="num">{m.server_instance ?? "—"}</span> },
                {
                  label: "Состояние",
                  value: (
                    <span className="flex items-center gap-2">
                      <Dot tone={serverState.tone} pulse={serverState.tone === "warn"} />
                      {serverState.text}
                    </span>
                  ),
                },
                { label: "MatchZy", value: <span className="num">{inst ? (inst.running ? (inst.gamestate ?? "none") : "выключен") : "—"}</span> },
                {
                  label: "Карта на сервере",
                  value: (
                    <span className={cn("num", currentMap && inst?.map && !inst.map.includes(currentMap.map_name.split("@")[0].replace(/^de_/, "")) && "text-warn")}>
                      {inst?.map ?? "—"}
                    </span>
                  ),
                },
                { label: "Игроки", value: <span className="num">{inst?.running ? `${Math.max(0, (inst.players ?? 0) - 1)}/10` : "—"}</span> },
              ]}
            />
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-fg-3">
              <span className="flex items-center gap-1.5">
                <Dot tone={servers.online ? "ok" : "danger"} /> агент {servers.online ? "на связи" : "не на связи"}
              </span>
              {m.server_address && <span className="num">адрес у игроков: {m.server_address}</span>}
              {m.server_state === "error" && <span className="text-danger">ошибка загрузки — журнал команд на странице «Серверы»</span>}
            </div>
          </Section>

          {/* карты: ввод счёта — только для идущей карты */}
          {m.status === "live" && m.maps.some((x) => x.status === "live") && (
            <Section title="Счёт карты" id="maps">
              <div className={`${ADMIN_CARD} divide-y divide-white/[0.06]`}>
                {m.maps
                  .filter((map) => map.status === "live")
                  .map((map) => (
                    <ActionForm key={map.id} action={saveMapScore} className="p-4">
                      <input type="hidden" name="matchId" value={m.id} />
                      <input type="hidden" name="mapId" value={map.id} />
                      <div className="mb-3 text-[13px] font-medium">
                        Карта {map.map_number} · {mapName(map.map_name)}
                      </div>
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
                      <p className="mt-2 text-[12px] text-fg-3">Обычно счёт приходит с сервера сам. Ручной ввод — если MatchZy не прислал событие.</p>
                    </ActionForm>
                  ))}
              </div>
            </Section>
          )}

          {m.status === "finished" && (
            <div className="border-l-2 border-ok bg-white/[0.02] rounded-r-lg px-4 py-3 text-[13px] text-fg-2">
              Матч завершён: {m.winner_id === m.team1_id ? t1 : t2} побеждает {m.team1_score}:{m.team2_score}
              {m.is_walkover ? " (техническая победа)" : ""}.
            </div>
          )}

          {/* составы */}
          {(m.team1_id || m.team2_id) && (
            <Section title="Составы">
              <div className={`${ADMIN_CARD} grid sm:grid-cols-2 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.06]`}>
                {[
                  { name: t1, team: m.team1, list: rosters.team1 },
                  { name: t2, team: m.team2, list: rosters.team2 },
                ].map((side) => (
                  <div key={side.name} className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      {side.team ? (
                        <Link href={`/teams/${side.team.tag}`} className="text-[13px] font-semibold hover:text-accent">
                          {side.name}
                        </Link>
                      ) : (
                        <span className="text-[13px] font-semibold">{side.name}</span>
                      )}
                      <span className="text-[11px] text-fg-3">{side.list.length} игр.</span>
                    </div>
                    <ul className="space-y-0.5">
                      {side.list.map((r) => (
                        <li key={r.player.id}>
                          <Link href={`/players/${r.player.steam_id}`} className="flex items-center gap-2.5 h-8 rounded-[6px] px-1.5 -mx-1.5 text-[13px] hover:bg-white/[0.03]">
                            <Avatar src={r.player.avatar_url} name={r.player.nickname} size={22} />
                            <span className="flex-1 truncate">{r.player.nickname}</span>
                            {r.role === "sub" && <span className="text-[11px] text-fg-3">запас</span>}
                            <FaceitLevel level={r.player.faceit_level} />
                            <span className="num text-[11px] text-fg-3 hidden md:block">{r.player.steam_id}</span>
                          </Link>
                        </li>
                      ))}
                      {side.list.length === 0 && <li className="text-[13px] text-fg-3">—</li>}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* споры */}
          <Section
            title={
              <span className="flex items-center gap-2">
                Споры {m.under_review && <span className="text-[11px] font-semibold text-warn normal-case tracking-normal">на рассмотрении</span>}
              </span>
            }
            count={disputes.length}
          >
            {disputes.length === 0 ? (
              <Quiet>Споров нет. Капитаны могут открыть спор на странице матча.</Quiet>
            ) : (
              <div className={`${ADMIN_CARD} divide-y divide-white/[0.06]`}>
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
                          Чтобы изменить результат — сначала «Отменить результат» / «Тех. победа» в колонке действий, затем закройте спор.
                        </p>
                      </ActionForm>
                    )}
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        {/* ── колонка действий ── */}
        <aside className={`${ADMIN_CARD} xl:sticky xl:top-6 overflow-hidden divide-y divide-white/[0.06]`}>
          <RailGroup title="Основное">
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
            {m.status === "ready" && (
              <ActionForm action={setMatchLive}>
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton size="sm" variant="secondary">
                  Матч начался → LIVE
                </SubmitButton>
              </ActionForm>
            )}
            {["veto", "ready"].includes(m.status) && (
              <ActionForm action={resetVeto}>
                <input type="hidden" name="matchId" value={m.id} />
                <SubmitButton size="sm" variant="ghost" confirm="Сбросить вето и начать заново?">
                  Сбросить вето
                </SubmitButton>
              </ActionForm>
            )}
            <ActionForm action={setSchedule}>
              <input type="hidden" name="matchId" value={m.id} />
              <div className="text-[11px] text-fg-3 mb-1">Время матча (Алматы)</div>
              <div className="flex gap-2">
                <input type="datetime-local" name="scheduledAt" defaultValue={toLocalInput(m.scheduled_at)} aria-label="Время матча" className="field !h-9 text-[13px]" />
                <SubmitButton size="sm" variant="secondary">
                  OK
                </SubmitButton>
              </div>
            </ActionForm>
          </RailGroup>

          <RailGroup title="Сервер">
            {["ready", "live"].includes(m.status) ? (
              <ActionForm action={sendMatchToServer}>
                <input type="hidden" name="matchId" value={m.id} />
                <select name="instance" className="field !h-9 text-[13px]" defaultValue="">
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
            <details>
              <summary className="cursor-pointer text-[12px] text-fg-3 hover:text-fg-2">Адрес вручную (если агент недоступен)</summary>
              <ActionForm action={setServerInfo} className="mt-2 space-y-2">
                <input type="hidden" name="matchId" value={m.id} />
                <Field label="Адрес (ip:port)">
                  <input name="address" defaultValue={m.server_address ?? ""} placeholder="192.168.0.159:27015" className="field !h-9 num text-[13px]" />
                </Field>
                <Field label="Пароль">
                  <input name="password" defaultValue={m.server_password ?? ""} className="field !h-9 num text-[13px]" />
                </Field>
                <SubmitButton size="sm" variant="secondary">
                  Сохранить
                </SubmitButton>
              </ActionForm>
            </details>
          </RailGroup>

          {m.server_instance && inst?.running && (
            <RailGroup title="Пауза и RCON">
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
                <input name="command" placeholder="css_restore 5" aria-label="RCON-команда" className="field !h-9 num text-[12px]" />
                <SubmitButton size="sm" variant="secondary">
                  ↵
                </SubmitButton>
              </ActionForm>
              <p className="text-[11px] text-fg-3">Ответ — в журнале команд на странице «Серверы».</p>
            </RailGroup>
          )}

          {(m.team1_id || m.team2_id) && (
            <RailGroup title="Замена игрока">
              <ActionForm action={replaceRosterPlayer} className="space-y-2">
                <input type="hidden" name="matchId" value={m.id} />
                <Field label="Кого заменить">
                  <select name="outPlayerId" className="field !h-9 text-[13px]">
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
            </RailGroup>
          )}

          {/* опасные действия — отдельно, внизу */}
          {(m.server_instance || (m.team1_id && m.team2_id)) && (
            <RailGroup title="Опасно" tone="danger">
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
                    <select name="winner" className="field !h-9 text-[13px]">
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
            </RailGroup>
          )}
        </aside>
      </div>
    </div>
  );
}
