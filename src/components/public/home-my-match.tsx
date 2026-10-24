"use client";

import Link from "next/link";
import { ArrowRight, Copy } from "lucide-react";
import { Timer, cn } from "@/components/ds";
import { useToast } from "../toast";
import { useViewer, type Activity } from "../viewer";

/*
 * Главная: «Ваш матч» — самое срочное действие вошедшего игрока (lib/activity.ts) крупной карточкой.
 * Страница из кэша CDN, поэтому карточка — на клиенте; нет действия — ничего не рисуется.
 */

const TONE: Record<Activity["tone"], { border: string; badge: string; dot: string }> = {
  live: { border: "border-live", badge: "bg-danger-dim text-live", dot: "bg-live" },
  ok: { border: "border-ok", badge: "bg-ok-dim text-ok", dot: "bg-ok" },
  accent: { border: "border-accent", badge: "bg-accent-dim text-accent", dot: "bg-accent" },
  warn: { border: "border-warn", badge: "bg-warn-dim text-warn", dot: "bg-warn" },
};

/** Что сделать, простыми словами — по виду действия */
const HOW: Partial<Record<Activity["kind"], string>> = {
  server_ready: "Откройте CS2 и вставьте адрес сервера в консоль (клавиша ~). Кнопка ниже копирует его.",
  lobby_server_ready: "Откройте CS2 и вставьте адрес сервера в консоль (клавиша ~). Кнопка ниже копирует его.",
  veto_turn: "Ваша очередь убрать или выбрать карту. Если не успеете, карту выберет сайт.",
  lobby_veto_turn: "Ваша очередь убрать или выбрать карту. Если не успеете, карту выберет сайт.",
  checkin: "Подтвердите, что команда на месте, иначе её снимут с турнира.",
  live: "Матч идёт. Если вылетела игра — подключитесь ещё раз, раунд сохранится.",
  lobby_live: "Матч идёт. Если вылетела игра — подключитесь ещё раз.",
};

export function HomeMyMatch() {
  const { player, activity, moreActivity } = useViewer();
  const toast = useToast();
  if (!player || !activity) return null;
  const tone = TONE[activity.tone];
  const how = HOW[activity.kind];
  return (
    <section aria-label="Ваш матч" className={cn("grid gap-5 rounded-surface border-2 bg-surface p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center", tone.border)}>
      <div className="flex min-w-0 flex-col gap-2">
        <span className={cn("inline-flex w-fit items-center gap-2 rounded-full px-3 py-1 text-[14px] font-bold", tone.badge)}>
          <span className={cn("size-2 rounded-full", tone.dot, activity.priority <= 3 && "animate-pulse")} aria-hidden />
          {activity.label}
          {moreActivity > 0 && <span className="text-fg-3">· ещё {moreActivity}</span>}
        </span>
        <h2 className="text-[22px] font-extrabold leading-tight text-fg sm:text-[26px]">{activity.detail}</h2>
        {how && <p className="max-w-[60ch] text-[16px] text-fg-2">{how}</p>}
        {activity.deadline && (
          <p className="text-[15px] text-fg-2">
            Осталось <Timer deadline={activity.deadline} urgentAt={activity.priority === 4 ? 300 : 10} className="font-bold text-fg" />
          </p>
        )}
      </div>
      <div className="flex flex-col gap-2.5 md:min-w-[280px]">
        <Link
          href={activity.href}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-control bg-accent px-5 text-[16px] font-bold text-accent-ink transition-colors hover:bg-accent-strong"
        >
          Открыть матч
          <ArrowRight className="size-5" />
        </Link>
        {activity.connect && (
          <button
            type="button"
            onClick={() =>
              navigator.clipboard.writeText(`connect ${activity.connect}`).then(
                () => toast.success(`Скопировано: connect ${activity.connect} — вставьте в консоль CS2 (~)`),
                () => toast.error(`Адрес сервера: ${activity.connect}`),
              )
            }
            className="inline-flex h-12 items-center justify-center gap-2 rounded-control border border-line-strong bg-surface px-4 text-[15px] font-semibold text-fg transition-colors hover:bg-surface-2"
          >
            <Copy className="size-4" />
            <span className="num-code truncate">connect {activity.connect}</span>
          </button>
        )}
      </div>
    </section>
  );
}
