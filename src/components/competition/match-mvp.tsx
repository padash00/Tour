import Link from "next/link";
import { Star } from "lucide-react";
import type { PlayerAgg } from "@/lib/stats";
import type { Team } from "@/lib/types";
import { Avatar, CARD_SECTION, TeamLogo, cn } from "@/components/ds";
import { RatingPill } from "../stats-table";
import { fmt } from "../stats-format";

/** MVP матча: игрок с лучшим рейтингом по сыгранным картам — аватар, команда и главные цифры */
export function MatchMvp({
  p,
  player,
  team,
  live,
}: {
  p: PlayerAgg;
  player: { nickname: string; avatar_url: string | null; steam_id: string } | null;
  team: Pick<Team, "name" | "tag" | "logo_url"> | null;
  /** матч идёт — «лучший игрок сейчас» */
  live?: boolean;
}) {
  const nick = player?.nickname ?? p.name;
  const diff = p.kills - p.deaths;
  const facts: { label: string; value: string; tone?: string }[] = [
    { label: "Убийства – смерти", value: `${p.kills}–${p.deaths}`, tone: diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : undefined },
    { label: "Урон за раунд", value: fmt.d1(p.adr) },
    ...(p.kastRounds > 0 ? [{ label: "KAST", value: fmt.pct(p.kast) }] : []),
    ...(p.swing != null ? [{ label: "Swing", value: fmt.swing(p.swing), tone: p.swing >= 1 ? "text-ok" : p.swing <= -1 ? "text-danger" : undefined }] : []),
  ];
  const name = <span className="truncate">{nick}</span>;
  return (
    <section className={cn(CARD_SECTION, "border-gold/40")} aria-label="MVP матча">
      <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <span className="relative shrink-0">
            <Avatar src={player?.avatar_url} name={nick} size="lg" />
            <span className="absolute -bottom-1 -right-1 grid size-6 place-items-center rounded-full bg-gold text-white ring-2 ring-surface" aria-hidden>
              <Star className="size-3.5 fill-current" />
            </span>
          </span>
          <div className="min-w-0">
            <div className="text-[13px] font-extrabold uppercase tracking-[0.06em] text-gold">{live ? "Лучший игрок сейчас" : "MVP матча"}</div>
            <div className="flex min-w-0 items-center text-[22px] font-extrabold leading-tight text-fg">
              {player ? (
                <Link href={`/players/${player.steam_id}`} className="flex min-w-0 hover:text-accent">
                  {name}
                </Link>
              ) : (
                name
              )}
            </div>
            {team && (
              <div className="mt-0.5 flex items-center gap-2 text-[14px] text-fg-3">
                <TeamLogo src={team.logo_url} tag={team.tag} size="xs" />
                <span className="truncate">{team.name}</span>
              </div>
            )}
          </div>
        </div>
        <dl className="flex flex-wrap items-end gap-x-7 gap-y-3">
          <div>
            <dt className="text-[13px] text-fg-3">Рейтинг</dt>
            <dd className="mt-1">
              <RatingPill value={p.rating} className="text-[18px]" />
            </dd>
          </div>
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-[13px] text-fg-3">{f.label}</dt>
              <dd className={cn("num mt-1 text-[20px] font-extrabold leading-none text-fg", f.tone)}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
