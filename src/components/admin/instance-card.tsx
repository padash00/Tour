import Link from "next/link";
import type { ServerInstance } from "@/lib/server-control";
import { cn } from "@/components/ui";
import { Status, type StatusTone } from "@/components/ds";
import { ADMIN_CARD } from "./control";
import { instanceState, minutesSince, toneBar, type KitTone } from "./kit";
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

/** Состояние сервера простыми словами (kit.instanceState отдаёт технические подписи) */
const PLAIN_STATE: Record<string, string> = {
  LIVE: "Идёт игра",
  "Агент офлайн": "Нет связи",
  Нож: "Раунд на ножах",
  Старт: "Игра начинается",
  Подготовка: "Выбор карт",
};

const STATUS_TONE: Record<KitTone, StatusTone> = { ok: "ok", warn: "warn", danger: "danger", accent: "accent", muted: "neutral" };

/** Подпись состояния сервера для оператора */
export function plainState(text: string) {
  return PLAIN_STATE[text] ?? text;
}

/** Плашка состояния сервера — одинаковая на всех экранах пульта */
export function ServerStatus({ text, tone, size = "md" }: { text: string; tone: KitTone; size?: "sm" | "md" }) {
  const live = text === "LIVE";
  return <Status info={{ label: plainState(text), tone: live ? "live" : STATUS_TONE[tone], pulse: live }} size={size} />;
}

/**
 * Карточка сервера в «живой сетке» обзора: состояние, матч и счёт, карта, игроки,
 * таймер ожидания, управление игрой и сервером кнопками с подписями.
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
    <div className={cn(ADMIN_CARD, "relative flex flex-col overflow-hidden", live && "bg-danger/[0.04]")}>
      {/* полоса состояния сверху */}
      <span className={cn("absolute inset-x-0 top-0 h-1", toneBar[st.tone], live && "animate-pulse")} />

      <div className="flex items-start justify-between gap-3 px-5 pb-1 pt-6">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-fg-3">Игровой сервер</div>
          <div className={cn("num font-bold tracking-[-0.01em] text-fg", hero ? "text-[22px]" : "text-[18px]")}>{i.name}</div>
          <div className="mt-0.5 text-[13px] text-fg-3">
            порт <span className="font-mono">{i.port}</span>
            {i.role === "reserve" ? " · запасной" : ""}
          </div>
        </div>
        <ServerStatus text={st.text} tone={st.tone} />
      </div>

      <div className="flex-1 space-y-3 px-5 pb-5 pt-3">
        {match ? (
          <Link href={`/admin/matches/${match.id}`} className="group block rounded-control bg-surface-2 p-4 transition-colors hover:bg-ink/[0.06]">
            <div className="text-[13.5px] font-semibold text-fg-3">Матч №{match.number}</div>
            <div className="mt-1 flex items-center justify-between gap-3">
              <span className={cn("truncate font-bold group-hover:text-accent", hero ? "text-[20px]" : "text-[17px]")}>
                {match.team1?.tag ?? "TBD"} <span className="font-normal text-fg-3">против</span> {match.team2?.tag ?? "TBD"}
              </span>
              {(match.status === "live" || match.team1_score + match.team2_score > 0) && (
                <span className={cn("num shrink-0 font-bold", hero ? "text-[30px] leading-none" : "text-[22px]")}>
                  {match.team1_score}
                  <span className="text-fg-3">:</span>
                  {match.team2_score}
                </span>
              )}
            </div>
          </Link>
        ) : (
          <div className="rounded-control bg-surface-2 px-4 py-3 text-[15px] text-fg-2">
            {i.running ? "Сервер включён, матча на нём нет." : "Сервер выключен."}
          </div>
        )}

        <div className="flex items-center justify-between gap-3 text-[14px]">
          <span className="text-fg-3">
            Карта: <span className="font-mono text-fg-2">{i.map ?? "—"}</span>
          </span>
          <span className={cn("font-semibold", players ? "text-fg" : "text-fg-3")}>{players != null ? `Игроков: ${players} из 10` : "Игроков нет"}</span>
        </div>
        {hero && players != null && (
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
            <div className={cn("h-full rounded-full", live ? "bg-danger" : "bg-accent")} style={{ width: `${Math.min(100, players * 10)}%` }} />
          </div>
        )}
        {liveMap && (
          <div className="flex items-center justify-between gap-2 text-[14px]">
            <span className="truncate text-fg-2">
              Карта {liveMap.map_number} · {mapName(liveMap.map_name)}
            </span>
            <span className="num shrink-0 font-semibold text-fg">
              {liveMap.team1_score}:{liveMap.team2_score} <span className="font-normal text-fg-3">· раунд {round}</span>
            </span>
          </div>
        )}
        {match?.server_state === "loading" && <div className="text-[14px] font-medium text-warn">Загружаем матч на сервер…</div>}
        {match?.server_state === "error" && <div className="text-[14px] font-medium text-danger">Карта не загрузилась — нужен другой сервер.</div>}
        {waited != null && (
          <div className={cn("num text-[14px]", waited >= 15 ? "font-semibold text-danger" : waited >= 10 ? "font-medium text-warn" : "text-ok")}>
            Ждём игроков {waited} мин{waited >= 15 ? " · похоже, неявка" : ""}
          </div>
        )}
      </div>

      {online && liveMap && match && (
        <div className="border-t border-line-subtle px-5 py-4">
          <div className="mb-2.5 text-[14px] font-bold text-fg">Управление игрой</div>
          <div className="flex flex-wrap gap-2">
            {[
              { cmd: "css_forcepause", label: "Поставить на паузу" },
              { cmd: "css_forceunpause", label: "Продолжить игру" },
            ].map((c) => (
              <ActionForm key={c.cmd} action={serverRcon} inline>
                <input type="hidden" name="instance" value={i.name} />
                <input type="hidden" name="command" value={c.cmd} />
                <SubmitButton size="sm" variant="secondary" className="sm:h-10">
                  {c.label}
                </SubmitButton>
              </ActionForm>
            ))}
            <ActionForm action={restoreRound} inline>
              <input type="hidden" name="matchId" value={match.id} />
              <input type="hidden" name="round" value={round ?? 1} />
              <SubmitButton size="sm" variant="secondary" className="sm:h-10" confirm={`Переиграть раунд ${round} на ${i.name}? Счёт и деньги вернутся на его начало.`}>
                Переиграть раунд
              </SubmitButton>
            </ActionForm>
          </div>
          <p className="mt-2 text-[13px] text-fg-3">Пауза останавливает игру для всех. «Переиграть раунд» возвращает счёт и деньги на начало текущего раунда.</p>
        </div>
      )}
      {online && (
        <div className="border-t border-line-subtle bg-surface-2 px-5 py-4">
          <div className="mb-2.5 text-[14px] font-bold text-fg">Управление сервером</div>
          <ServerActions instance={i.name} running={!!i.running} align="start" />
        </div>
      )}
    </div>
  );
}
