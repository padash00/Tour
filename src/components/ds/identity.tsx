import Link from "next/link";
import { Bot, Crown } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "./cn";

/*
 * Сущности F16 DS — одинаковые в турнире, матче, команде и лобби.
 *   Avatar · TeamLogo · FaceitLevel · PlayerIdentity · TeamIdentity · Score
 */

const AV = { xs: 24, sm: 32, md: 40, lg: 56, xl: 96 } as const;
export type AvatarSize = keyof typeof AV;

export function Avatar({ src, name, size = "md", className }: { src?: string | null; name: string; size?: AvatarSize; className?: string }) {
  const px = AV[size];
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={px} height={px} className={cn("shrink-0 rounded-full bg-surface-3 object-cover", className)} style={{ width: px, height: px }} />
  ) : (
    <span className={cn("grid shrink-0 place-items-center rounded-full bg-surface-3 font-semibold text-fg-3", className)} style={{ width: px, height: px, fontSize: px * 0.4 }} aria-hidden>
      {name.slice(0, 1).toUpperCase()}
    </span>
  );
}

export function TeamLogo({ src, tag, size = "md", className }: { src?: string | null; tag: string; size?: AvatarSize; className?: string }) {
  const px = AV[size];
  const radius = px >= 56 ? 12 : 8;
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" className={cn("shrink-0 object-contain", className)} style={{ width: px, height: px, borderRadius: radius }} />
  ) : (
    <span
      className={cn("grid shrink-0 place-items-center border border-line-subtle bg-surface-3 font-bold tracking-tight text-fg-2", className)}
      style={{ width: px, height: px, fontSize: Math.max(10, px * 0.3), borderRadius: radius }}
      aria-hidden
    >
      {tag.slice(0, 4).toUpperCase()}
    </span>
  );
}

/** Уровень FACEIT — цвет по уровню, число всегда видно */
export function FaceitLevel({ level, className }: { level: number | null | undefined; className?: string }) {
  if (!level) return null;
  const color = level >= 10 ? "#ff5a1f" : level >= 8 ? "#ff8a3d" : level >= 4 ? "#e3b465" : level >= 2 ? "#58c99b" : "#aeb8c7";
  return (
    <span
      className={cn("num inline-grid size-6 shrink-0 place-items-center rounded-full border-2 text-[11px] font-bold", className)}
      style={{ borderColor: color, color }}
      title={`FACEIT, уровень ${level}`}
      aria-label={`FACEIT, уровень ${level}`}
    >
      {level}
    </span>
  );
}

/** Игрок в строке: аватар, ник, вторая строка (ELO, роль), метки капитана / хоста / бота */
export function PlayerIdentity({
  name,
  avatar,
  href,
  meta,
  size = "sm",
  captain,
  bot,
  trailing,
}: {
  name: string;
  avatar?: string | null;
  href?: string;
  meta?: ReactNode;
  size?: AvatarSize;
  captain?: boolean;
  bot?: boolean;
  trailing?: ReactNode;
}) {
  const nick = href ? (
    <Link href={href} className="truncate font-medium text-fg hover:text-accent">
      {name}
    </Link>
  ) : (
    <span className={cn("truncate font-medium", bot ? "text-fg-2" : "text-fg")}>{name}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      {bot ? (
        <span className="grid shrink-0 place-items-center rounded-full bg-surface-3 text-fg-3" style={{ width: AV[size], height: AV[size] }}>
          <Bot className="size-1/2" />
        </span>
      ) : (
        <Avatar src={avatar} name={name} size={size} />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5 text-[14px]">
          {captain && <Crown className="size-3.5 text-warn" aria-label="Капитан" />}
          {nick}
        </div>
        {meta && <div className="truncate text-meta text-fg-3">{meta}</div>}
      </div>
      {trailing}
    </div>
  );
}

export function TeamIdentity({ name, tag, logo, href, meta, size = "sm" }: { name: string; tag: string; logo?: string | null; href?: string; meta?: ReactNode; size?: AvatarSize }) {
  const title = href ? (
    <Link href={href} className="truncate font-semibold text-fg hover:text-accent">
      {name}
    </Link>
  ) : (
    <span className="truncate font-semibold text-fg">{name}</span>
  );
  return (
    <div className="flex min-w-0 items-center gap-3">
      <TeamLogo src={logo} tag={tag} size={size} />
      <div className="min-w-0">
        <div className="truncate text-[14px]">{title}</div>
        {meta && <div className="truncate text-meta text-fg-3">{meta}</div>}
      </div>
    </div>
  );
}

/** Счёт: 13 : 8. Победитель ярче, проигравший приглушён; live — красная точка не нужна, её даёт Status */
export function Score({ a, b, winner, size = "md", className }: { a: number | string; b: number | string; winner?: 1 | 2 | null; size?: "sm" | "md" | "lg" | "xl"; className?: string }) {
  const fs = { sm: "text-[14px]", md: "text-[20px]", lg: "text-[32px]", xl: "text-[48px]" }[size];
  return (
    <span className={cn("num inline-flex items-baseline gap-[0.3em] font-semibold leading-none tabular-nums", fs, className)}>
      <span className={cn(winner === 2 && "text-fg-3")}>{a}</span>
      <span className="text-fg-4">:</span>
      <span className={cn(winner === 1 && "text-fg-3")}>{b}</span>
    </span>
  );
}
