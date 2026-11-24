import { vetoAct, vetoSide } from "@/app/actions/match";
import type { MatchFull } from "@/lib/matches";
import { mapName } from "@/lib/format";
import { ctTeamOf, sidePending, type vetoState } from "@/lib/veto";
import { ActionForm } from "../forms";
import { Callout, CriticalSurface, Panel, SubsectionTitle, Timer, cn } from "@/components/ds";
import { MapTile, type MapTileState } from "./map-tile";
import { getT } from "@/lib/i18n/server";

type VetoState = ReturnType<typeof vetoState>;

/**
 * Veto — один stateful блок для tournament Match Room.
 * serverNow нужен для честного countdown: решение server action и таймер UI используют одни часы.
 */
export async function VetoBoard({
  m,
  state,
  myTurn,
  compact,
  images = {},
  serverNow,
}: {
  m: MatchFull;
  state: VetoState;
  myTurn: boolean;
  compact?: boolean;
  images?: Record<string, string>;
  serverNow: number;
}) {
  const t = await getT();
  const active = m.status === "veto";
  const tag = (id: string | null) => (id === m.team1_id ? m.team1?.tag : id === m.team2_id ? m.team2?.tag : null);
  const teams = { team1: m.team1_id, team2: m.team2_id };
  // стороны «по пикам»: после пика соперник выбирает сторону — до этого следующего хода нет
  const pending = active ? sidePending(m.veto, m.tournament.side_choice) : null;
  const picker = pending ? (pending.team_id === m.team1_id ? m.team1 : m.team2) : null;
  const chooser = pending ? (pending.team_id === m.team1_id ? m.team2 : m.team1) : null;
  const turnTeam = pending ? chooser : state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  /** «CT · TAG» для пикнутой карты, на которой сторона уже выбрана */
  const ctTag = (a: (typeof m.veto)[number] | undefined) => tag(ctTeamOf(a, teams));

  const turnContent =
    active && state.current ? (
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className={cn("text-micro font-semibold uppercase tracking-[0.14em]", myTurn ? "text-accent" : "text-fg-3")}>
            {myTurn ? t("Ваш ход") : t("Ход соперника")} · BO{m.best_of}
          </div>
          <div className="mt-2 text-heading text-fg">
            {turnTeam?.name ?? "—"} ·{" "}
            {pending ? (
              <span className="text-accent">{t("выбор стороны")}</span>
            ) : (
              <span className={state.current.action === "ban" ? "text-danger" : "text-accent"}>{state.current.action === "ban" ? t("бан карты") : t("пик карты")}</span>
            )}
          </div>
          <p className="mt-2 max-w-read text-[14px] text-fg-2">
            {pending
              ? myTurn
                ? t("{team} пикнули {map}. Выберите, за какую сторону вы начнёте эту карту. Если время закончится, сторона будет CT.", { team: picker?.name ?? "—", map: mapName(pending.map_name) })
                : t("{team} пикнули {map} — сторону на этой карте выбирает соперник.", { team: picker?.name ?? "—", map: mapName(pending.map_name) })
              : myTurn
                ? t("Выберите карту ниже. Если время закончится, система выберет допустимую карту автоматически.")
                : t("Дождитесь выбора соперника. Страница обновится автоматически.")}
          </p>
        </div>
        {m.veto_deadline && (
          <div className="shrink-0 text-right">
            <div className="text-micro text-fg-3">{t("Осталось")}</div>
            <Timer deadline={m.veto_deadline} serverNow={serverNow} urgentAt={10} className="mt-1 block text-[36px] font-semibold leading-none sm:text-[44px]" />
          </div>
        )}
      </div>
    ) : null;

  return (
    <section>
      {turnContent &&
        (myTurn ? (
          <CriticalSurface tone="accent">{turnContent}</CriticalSurface>
        ) : (
          <Panel className="border-line">{turnContent}</Panel>
        ))}

      {pending && (
        <div className="mt-4 grid items-stretch gap-3 sm:grid-cols-[minmax(0,240px)_1fr_1fr]">
          <MapTile map={pending.map_name} state="picked" caption={`${t("Пик")} · ${tag(pending.team_id) ?? "—"}`} image={images[pending.map_name]} />
          {(["ct", "t"] as const).map((side) => {
            const card = (
              <div
                className={cn(
                  "h-full rounded-surface border-2 px-5 py-4 text-left transition-colors",
                  side === "ct" ? "border-side-ct/40 bg-side-ct/10" : "border-side-t/40 bg-side-t/10",
                  myTurn ? (side === "ct" ? "group-hover/side:border-side-ct group-hover/side:bg-side-ct/20" : "group-hover/side:border-side-t group-hover/side:bg-side-t/20") : "opacity-60",
                )}
              >
                <div className={cn("text-[32px] font-bold leading-none", side === "ct" ? "text-side-ct" : "text-side-t")}>{side === "ct" ? "CT" : "T"}</div>
                <div className="mt-2 text-[15px] font-semibold text-fg">{side === "ct" ? t("Начать за защиту") : t("Начать за атаку")}</div>
                <div className="mt-0.5 text-meta text-fg-3">
                  {side === "ct" ? t("Спецназ: первая половина в обороне") : t("Террористы: первая половина в нападении")}
                </div>
              </div>
            );
            return myTurn ? (
              <ActionForm key={side} action={vetoSide}>
                <input type="hidden" name="matchId" value={m.id} />
                <input type="hidden" name="side" value={side} />
                <button
                  type="submit"
                  aria-label={side === "ct" ? t("Начать за защиту") : t("Начать за атаку")}
                  className="group/side block h-full w-full rounded-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                >
                  {card}
                </button>
              </ActionForm>
            ) : (
              <div key={side}>{card}</div>
            );
          })}
        </div>
      )}

      {!compact && (
        <>
          {turnContent && <div className="h-5" />}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
            {m.tournament.map_pool.map((map) => {
              const act = m.veto.find((a) => a.map_name === map);
              const state_: MapTileState = act ? (act.action === "ban" ? "banned" : act.action === "pick" ? "picked" : "decider") : "available";
              const caption = act
                ? act.action === "decider"
                  ? "Decider"
                  : `${act.action === "ban" ? t("Бан") : t("Пик")} · ${tag(act.team_id) ?? t("авто")}${act.auto ? ` · ${t("таймер")}` : ""}${ctTag(act) ? ` · CT ${ctTag(act)}` : ""}`
                : undefined;
              const clickable = !act && active && myTurn && !pending;

              return clickable ? (
                <ActionForm key={map} action={vetoAct}>
                  <input type="hidden" name="matchId" value={m.id} />
                  <input type="hidden" name="map" value={map} />
                  <button
                    type="submit"
                    aria-label={`${state.current?.action === "pick" ? t("Пик") : t("Бан")}: ${map}`}
                    className="group/map block w-full rounded-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    <MapTile
                      map={map}
                      state={state_}
                      caption={state.current?.action === "pick" ? t("Нажмите — пик") : t("Нажмите — бан")}
                      interactive
                      image={images[map]}
                    />
                  </button>
                </ActionForm>
              ) : (
                <MapTile key={map} map={map} state={state_} caption={caption} image={images[map]} />
              );
            })}
          </div>
        </>
      )}

      <div className={cn(!compact && "mt-7")}>
        {!compact && <SubsectionTitle>{t("Ход вето")}</SubsectionTitle>}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {state.plan.map((step) => {
            const done = m.veto.find((a) => a.step === step.step);
            const teamTag = step.team === 1 ? m.team1?.tag : step.team === 2 ? m.team2?.tag : null;
            const current = !pending && state.current?.step === step.step && active;
            const choosing = !!pending && pending.step === step.step;
            const ct = ctTag(done);
            const sideNote = choosing
              ? t("сторону выбирает {team}", { team: chooser?.tag ?? "—" })
              : ct
                ? `CT — ${ct}`
                : m.tournament.side_choice && step.action === "decider"
                  ? t("стороны — нож")
                  : null;
            const action = step.action === "ban" ? t("Бан") : step.action === "pick" ? t("Пик") : "Decider";
            return (
              <li
                key={step.step}
                className={cn(
                  "rounded-control border px-3 py-2.5",
                  current || choosing ? "border-accent/45 bg-accent-dim" : done ? "border-line-subtle bg-surface" : "border-dashed border-line-subtle",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-micro">
                  <span className="num text-fg-3">{String(step.step).padStart(2, "0")}</span>
                  <span className={cn("font-semibold uppercase tracking-[0.1em]", step.action === "ban" ? "text-danger" : step.action === "pick" ? "text-accent" : "text-ok")}>
                    {action}
                  </span>
                </div>
                <div className={cn("mt-1.5 truncate text-[14px] font-medium", done ? "text-fg" : current ? "text-accent" : "text-fg-3")}>
                  {done ? mapName(done.map_name) : current ? t("выбирает…") : "—"}
                </div>
                <div className="mt-0.5 truncate text-meta text-fg-3">{teamTag ?? t("по остатку")}</div>
                {sideNote && <div className={cn("mt-0.5 text-meta font-medium leading-snug", choosing ? "text-accent" : ct ? "text-side-ct" : "text-fg-3")}>{sideNote}</div>}
              </li>
            );
          })}
        </ol>
      </div>

      {active && !state.current && !state.complete && (
        <Callout className="mt-4">{t("Состояние вето обновляется. Страница синхронизируется автоматически.")}</Callout>
      )}
    </section>
  );
}
