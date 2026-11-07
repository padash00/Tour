import Link from "next/link";
import { Lock } from "lucide-react";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getAccess } from "@/lib/private-tournament";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { privateCheckIn, respondPrivateInvite } from "@/app/actions/private-tournament";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, Callout, FaceitLevel } from "@/components/ds";

type Member = {
  status: string;
  checked_in_at: string | null;
  is_reserve: boolean;
  player: { id: string; nickname: string; steam_id: string; avatar_url: string | null; faceit_level: number | null; faceit_elo: number | null };
};

/**
 * Закрытый турнир на странице турнира: приглашение («Принять / Отказаться»), личный check-in,
 * своя пара, список участников. Вместо обычной панели заявки команды.
 */
export async function PrivatePanel({ t }: { t: Pick<Tournament, "id" | "slug" | "status" | "checkin_opens_at" | "checkin_closes_at"> }) {
  const player = await getCurrentPlayer();
  const [access, { data: rows }, { data: pairRows }] = await Promise.all([
    player ? getAccess(t.id, player.id) : Promise.resolve(null),
    db()
      .from("tournament_access")
      .select("status, checked_in_at, is_reserve, player:players!tournament_access_player_id_fkey(id, nickname, steam_id, avatar_url, faceit_level, faceit_elo)")
      .eq("tournament_id", t.id)
      .in("status", ["accepted", "invited"]),
    db().from("teams").select("id, name, team_members(player_id)").eq("private_tournament_id", t.id),
  ]);
  const members = ((rows ?? []) as unknown as Member[]).sort(
    (a, b) => Number(!!b.checked_in_at) - Number(!!a.checked_in_at) || (b.player.faceit_elo ?? 0) - (a.player.faceit_elo ?? 0),
  );
  const accepted = members.filter((m) => m.status === "accepted");
  const waiting = members.filter((m) => m.status === "invited").length;
  const myPair = player ? (pairRows ?? []).find((p) => p.team_members.some((m) => m.player_id === player.id)) : null;
  const checkinOpen = t.status === "checkin";
  const ended = ["finished", "cancelled"].includes(t.status);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-[13.5px] font-semibold text-fg-3">
        <Lock className="size-4" aria-hidden /> Закрытый турнир — видят только приглашённые
      </div>

      {access?.status === "invited" && !ended && (
        <Callout
          tone="warn"
          title="Вас пригласили в закрытый турнир 2×2"
          action={
            <>
              <ActionForm action={respondPrivateInvite} inline>
                <input type="hidden" name="tournamentId" value={t.id} />
                <input type="hidden" name="decision" value="accept" />
                <SubmitButton>Принять приглашение</SubmitButton>
              </ActionForm>
              <ActionForm action={respondPrivateInvite} inline>
                <input type="hidden" name="tournamentId" value={t.id} />
                <input type="hidden" name="decision" value="decline" />
                <SubmitButton variant="ghost" confirm="Отказаться от участия? Страница турнира перестанет быть вам видна.">
                  Отказаться
                </SubmitButton>
              </ActionForm>
            </>
          }
        >
          Примите приглашение, а перед стартом отметьтесь на check-in. Пары составит организатор из тех, кто пришёл: случайно или по FACEIT ELO.
        </Callout>
      )}

      {access?.status === "accepted" && (
        <>
          {myPair ? (
            <Callout tone="ok" title={`Ваша пара: ${myPair.name}`}>
              Вызовы на матч, бан-пик и адрес сервера придут на сайт и в Telegram.
            </Callout>
          ) : access.is_reserve ? (
            <Callout tone="info" title="Вы запасной">
              Игроков нечётное число — вы в запасе. Если кто-то из пар не сможет играть, организатор поставит вас вместо него.
            </Callout>
          ) : access.checked_in_at ? (
            <Callout tone="ok" title="Вы отметились на check-in">
              Ждите — после check-in организатор составит пары.
            </Callout>
          ) : checkinOpen ? (
            <Callout
              tone="warn"
              title="Идёт check-in — отметьтесь"
              action={
                <ActionForm action={privateCheckIn} inline>
                  <input type="hidden" name="tournamentId" value={t.id} />
                  <SubmitButton>Я на месте</SubmitButton>
                </ActionForm>
              }
            >
              В пары попадут только отметившиеся.
            </Callout>
          ) : (
            !ended && (
              <Callout tone="ok" title="Вы участник">
                Перед стартом откроется check-in — придёт уведомление на сайт и в Telegram.
              </Callout>
            )
          )}
        </>
      )}

      {!access && isAdmin(player) && (
        <Callout tone="info" title="Вы видите турнир как администратор">
          Приглашения, check-in и пары — в{" "}
          <Link href={`/admin/tournaments/${t.id}?tab=access`} className="font-semibold text-accent hover:underline">
            пульте турнира
          </Link>
          .
        </Callout>
      )}

      <div className="rounded-surface border border-line-subtle bg-surface p-4">
        <div className="flex items-baseline justify-between gap-3">
          <div className="text-[15px] font-bold">Участники</div>
          <div className="text-[13px] text-fg-3">
            {accepted.length} приняли{waiting ? ` · ${waiting} ждут ответа` : ""}
            {checkinOpen || accepted.some((m) => m.checked_in_at) ? ` · ${accepted.filter((m) => m.checked_in_at).length} на месте` : ""}
          </div>
        </div>
        {accepted.length ? (
          <ul className="mt-2 divide-y divide-line-subtle">
            {accepted.map((m) => (
              <li key={m.player.id} className="flex items-center gap-2.5 py-2">
                <Avatar src={m.player.avatar_url} name={m.player.nickname} size="sm" />
                <Link href={`/players/${m.player.steam_id}`} className="min-w-0 flex-1 truncate text-[14.5px] font-semibold hover:text-accent">
                  {m.player.nickname}
                </Link>
                {m.is_reserve && <span className="text-[12.5px] font-semibold text-fg-3">запасной</span>}
                <FaceitLevel level={m.player.faceit_level} />
                <span className="num w-12 text-right text-[13px] text-fg-3">{m.player.faceit_elo ?? "—"}</span>
                <span className={m.checked_in_at ? "text-[13px] font-semibold text-ok" : "text-[13px] text-fg-3"} title={m.checked_in_at ? "Прошёл check-in" : "Ещё не отметился"}>
                  {m.checked_in_at ? "✓" : "·"}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[14px] text-fg-3">Пока никто не принял приглашение.</p>
        )}
      </div>
    </div>
  );
}
