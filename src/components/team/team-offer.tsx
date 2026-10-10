import type { ReactNode } from "react";
import { Avatar, Eyebrow, TeamLogo } from "@/components/ds";
import { RosterStrip, type StripMember } from "./roster-strip";

/**
 * Карточка «вступить в команду» — одна для приглашения по ссылке (/join) и заявки (/teams/…/apply):
 * логотип, название, капитан, состав со свободными местами; ниже — действие.
 */
export function TeamOfferCard({
  team,
  members,
  eyebrow,
  maxMain,
  maxSubs,
  children,
}: {
  team: { name: string; tag: string; logo_url: string | null };
  members: StripMember[];
  eyebrow: string;
  maxMain: number;
  maxSubs: number;
  children: ReactNode;
}) {
  const captain = members.find((m) => m.role === "captain");
  return (
    <div className="w-full rounded-feature border border-line-subtle bg-surface p-6 text-center sm:p-10">
      <div className="flex justify-center">
        <TeamLogo src={team.logo_url} tag={team.tag} size="xl" />
      </div>
      <Eyebrow className="mt-6 block">{eyebrow}</Eyebrow>
      <h1 className="mt-2 break-words text-page text-fg">{team.name}</h1>
      {captain && (
        <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-meta text-fg-3">
          <Avatar src={captain.player.avatar_url} name={captain.player.nickname} size="xs" />
          Капитан <span className="text-fg-2">{captain.player.nickname}</span>
        </div>
      )}
      <RosterStrip members={members} maxMain={maxMain} maxSubs={maxSubs} center className="mt-6" />
      <div className="mt-8 text-left">{children}</div>
    </div>
  );
}
