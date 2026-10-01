import { vetoAct } from "@/app/actions/match";
import type { MatchFull } from "@/lib/matches";
import { mapName } from "@/lib/format";
import type { vetoState } from "@/lib/veto";
import { ActionForm } from "../forms";
import { Countdown } from "../live-refresh";
import { Eyebrow } from "../public/home";
import { cn } from "../ui";
import { MapTile, type MapTileState } from "./map-tile";

type VetoState = ReturnType<typeof vetoState>;

/** Вето: крупно — чей ход и что делать, сетка карт, ниже — хронология */
export function VetoBoard({
  m,
  state,
  myTurn,
  compact,
  images = {},
}: {
  m: MatchFull;
  state: VetoState;
  myTurn: boolean;
  compact?: boolean;
  images?: Record<string, string>;
}) {
  const active = m.status === "veto";
  const turnTeam = state.current?.team === 1 ? m.team1 : state.current?.team === 2 ? m.team2 : null;
  const tag = (id: string | null) => (id === m.team1_id ? m.team1?.tag : id === m.team2_id ? m.team2?.tag : null);

  return (
    <section>
      {active && state.current ? (
        <div className="flex flex-wrap items-end justify-between gap-8 mb-10 rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-7 sm:p-10">
          <div>
            <Eyebrow className={myTurn ? "text-accent" : undefined}>{myTurn ? "Ваш ход" : "Ход"} · вето · BO{m.best_of}</Eyebrow>
            <div className="mt-4 text-[28px] md:text-[44px] lg:text-[56px] font-semibold uppercase tracking-[-0.01em] leading-[1.05]">
              {turnTeam?.name ?? "—"}
              <span className={cn("block mt-1", state.current.action === "ban" ? "text-danger" : "text-accent")}>
                {state.current.action === "ban" ? "Бан карты" : "Пик карты"}
              </span>
            </div>
            {myTurn && (
              <div className="mt-4 text-[15px] lg:text-[17px] text-fg-2">
                Нажмите на карту. Если время выйдет — карта выберется случайно.
              </div>
            )}
          </div>
          {m.veto_deadline && (
            <div className="text-right">
              <Eyebrow>Осталось</Eyebrow>
              <div className="num text-[44px] lg:text-[72px] font-semibold leading-none mt-3">
                <Countdown deadline={m.veto_deadline} />
              </div>
            </div>
          )}
        </div>
      ) : (
        !compact && <Eyebrow className="mb-6">Вето карт</Eyebrow>
      )}

      {!compact && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
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
                <button type="submit" className="w-full block">
                  <MapTile map={map} state={state_} caption={caption} interactive image={images[map]} />
                </button>
              </ActionForm>
            ) : (
              <MapTile key={map} map={map} state={state_} caption={caption} image={images[map]} />
            );
          })}
        </div>
      )}

      <ol className={cn("flex flex-wrap gap-x-6 gap-y-2 text-[14px]", compact ? "" : "mt-8")}>
        {state.plan.map((s) => {
          const done = m.veto.find((a) => a.step === s.step);
          const t = s.team === 1 ? m.team1?.tag : s.team === 2 ? m.team2?.tag : null;
          const current = state.current?.step === s.step && active;
          return (
            <li key={s.step} className={cn("inline-flex items-center gap-2", done ? "text-fg-2" : current ? "text-warn" : "text-fg-3")}>
              <span className="num text-[11px] text-fg-3">{s.step}</span>
              <span>
                {t ? `${t} ` : ""}
                {s.action === "ban" ? "бан" : s.action === "pick" ? "пик" : "decider"}
                {done ? ` · ${mapName(done.map_name)}` : ""}
              </span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
