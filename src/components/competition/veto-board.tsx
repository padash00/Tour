import { vetoAct } from "@/app/actions/match";
import type { MatchFull } from "@/lib/matches";
import { mapName } from "@/lib/format";
import type { vetoState } from "@/lib/veto";
import { ActionForm } from "../forms";
import { Callout, CriticalSurface, Panel, SubsectionTitle, Timer, cn } from "@/components/ds";
import { MapTile, type MapTileState } from "./map-tile";

type VetoState = ReturnType<typeof vetoState>;

/**
 * Veto — один stateful блок для tournament Match Room.
 * serverNow нужен для честного countdown: решение server action и таймер UI используют одни часы.
 */
export function VetoBoard({
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
  const active = m.status === "veto";
  const turnTeam = state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  const tag = (id: string | null) => (id === m.team1_id ? m.team1?.tag : id === m.team2_id ? m.team2?.tag : null);

  const turnContent =
    active && state.current ? (
      <div className="flex flex-wrap items-end justify-between gap-6">
        <div className="min-w-0">
          <div className={cn("text-micro font-semibold uppercase tracking-[0.14em]", myTurn ? "text-accent" : "text-fg-3")}>
            {myTurn ? "Ваш ход" : "Ход соперника"} · BO{m.best_of}
          </div>
          <div className="mt-2 text-heading text-fg">
            {turnTeam?.name ?? "—"} · <span className={state.current.action === "ban" ? "text-danger" : "text-accent"}>{state.current.action === "ban" ? "бан карты" : "пик карты"}</span>
          </div>
          <p className="mt-2 max-w-read text-[14px] text-fg-2">
            {myTurn
              ? "Выберите карту ниже. Если время закончится, система выберет допустимую карту автоматически."
              : "Дождитесь выбора соперника. Страница обновится автоматически."}
          </p>
        </div>
        {m.veto_deadline && (
          <div className="shrink-0 text-right">
            <div className="text-micro text-fg-3">Осталось</div>
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
                  : `${act.action === "ban" ? "Бан" : "Пик"} · ${tag(act.team_id) ?? "авто"}${act.auto ? " · таймер" : ""}`
                : undefined;
              const clickable = !act && active && myTurn;

              return clickable ? (
                <ActionForm key={map} action={vetoAct}>
                  <input type="hidden" name="matchId" value={m.id} />
                  <input type="hidden" name="map" value={map} />
                  <button
                    type="submit"
                    aria-label={`${state.current?.action === "pick" ? "Пик" : "Бан"}: ${map}`}
                    className="group/map block w-full rounded-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                  >
                    <MapTile
                      map={map}
                      state={state_}
                      caption={state.current?.action === "pick" ? "Нажмите — пик" : "Нажмите — бан"}
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
        {!compact && <SubsectionTitle>Ход вето</SubsectionTitle>}
        <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
          {state.plan.map((step) => {
            const done = m.veto.find((a) => a.step === step.step);
            const teamTag = step.team === 1 ? m.team1?.tag : step.team === 2 ? m.team2?.tag : null;
            const current = state.current?.step === step.step && active;
            const action = step.action === "ban" ? "Бан" : step.action === "pick" ? "Пик" : "Decider";
            return (
              <li
                key={step.step}
                className={cn(
                  "rounded-control border px-3 py-2.5",
                  current ? "border-accent/45 bg-accent-dim" : done ? "border-line-subtle bg-surface" : "border-dashed border-line-subtle",
                )}
              >
                <div className="flex items-center justify-between gap-2 text-micro">
                  <span className="num text-fg-3">{String(step.step).padStart(2, "0")}</span>
                  <span className={cn("font-semibold uppercase tracking-[0.1em]", step.action === "ban" ? "text-danger" : step.action === "pick" ? "text-accent" : "text-ok")}>
                    {action}
                  </span>
                </div>
                <div className={cn("mt-1.5 truncate text-[14px] font-medium", done ? "text-fg" : current ? "text-accent" : "text-fg-3")}>
                  {done ? mapName(done.map_name) : current ? "выбирает…" : "—"}
                </div>
                <div className="mt-0.5 truncate text-meta text-fg-3">{teamTag ?? "по остатку"}</div>
              </li>
            );
          })}
        </ol>
      </div>

      {active && !state.current && !state.complete && (
        <Callout className="mt-4">Состояние вето обновляется. Страница синхронизируется автоматически.</Callout>
      )}
    </section>
  );
}
