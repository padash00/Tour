import type { Metadata } from "next";
import { LiveRefresh } from "@/components/live-refresh";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkIn } from "@/app/actions/tournament";
import { requirePlayer } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { formatDateTime, formatTime } from "@/lib/format";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { ActionForm, SubmitButton } from "@/components/forms";
import { TimeLeft } from "@/components/competition/time-left";
import { Avatar, TeamLogo, cn } from "@/components/ui";
import { Button, EmptyCard, Flow, FlowHeader } from "@/components/primitives";
import { Callout } from "@/components/public/callout";

export const metadata: Metadata = { title: "Check-in" };

export default async function CheckinPage(props: PageProps<"/tournaments/[slug]/checkin">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/checkin`);
  const myTeam = await getEntrantTeam(player, t);
  const reg = myTeam ? await getRegistration(t.id, myTeam.id) : null;
  const all = await getTournamentRegistrations(t.id);
  const approved = all.filter((r) => r.status === "approved");
  const checked = approved.filter((r) => r.checked_in_at).length;

  const back = (
    <Link href={`/tournaments/${t.slug}`} className="inline-flex min-h-11 items-center lg:min-h-0 hover:text-fg-2">
      ← {t.name}
    </Link>
  );
  const window_ = t.checkin_opens_at
    ? `Окно: ${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? ` – ${formatTime(t.checkin_closes_at)}` : ""}`
    : undefined;

  if (!myTeam || !reg || reg.status !== "approved") {
    return (
      <Flow>
        <FlowHeader back={back} title="Check-in" description={window_} />
        <EmptyCard
          title="Вы не участвуете в турнире"
          text="Check-in проходят только участники с одобренной заявкой."
          action={
            <Button href={`/tournaments/${t.slug}`} variant="secondary" size="md">
              К турниру
            </Button>
          }
        />
      </Flow>
    );
  }

  const team = myTeam;
  const isCaptain = team.captain_id === player.id;
  const mode = modeOf(t.format);
  const mains = reg.roster.filter((r) => r.role === "main");
  const problems = [
    mains.length !== mode.size && `В основе должно быть ${mainPlayersLabel(mode.size)} (сейчас ${mains.length})`,
    !reg.roster.every((r) => /^\d{17}$/.test(r.player.steam_id)) && "Есть игроки с неверным SteamID",
    reg.roster.some((r) => r.player.is_banned) && "В составе есть заблокированный игрок",
  ].filter(Boolean) as string[];
  const ready = !!reg.checked_in_at;
  const roster = [...reg.roster].sort((a, b) => (a.role === b.role ? 0 : a.role === "main" ? -1 : 1));

  return (
    <Flow>
      <LiveRefresh watch={`tournament:${t.id}`} intervalMs={5000} />
      <FlowHeader back={back} title="Check-in" description={window_} />

      <div className="rounded-[12px] border border-white/[0.08] bg-[#0b1420]/80 p-7 lg:p-9">
      <div className="flex items-center gap-5 pb-7 border-b border-white/[0.08]">
        <TeamLogo src={team.logo_url} tag={team.tag} size={56} />
        <div className="flex-1 min-w-0">
          <div className="text-[22px] lg:text-[26px] font-semibold truncate">{team.name}</div>
          <div className="mt-1 flex items-center gap-3 text-[14px] lg:text-[15px] text-fg-3">
            <span>
              Готово {checked} из {approved.length}
            </span>
            <span className="h-1 w-24 overflow-hidden rounded-full bg-white/[0.08]" aria-hidden>
              <span className="block h-full bg-ok/80" style={{ width: `${(checked / Math.max(1, approved.length)) * 100}%` }} />
            </span>
          </div>
        </div>
      </div>

      <ul className="py-4">
        {roster.map((r) => {
          const bad = r.player.is_banned || !/^\d{17}$/.test(r.player.steam_id);
          return (
            <li key={r.id} className="flex items-center gap-4 h-14 lg:text-[17px] border-b border-white/[0.05] last:border-0">
              <span
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full text-[12px]",
                  bad ? "bg-danger/15 text-danger" : "bg-ok/15 text-ok",
                )}
                aria-label={bad ? "Проблема" : "Готов"}
              >
                {bad ? "✕" : "✓"}
              </span>
              <Avatar src={r.player.avatar_url} name={r.player.nickname} size={32} />
              <span className="flex-1 truncate">{r.player.nickname}</span>
              <span className="text-[13px] text-fg-3">
                {r.player_id === team.captain_id ? "Капитан" : r.role === "sub" ? "Запасной" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="pt-8 border-t border-white/[0.08]">
        <div className={cn("text-[32px] lg:text-[44px] font-semibold tracking-[-0.015em]", ready ? "text-ok" : problems.length ? "text-danger" : "")}>
          {ready ? "Команда готова" : problems.length ? "Нужно исправить состав" : "Состав в порядке"}
        </div>
        {problems.length > 0 && !ready && (
          <Callout tone="danger" className="mt-4">
            <ul className="space-y-1">
              {problems.map((p) => (
                <li key={p}>{p}</li>
              ))}
            </ul>
          </Callout>
        )}
        {ready ? (
          <p className="mt-3 text-fg-2">
            Check-in пройден {formatDateTime(reg.checked_in_at!)}. Ждите публикации сетки и своего первого матча.
          </p>
        ) : t.status !== "checkin" ? (
          <div className="mt-5">
            <Callout>Check-in ещё не открыт. Мы пришлём уведомление, когда он начнётся.</Callout>
          </div>
        ) : isCaptain ? (
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-10">
            <ActionForm action={checkIn} className="w-full sm:w-auto">
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="lg" className="h-[60px] w-full px-14 text-[17px] tracking-[0.08em] sm:w-auto" pendingText="Проверяем…">
                CHECK-IN
              </SubmitButton>
            </ActionForm>
            {t.checkin_closes_at && (
              <div>
                <div className="text-[13px] text-fg-3">До конца check-in</div>
                <div className="num text-[28px] font-semibold">
                  <TimeLeft deadline={t.checkin_closes_at} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <Callout>Check-in проходит капитан команды — вам ничего делать не нужно.</Callout>
          </div>
        )}
      </div>
    </div>
    </Flow>
  );
}
