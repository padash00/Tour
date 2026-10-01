import Link from "next/link";
import type { ServerInstance } from "@/lib/server-control";
import { cn } from "@/components/ui";
import { ADMIN_CARD } from "./control";
import { instanceState, minutesSince, toneBar, toneText } from "./kit";
import { ServerActions } from "./server-actions";

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
};

/** Игроков на сервере без бота-наблюдателя GOTV */
export function humanPlayers(i: Pick<ServerInstance, "running" | "players">) {
  return i.running ? Math.max(0, (i.players ?? 0) - 1) : null;
}

/**
 * Карточка инстанса в «живой сетке» обзора: цветная полоса состояния, матч и счёт,
 * карта, игроки, таймер ожидания, быстрые действия.
 */
export function InstanceCard({ i, match, online, now }: { i: ServerInstance; match?: InstanceMatch; online: boolean; now: number }) {
  const st = instanceState(i, online);
  const live = st.text === "LIVE";
  const waited = match?.status === "ready" && match.server_state === "ready" ? minutesSince(match.server_ready_at, now) : null;
  const players = humanPlayers(i);

  return (
    <div className={cn(ADMIN_CARD, "relative flex flex-col overflow-hidden", live && "bg-danger/[0.03]")}>
      <span className={cn("absolute inset-x-0 top-0 h-[3px]", toneBar[st.tone], live && "animate-pulse")} />
      <div className="flex items-start justify-between gap-2 px-4 pt-4">
        <div>
          <div className="num text-[15px] font-semibold text-fg">{i.name}</div>
          <div className="num text-[11px] text-fg-3">
            :{i.port}
            {i.role === "reserve" ? " · резерв" : ""}
          </div>
        </div>
        <span className={cn("text-[12px] font-medium", toneText[st.tone])}>{st.text}</span>
      </div>

      <div className="px-4 pt-3 pb-3 flex-1 space-y-1.5 text-[13px]">
        {match ? (
          <Link href={`/admin/matches/${match.id}`} className="flex items-center justify-between gap-2 hover:text-accent">
            <span className="truncate font-medium">
              #{match.number} {match.team1?.tag ?? "TBD"} <span className="text-fg-3">vs</span> {match.team2?.tag ?? "TBD"}
            </span>
            {match.status === "live" && (
              <span className="num text-fg">
                {match.team1_score}:{match.team2_score}
              </span>
            )}
          </Link>
        ) : (
          <div className="text-fg-3">{i.running ? "Матча нет" : "—"}</div>
        )}
        <div className="flex items-center justify-between gap-2 text-[12px] text-fg-3">
          <span className="num truncate">{i.map ?? "—"}</span>
          <span className="num">{players != null ? `${players}/10` : "—"}</span>
        </div>
        {match?.server_state === "loading" && <div className="text-[12px] text-warn">загружает матч…</div>}
        {match?.server_state === "error" && <div className="text-[12px] text-danger">карта не загрузилась</div>}
        {waited != null && (
          <div className={cn("text-[12px] num", waited >= 15 ? "text-danger font-semibold" : waited >= 10 ? "text-warn" : "text-ok")}>
            ждём игроков {waited} мин{waited >= 15 ? " · неявка" : ""}
          </div>
        )}
      </div>

      {online && (
        <div className="border-t border-white/[0.06] px-2 py-2">
          <ServerActions instance={i.name} running={!!i.running} align="start" />
        </div>
      )}
    </div>
  );
}
