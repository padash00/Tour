import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { checkIn } from "@/app/actions/tournament";
import { requirePlayer } from "@/lib/auth";
import { getEntrantTeam, getRegistration, getTournamentBySlug, getTournamentRegistrations } from "@/lib/data";
import { formatDateTime, formatTime } from "@/lib/format";
import { mainPlayersLabel, modeOf } from "@/lib/modes";
import { ActionForm, SubmitButton } from "@/components/forms";
import { FlowHeader } from "@/components/competition/step";
import { TimeLeft } from "@/components/competition/time-left";
import { Avatar, Container, EmptyState, Notice, TeamLogo, cn } from "@/components/ui";

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
    <Link href={`/tournaments/${t.slug}`} className="hover:text-fg-2">
      ← {t.name}
    </Link>
  );
  const window_ = t.checkin_opens_at
    ? `Окно: ${formatDateTime(t.checkin_opens_at)}${t.checkin_closes_at ? ` – ${formatTime(t.checkin_closes_at)}` : ""}`
    : undefined;

  if (!myTeam || !reg || reg.status !== "approved") {
    return (
      <Container size="form">
        <FlowHeader back={back} title="Check-in" description={window_} />
        <EmptyState title="Вы не участвуете в турнире" description="Check-in проходят только участники с одобренной заявкой." />
      </Container>
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
    <Container size="form">
      <FlowHeader back={back} title="Check-in" description={window_} />

      <div className="flex items-center gap-4 pb-8 border-b border-line">
        <TeamLogo src={team.logo_url} tag={team.tag} size={48} />
        <div className="flex-1 min-w-0">
          <div className="text-lg font-semibold truncate">{team.name}</div>
          <div className="text-sm text-fg-3">
            Готово {checked} из {approved.length}
          </div>
        </div>
      </div>

      <ul className="py-4">
        {roster.map((r) => {
          const bad = r.player.is_banned || !/^\d{17}$/.test(r.player.steam_id);
          return (
            <li key={r.id} className="flex items-center gap-4 h-14">
              <span className={cn("w-4 text-center", bad ? "text-danger" : "text-ok")}>{bad ? "✕" : "✓"}</span>
              <Avatar src={r.player.avatar_url} name={r.player.nickname} size={28} />
              <span className="flex-1 truncate">{r.player.nickname}</span>
              <span className="text-[13px] text-fg-3">
                {r.player_id === team.captain_id ? "Капитан" : r.role === "sub" ? "Запасной" : ""}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="pt-8 border-t border-line">
        <div className={cn("text-[30px] md:text-[36px] font-bold tracking-[-0.035em]", ready ? "text-ok" : problems.length ? "text-danger" : "")}>
          {ready ? "Команда готова" : problems.length ? "Нужно исправить состав" : "Состав в порядке"}
        </div>
        {problems.length > 0 && !ready && (
          <ul className="mt-3 space-y-1 text-sm text-fg-2">
            {problems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        )}
        {ready ? (
          <p className="mt-3 text-fg-2">
            Check-in пройден {formatDateTime(reg.checked_in_at!)}. Ждите публикации сетки и своего первого матча.
          </p>
        ) : t.status !== "checkin" ? (
          <div className="mt-5">
            <Notice>Check-in ещё не открыт. Мы пришлём уведомление, когда он начнётся.</Notice>
          </div>
        ) : isCaptain ? (
          <div className="mt-8 flex flex-wrap items-center gap-x-10 gap-y-5">
            <ActionForm action={checkIn}>
              <input type="hidden" name="tournamentId" value={t.id} />
              <SubmitButton size="lg" className="px-10 tracking-[0.06em]" pendingText="Проверяем…">
                CHECK-IN
              </SubmitButton>
            </ActionForm>
            {t.checkin_closes_at && (
              <div>
                <div className="text-[13px] text-fg-3">До конца check-in</div>
                <div className="num text-xl font-semibold">
                  <TimeLeft deadline={t.checkin_closes_at} />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5">
            <Notice>Check-in проходит капитан команды.</Notice>
          </div>
        )}
      </div>
    </Container>
  );
}
