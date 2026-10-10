import { Crown } from "lucide-react";
import { Avatar, cn } from "@/components/ds";

export type StripMember = { id: string; role: string; player: { nickname: string; avatar_url: string | null } };

/**
 * Состав одной строкой: аватары основы и запаса, свободные места — пунктирные кружки.
 * Видно сразу, сколько игроков не хватает. Используется в штабе, приглашении и заявке.
 */
export function RosterStrip({
  members,
  maxMain,
  maxSubs,
  center,
  className,
}: {
  members: StripMember[];
  maxMain: number;
  maxSubs: number;
  center?: boolean;
  className?: string;
}) {
  const mains = members.filter((m) => m.role !== "substitute").sort((a, b) => Number(b.role === "captain") - Number(a.role === "captain"));
  const subs = members.filter((m) => m.role === "substitute");
  const slot = (key: string, sub: boolean) => (
    <span key={key} aria-hidden className={cn("rounded-full border border-dashed border-line-strong bg-surface", sub ? "size-8" : "size-10")} />
  );
  const face = (m: StripMember, sub: boolean) => (
    <span key={m.id} className="relative" title={`${m.player.nickname}${m.role === "captain" ? " · капитан" : sub ? " · запас" : ""}`}>
      <Avatar src={m.player.avatar_url} name={m.player.nickname} size={sub ? "sm" : "md"} className="ring-2 ring-surface" />
      {m.role === "captain" && (
        <span className="absolute -right-1 -top-1 grid size-[18px] place-items-center rounded-full border border-line bg-surface-3 text-warn [&>svg]:size-2.5">
          <Crown aria-label="Капитан" />
        </span>
      )}
    </span>
  );

  return (
    <div className={cn("flex flex-wrap items-end gap-x-5 gap-y-3", center && "justify-center", className)}>
      <div>
        <div className="flex gap-1.5">
          {mains.map((m) => face(m, false))}
          {Array.from({ length: Math.max(0, maxMain - mains.length) }, (_, i) => slot(`m${i}`, false))}
        </div>
        <div className={cn("num mt-1.5 text-micro text-fg-3", center && "text-center")}>
          Основа {mains.length}/{maxMain}
        </div>
      </div>
      {maxSubs > 0 && (
        <div>
          <div className="flex gap-1.5">
            {subs.map((m) => face(m, true))}
            {Array.from({ length: Math.max(0, maxSubs - subs.length) }, (_, i) => slot(`s${i}`, true))}
          </div>
          <div className={cn("num mt-1.5 text-micro text-fg-3", center && "text-center")}>
            Запас {subs.length}/{maxSubs}
          </div>
        </div>
      )}
    </div>
  );
}
