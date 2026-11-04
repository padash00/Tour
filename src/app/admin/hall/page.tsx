import type { Metadata } from "next";
import Link from "next/link";
import { adminCallMatch, adminHallForbid, adminHallFree, adminHallResetForbidden, adminHallToggle, adminHallVetoNow } from "@/app/actions/admin-hall";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { HALL_BLOCKS, HALL_SPARE_PCS, blockLabel, pairKey } from "@/lib/hall-core";
import { READY_MS, hallConfig, hallSnapshot, matchHall } from "@/lib/hall";
import { getMaxParallelMatches } from "@/lib/settings";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AdminHeader, Panel } from "@/components/admin/control";
import { LiveRefresh } from "@/components/live-refresh";
import { cn } from "@/components/ui";
import { HallMap } from "@/components/hall-map";

export const metadata: Metadata = { title: "Рассадка в зале — F16 Control" };
export const dynamic = "force-dynamic";

const STATUS: Record<string, string> = { upcoming: "садятся", veto: "бан-пик", ready: "сервер", live: "идёт игра", finished: "закончили" };

/** Рассадка команд по блокам ПК: кто где сидит, вызов матчей, запреты «соперники не могут сидеть» */
export default async function AdminHallPage() {
  await requireAdmin("/admin/hall");
  const cfg = await hallConfig();
  const limit = await getMaxParallelMatches();
  const { data: ts } = await db().from("tournaments").select("id, name, autopilot").eq("is_lan", true).in("status", ["checkin", "live"]);
  const tournaments = ts ?? [];

  type Seat = { team: string; match: { id: string; number: number; status: string } | null };
  const seats = new Map<string, Seat>();
  const toCall: { id: string; number: number; team1_id: string; team2_id: string; tournament: string }[] = [];
  const called: { id: string; number: number; team1_id: string; team2_id: string; hall: NonNullable<Awaited<ReturnType<typeof matchHall>>> }[] = [];
  for (const t of tournaments) {
    const snap = await hallSnapshot(t.id, cfg);
    for (const [block, v] of snap.occupiedBy) seats.set(block, { team: v.team, match: v.match });
    for (const [block, team] of snap.reserved) if (!seats.has(block)) seats.set(block, { team, match: null });
    for (const m of snap.matches) {
      if (m.status !== "upcoming" || !m.team1_id || !m.team2_id) continue;
      if (snap.calls.has(m.id)) {
        const h = await matchHall(m.id);
        if (h) called.push({ id: m.id, number: m.number, team1_id: m.team1_id, team2_id: m.team2_id, hall: h });
      } else toCall.push({ id: m.id, number: m.number, team1_id: m.team1_id, team2_id: m.team2_id, tournament: t.name });
    }
  }
  const teamIds = new Set<string>([...[...seats.values()].map((s) => s.team), ...toCall.flatMap((m) => [m.team1_id, m.team2_id]), ...called.flatMap((m) => [m.team1_id, m.team2_id])]);
  const { data: teams } = teamIds.size ? await db().from("teams").select("id, name").in("id", [...teamIds]) : { data: [] };
  const name = (id: string) => (teams ?? []).find((t) => t.id === id)?.name ?? "?";
  const autopilot = tournaments.some((t) => t.autopilot);

  const block = (id: string) => {
    const s = seats.get(id);
    return (
      <div key={id} className={cn("rounded-control border p-3", s?.match ? "border-accent/40 bg-accent/10" : s ? "border-warn/40 bg-warn/10" : "border-line bg-surface-4")}>
        <div className="text-[15px] font-bold text-fg num">{blockLabel(id, false)}</div>
        {s ? (
          <>
            <div className="mt-1 truncate text-[14.5px] font-semibold text-fg">{name(s.team)}</div>
            <div className="text-[13px] text-fg-3">
              {s.match ? (
                <Link href={`/admin/matches/${s.match.id}`} className="hover:underline">
                  матч #{s.match.number} · {STATUS[s.match.status] ?? s.match.status}
                </Link>
              ) : (
                "ждёт следующий матч"
              )}
            </div>
            {(!s.match || s.match.status === "finished") && (
              <ActionForm action={adminHallFree} className="mt-2">
                <input type="hidden" name="block" value={id} />
                <SubmitButton size="sm" variant="secondary">
                  Блок свободен
                </SubmitButton>
              </ActionForm>
            )}
          </>
        ) : (
          <div className="mt-1 text-[13.5px] text-fg-3">свободно</div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-8">
      <LiveRefresh intervalMs={5000} />
      <AdminHeader
        title="Рассадка в зале"
        description="Одна команда — один блок ПК. Соперники не сидят рядом: Standart играет только против Premium, в Premium — через два ряда. Команда, которая уже сидит, остаётся на своём месте."
        actions={
          <ActionForm action={adminHallToggle}>
            <input type="hidden" name="on" value={cfg.enabled ? "0" : "1"} />
            <SubmitButton variant={cfg.enabled ? "secondary" : "primary"}>{cfg.enabled ? "Выключить рассадку" : "Включить рассадку"}</SubmitButton>
          </ActionForm>
        }
      />

      <Panel title="Как это работает" boxed>
        <ol className="list-decimal space-y-1.5 p-5 pl-10 text-[15px] text-fg-2">
          <li>
            Матч вызывается на места {autopilot ? "сам (автопилот), когда соперники известны, команды отдохнули 10 минут и есть свободный блок" : "кнопкой «Вызвать» ниже (автопилот турнира выключен)"}.
          </li>
          <li>Бот пишет в Telegram-тему «Матчи турнира», какая команда куда садится, и каждому игроку — в личку.</li>
          <li>Капитаны жмут «Команда села — Готов» на странице матча. Бан-пик начинается, когда готовы оба, или сам через {READY_MS / 60_000} минут.</li>
          <li>После матча проигравшие уходят — их блок освобождается через 5 минут (или кнопкой «Блок свободен»).</li>
        </ol>
        <div className="space-y-1.5 border-t border-line-subtle p-5 text-[14.5px]">
          <p>
            Рассадка: {cfg.enabled ? <b className="text-ok">включена</b> : <b className="text-fg-3">выключена</b>}
          </p>
          <p>
            Тема «Матчи турнира» в Telegram:{" "}
            {cfg.thread ? <b className="text-ok">подключена</b> : <b className="text-danger">не подключена — создайте тему, закройте её и отправьте в ней /matches</b>}
          </p>
          <p>
            Матчей одновременно: <b>{limit ?? "без ограничения"}</b>
            {(limit == null || limit > 5) && <span className="text-fg-3"> — рекомендуем 4 (Настройки → Серверы → «Турнирных матчей одновременно»)</span>}
          </p>
        </div>
      </Panel>

      <Panel title="Зал сейчас" boxed>
        <div className="space-y-5 p-5">
          <HallMap
            marks={Object.fromEntries(
              [...seats].map(([id, st]) => [
                id,
                { tone: st.match ? ("busy" as const) : ("wait" as const), label: `${name(st.team)}${st.match ? ` · матч #${st.match.number}` : " · ждёт матч"}` },
              ]),
            )}
          />
          <div className="flex flex-wrap gap-4 text-[13px] text-fg-3">
            <span>
              <span className="mr-1.5 inline-block size-3 rounded-sm border border-accent/45 bg-accent/15 align-middle" />
              играют / садятся
            </span>
            <span>
              <span className="mr-1.5 inline-block size-3 rounded-sm border border-warn/50 bg-warn/20 align-middle" />
              ждут следующий матч
            </span>
            <span>
              <span className="mr-1.5 inline-block size-3 rounded-sm border border-line bg-surface-4 align-middle" />
              свободно
            </span>
            <span>Пунктир — запасные ПК {HALL_SPARE_PCS.join(", ")}</span>
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">{HALL_BLOCKS.map((b) => block(b.id))}</div>
        </div>
      </Panel>

      {called.length > 0 && (
        <Panel title="Садятся — ждём «Готов»" boxed>
          <ul className="divide-y divide-line-subtle">
            {called.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[15px]">
                <span>
                  <Link href={`/admin/matches/${m.id}`} className="font-semibold hover:underline">
                    #{m.number}
                  </Link>{" "}
                  {name(m.team1_id)} ({blockLabel(m.hall.seat1, false)}) {m.hall.ready1 ? "✅" : "⏳"} — {name(m.team2_id)} ({blockLabel(m.hall.seat2, false)}) {m.hall.ready2 ? "✅" : "⏳"}
                  <span className="text-fg-3"> · бан-пик сам в {new Date(m.hall.deadline).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" })}</span>
                </span>
                <ActionForm action={adminHallVetoNow} inline>
                  <input type="hidden" name="matchId" value={m.id} />
                  <SubmitButton size="sm" variant="secondary">
                    Начать бан-пик сейчас
                  </SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      {toCall.length > 0 && (
        <Panel title="Можно вызывать" boxed>
          <ul className="divide-y divide-line-subtle">
            {toCall.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 text-[15px]">
                <span>
                  <Link href={`/admin/matches/${m.id}`} className="font-semibold hover:underline">
                    #{m.number}
                  </Link>{" "}
                  {name(m.team1_id)} — {name(m.team2_id)} <span className="text-fg-3">· {m.tournament}</span>
                </span>
                <ActionForm action={adminCallMatch} inline>
                  <input type="hidden" name="matchId" value={m.id} />
                  <SubmitButton size="sm">Вызвать на места</SubmitButton>
                </ActionForm>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel
        title="Где соперникам сидеть нельзя"
        boxed
        action={
          <ActionForm action={adminHallResetForbidden} inline>
            <SubmitButton size="sm" variant="secondary" confirm="Вернуть запреты по умолчанию?">
              По умолчанию
            </SubmitButton>
          </ActionForm>
        }
      >
        <p className="px-5 pt-4 text-[14px] text-fg-3">✕ — соперников сюда не посадим. Нажмите на клетку, чтобы поменять.</p>
        <div className="overflow-x-auto p-5">
          <table className="border-collapse text-[13px]">
            <thead>
              <tr>
                <th />
                {HALL_BLOCKS.map((b) => (
                  <th key={b.id} className="px-1 pb-2 font-semibold text-fg-2 num">
                    {b.from}–{b.to}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {HALL_BLOCKS.map((a, i) => (
                <tr key={a.id}>
                  <th className="pr-2 text-right font-semibold text-fg-2 num">
                    {a.from}–{a.to}
                  </th>
                  {HALL_BLOCKS.map((b, j) => {
                    if (i === j) return <td key={b.id} className="h-9 w-12 bg-surface-2" />;
                    const no = cfg.forbidden.has(pairKey(a.id, b.id));
                    return (
                      <td key={b.id} className="p-0.5">
                        <ActionForm action={adminHallForbid} inline>
                          <input type="hidden" name="a" value={a.id} />
                          <input type="hidden" name="b" value={b.id} />
                          <button className={cn("h-8 w-12 rounded border text-[14px] font-bold", no ? "border-danger/40 bg-danger/15 text-danger" : "border-ok/40 bg-ok/10 text-ok")}>{no ? "✕" : "✓"}</button>
                        </ActionForm>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
