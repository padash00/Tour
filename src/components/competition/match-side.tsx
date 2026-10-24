import { mapName } from "@/lib/format";
import type { MatchFull } from "@/lib/matches";
import { CopyConnect } from "../copy-connect";
import { Timer, cn } from "@/components/ds";

/*
 * Правая колонка Match Room: «Сервер» и «Как выбрали карту».
 * Адрес сервера получает только участник матча или администратор — решает страница (participant).
 */

const CARD = "rounded-surface border border-line-subtle bg-surface p-5";

export function MatchServerPanel({ m, participant, serverNow }: { m: MatchFull; participant: boolean; serverNow: number }) {
  const phase = ["ready", "live"].includes(m.status);
  if (!phase) return null;
  const ready = !!m.server_address;
  const waiting = m.status === "ready";
  return (
    <section className={CARD} aria-label="Сервер">
      <h2 className="text-heading text-fg">Сервер</h2>
      <span
        className={cn(
          "mt-3 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[14px] font-bold",
          ready ? (waiting ? "bg-accent-dim text-accent" : "bg-danger-dim text-live") : "bg-warn-dim text-warn",
        )}
      >
        <span className="size-2 rounded-full bg-current" aria-hidden />
        {ready ? (waiting ? "Сервер готов" : "Идёт игра") : m.server_state === "loading" ? "Загружаем карту" : "Готовим сервер"}
      </span>

      {!participant ? (
        <p className="mt-3 text-[15px] text-fg-2">Подключаться могут только игроки этих двух команд — адрес виден им на этой странице.</p>
      ) : ready ? (
        <div className="mt-4 flex flex-col gap-3">
          <CopyConnect address={m.server_address!} password={m.server_password} label="Скопировать адрес" block />
          <code className="num-code select-all break-all rounded-control bg-surface-2 px-3 py-2.5 text-[14px] text-fg-2">
            connect {m.server_address}
            {m.server_password ? `; password ${m.server_password}` : ""}
          </code>
          {waiting && m.server_ready_at && (
            <p className="text-[15px] text-fg-2">
              На подключение осталось{" "}
              <Timer
                deadline={new Date(new Date(m.server_ready_at).getTime() + 15 * 60_000).toISOString()}
                serverNow={serverNow}
                urgentAt={60}
                className="font-bold text-fg"
              />
            </p>
          )}
          <ol className="grid gap-1.5 text-[14.5px] text-fg-2">
            <li>1. Нажмите «Скопировать адрес» и вставьте его в консоль CS2 (клавиша ~).</li>
            <li>2. В разминке напишите <span className="num-code text-fg">.ready</span>.</li>
            {m.tournament.knife_round && (
              <li>
                3. Выиграли нож — напишите <span className="num-code text-fg">.stay</span> или <span className="num-code text-fg">.switch</span>.
              </li>
            )}
          </ol>
        </div>
      ) : (
        <p className="mt-3 text-[15px] text-fg-2">
          {m.server_state === "loading" ? "Загружаем карту и проверяем составы." : "Сервер назначится автоматически."} Адрес появится здесь сам.
        </p>
      )}
    </section>
  );
}

/** Вето словами и чипами: какие карты убрали, какую взяли, какая осталась */
export function VetoSummary({ m }: { m: MatchFull }) {
  if (m.veto.length === 0) return null;
  const steps = [...m.veto].sort((a, b) => a.step - b.step);
  const tag = (teamId: string | null) => (teamId === m.team1_id ? m.team1?.name : teamId === m.team2_id ? m.team2?.name : null);
  const bans = steps.filter((s) => s.action === "ban").length;
  const picks = steps.filter((s) => s.action === "pick");
  const decider = steps.find((s) => s.action === "decider");
  const auto = steps.filter((s) => s.auto && s.action !== "decider").length;
  return (
    <section className={CARD} aria-label="Как выбрали карту">
      <h2 className="text-heading text-fg">Как выбрали карту</h2>
      <p className="mt-2 text-[15px] leading-relaxed text-fg-2">
        Капитаны по очереди убрали {bans} {plural(bans, "карту", "карты", "карт")}
        {picks.length ? `, выбрали ${picks.map((p) => `${mapName(p.map_name)} (${tag(p.team_id) ?? "—"})`).join(", ")}` : ""}
        {decider ? `${picks.length ? ", последней" : ""} осталась ${mapName(decider.map_name)}` : ""}.
        {auto > 0 ? ` ${auto} ${plural(auto, "ход сделал", "хода сделал", "ходов сделал")} таймер.` : ""}
      </p>
      <ul className="mt-3 flex flex-wrap gap-1.5">
        {steps.map((s) => (
          <li
            key={s.id}
            title={s.action === "ban" ? `Убрали: ${tag(s.team_id) ?? "таймер"}` : s.action === "pick" ? `Выбрали: ${tag(s.team_id) ?? "таймер"}` : "Осталась последней"}
            className={cn(
              "rounded-full px-3 py-1 text-[14px] font-semibold",
              s.action === "ban" ? "bg-surface-2 text-fg-3 line-through decoration-danger/60" : "bg-accent-dim font-extrabold text-accent",
            )}
          >
            {mapName(s.map_name)}
          </li>
        ))}
      </ul>
    </section>
  );
}

function plural(n: number, one: string, few: string, many: string) {
  const a = n % 100;
  const b = n % 10;
  return a > 10 && a < 20 ? many : b === 1 ? one : b > 1 && b < 5 ? few : many;
}
