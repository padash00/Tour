import type { ReactNode } from "react";
import { tournamentStatusLabel } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";
import { cn } from "@/components/ui";
import { ADMIN_CARD } from "./control";

/*
 * F16 Control — общий визуальный язык страницы турнира: белые карточки как на сайте,
 * крупный читаемый текст (подписи 14 px, основной текст 15 px), статусы цветной точкой.
 */

/** Поверхность-карточка как на сайте */
export const CARD = ADMIN_CARD;
/** Карточка-список со строками */
export const CARD_LIST = `${ADMIN_CARD} divide-y divide-ink/[0.06]`;

/** Размер кнопок в пульте: крупнее стандартного «sm», чтобы попасть пальцем и прочитать с первого раза */
export const BTN = "!h-11 !px-4 !text-[15px] !rounded-control";
/** Совсем маленькая кнопка внутри плотной строки (например, «OK» у номера посева) */
export const BTN_SM = "!h-10 !px-3.5 !text-[14px] !rounded-control";

/** Подпись-надзаголовок: обычный регистр, 14 px */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[14px] font-semibold text-fg-2", className)}>{children}</div>;
}

const TONE: Partial<Record<TournamentStatus, string>> = {
  registration: "text-ok border-ok/35 bg-ok-dim",
  checkin: "text-warn border-warn/35 bg-warn-dim",
  live: "text-danger border-danger/35 bg-danger-dim",
  cancelled: "text-danger border-danger/25 bg-danger-dim",
};

/** Статус турнира: чип с точкой, тот же стиль, что на главной */
export function StatusChip({ status }: { status: TournamentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13.5px] font-semibold whitespace-nowrap",
        TONE[status] ?? "text-fg-2 border-line bg-ink/[0.04]",
      )}
    >
      <span className={cn("size-2 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {tournamentStatusLabel[status]}
    </span>
  );
}

/** Ячейка полосы показателей: подпись + крупная цифра + пояснение */
export function BarCell({
  label,
  value,
  hint,
  tone,
  className,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "ok" | "warn" | "danger";
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 p-5", className)}>
      <div className="text-[14px] font-semibold text-fg-3">{label}</div>
      <div
        className={cn(
          "mt-2 num text-[28px] font-bold leading-none tracking-[-0.02em]",
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-2 text-[13.5px] text-fg-3">{hint}</div>}
    </div>
  );
}
