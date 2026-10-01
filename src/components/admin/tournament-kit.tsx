import type { ReactNode } from "react";
import { tournamentStatusLabel } from "@/lib/format";
import type { TournamentStatus } from "@/lib/types";
import { cn } from "@/components/ui";

/*
 * F16 Control — общий визуальный язык с публичным сайтом (src/components/public/home.tsx),
 * но плотнее: компактные строки, мелкий шрифт, статусы точкой.
 */

/** Поверхность-карточка как на сайте */
export const CARD = "rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80";
/** Карточка-список со строками */
export const CARD_LIST = `${CARD} divide-y divide-white/[0.06]`;

/** Подпись-надзаголовок: капс с разрядкой, как Eyebrow на сайте */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[11px] font-medium uppercase tracking-[0.26em] text-[#7f93b0]", className)}>{children}</div>;
}

const TONE: Partial<Record<TournamentStatus, string>> = {
  registration: "text-ok border-ok/35 bg-ok/[0.07]",
  checkin: "text-warn border-warn/35 bg-warn/[0.07]",
  live: "text-danger border-danger/35 bg-danger/[0.07]",
  cancelled: "text-danger/80 border-danger/25 bg-danger/[0.04]",
};

/** Статус турнира: компактный чип с точкой, тот же стиль, что на главной */
export function StatusChip({ status }: { status: TournamentStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-[5px] border px-2 text-[11px] font-medium whitespace-nowrap",
        TONE[status] ?? "text-fg-2 border-white/15 bg-white/[0.03]",
      )}
    >
      <span className={cn("size-1.5 rounded-full bg-current", status === "live" && "animate-pulse")} />
      {tournamentStatusLabel[status]}
    </span>
  );
}

/** Ячейка операционной полосы: подпись + крупная цифра + пояснение */
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
    <div className={cn("p-5 min-w-0", className)}>
      <Label className="text-[10px]">{label}</Label>
      <div
        className={cn(
          "mt-2.5 num text-[24px] font-semibold leading-none tracking-[-0.02em]",
          tone === "ok" ? "text-ok" : tone === "warn" ? "text-warn" : tone === "danger" ? "text-danger" : "text-fg",
        )}
      >
        {value}
      </div>
      {hint && <div className="mt-1.5 text-[12px] text-fg-3">{hint}</div>}
    </div>
  );
}
