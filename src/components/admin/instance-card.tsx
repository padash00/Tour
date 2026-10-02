import Link from "next/link";
import type { ServerInstance } from "@/lib/server-control";
import { cn } from "@/components/ui";
import { ADMIN_CARD } from "./control";
import { instanceState, minutesSince, toneBar, toneText } from "./kit";
import { ServerActions } from "./server-actions";
import { ActionForm, SubmitButton } from "@/components/forms";
import { restoreRound, serverRcon } from "@/app/actions/admin-server";
import { mapName } from "@/lib/format";

/** Матч, закреплённый за инстансом (поля, нужные пульту) */
export type InstanceMatch = {
  id: string;
  number: number;
  status: string;
  server_state: string | null;
  server_ready_at: string | null;
  team1_score: number;
  team2_score: number;
  team1: { tag: string } | null;
  team2: { tag: string } | null;
  /** карты серии — для счёта идущей карты и номера раунда */
  maps?: { map_number: number; map_name: string; status: string; team1_score: number; team2_score: number }[];
};

/** Игроков на сервере без бота-наблюдателя GOTV */
export function humanPlayers(i: Pick<ServerInstance, "running" | "players">) {
  return i.running ? Math.max(0, (i.players ?? 0) - 1) : null;
}

/**
 * Карточка инстанса в «живой сетке» обзора: цветная полоса состояния, матч и счёт,
 * карта, игроки, таймер ожидания, быстрые действия.
 */
export function InstanceCard({
  i,
  match,
  online,
  now,
  hero,
}: {
  i: ServerInstance;
  match?: InstanceMatch;
  online: boolean;
  now: number;
  /** крупная карточка для главного блока пульта */
  hero?: boolean;
}) {
  const st = instanceState(i, online);
  const live = st.text === "LIVE";
  const waited = match?.status === "ready" && match.server_state === "ready" ? minutesSince(match.server_ready_at, now) : null;
  const players = humanPlayers(i);
  // управление игрой — только если на сервере сейчас именно этот матч и он идёт
  const liveMap = match?.status === "live" && i.match_id === match.id ? match.maps?.find((m) => m.status === "live") : undefined;
  const round = liveMap ? liveMap.team1_score + liveMap.team2_score + 1 : null;

  return (
    <div
      className={cn(
        ADMIN_CARD,
        "relative flex flex-col overflow-hidden pl-[3px]",
        live && "bg-danger/[0.04] border-danger/30",
        hero && "min-h-[228px]",
      )}
    >
      {/* полоса состояния слева */}
      <span className={cn("absolute inset-y-0 left-0 w-[3px]", toneBar[st.tone], live && "animate-pulse")} />

      <div className={cn("flex items-start justify-between gap-3", hero ? "px-5 pt-5" : "px-4 pt-4")}>
        <div className="min-w-0">
          <div className={cn("num font-semibold text-fg", hero ? "text-[18px]" : "text-[15px]")}>{i.name}</div>
          <div className="num text-[11px] text-fg-3">
            :{i.port}
            {i.role === "reserve" ? " · резерв" : ""}
          </div>
        </div>
        <span
          className={cn(
            "inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-2 font-mono text-[10px] uppercase tracking-[0.12em]",
            toneText[st.tone],
            "border-current/30 bg-current/[0.06]",
          )}
        >
          <span className={cn("size-1.5 rounded-full bg-current", live && "animate-pulse")} />
          {st.text}
        </span>
      </div>

      <div className={cn("flex-1 space-y-2", hero ? "px-5 pt-4 pb-4" : "px-4 pt-3 pb-3 text-[13px]")}>
        {match ? (
          <Link href={`/admin/matches/${match.id}`} className="group block">
            <div className="font-mono text-[10px] uppercase tracking-[0.16em] text-fg-3">Матч #{match.number}</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className={cn("truncate font-semibold group-hover:text-accent", hero ? "text-[20px]" : "text-[14px]")}>
                {match.team1?.tag ?? "TBD"} <span className="font-normal text-fg-3">vs</span> {match.team2?.tag ?? "TBD"}
              </span>
              {(match.status === "live" || match.team1_score + match.team2_score > 0) && (
                <span className={cn("num shrink-0 font-semibold", hero ? "text-[30px] leading-none" : "text-[15px]", live && "text-fg")}>
                  {match.team1_score}
                  <span className="text-fg-3">:</span>
                  {match.team2_score}
                </span>
              )}
            </div>
          </Link>
        ) : (
          <div className={cn("text-fg-3", hero && "text-[15px] pt-1")}>{i.running ? "Свободен — матча нет" : "Не запущен"}</div>
        )}

        <div className="flex items-center justify-between gap-2 font-mono text-[12px] text-fg-3">
          <span className="truncate">{i.map ?? "—"}</span>
          <span className={cn(players ? "text-fg-2" : undefined)}>{players != null ? `${players}/10` : "—"}</span>
        </div>
        {hero && players != null && (
          <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={cn("h-full rounded-full", live ? "bg-danger/80" : "bg-accent/70")} style={{ width: `${Math.min(100, players * 10)}%` }} />
          </div>
        )}
        {liveMap && (
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate text-fg-2">
              Карта {liveMap.map_number} · {mapName(liveMap.map_name)}
            </span>
            <span className="num shrink-0 text-fg">
              {liveMap.team1_score}:{liveMap.team2_score} <span className="text-fg-3">· раунд {round}</span>
            </span>
          </div>
        )}
        {match?.server_state === "loading" && <div className="text-[12px] text-warn">загружает матч…</div>}
        {match?.server_state === "error" && <div className="text-[12px] text-danger">карта не загрузилась</div>}
        {waited != null && (
          <div className={cn("num text-[12px]", waited >= 15 ? "font-semibold text-danger" : waited >= 10 ? "text-warn" : "text-ok")}>
            ждём игроков {waited} мин{waited >= 15 ? " · неявка" : ""}
          </div>
        )}
      </div>

      {online && liveMap && match && (
        <div className="flex flex-wrap gap-1 border-t border-white/[0.06] px-2 py-2">
          {[
            { cmd: "css_forcepause", label: "Пауза" },
            { cmd: "css_forceunpause", label: "Снять паузу" },
          ].map((c) => (
            <ActionForm key={c.cmd} action={serverRcon} inline>
              <input type="hidden" name="instance" value={i.name} />
              <input type="hidden" name="command" value={c.cmd} />
              <SubmitButton size="sm" variant="secondary">
                {c.label}
              </SubmitButton>
            </ActionForm>
          ))}
          <ActionForm action={restoreRound} inline>
            <input type="hidden" name="matchId" value={match.id} />
            <input type="hidden" name="round" value={round ?? 1} />
            <SubmitButton size="sm" variant="ghost" confirm={`Переиграть раунд ${round} на ${i.name}? Счёт и деньги вернутся на его начало.`}>
              Переиграть раунд
            </SubmitButton>
          </ActionForm>
        </div>
      )}
      {online && (
        <div className="border-t border-white/[0.06] bg-black/20 px-2 py-2">
          <ServerActions instance={i.name} running={!!i.running} align="start" />
        </div>
      )}
    </div>
  );
}
