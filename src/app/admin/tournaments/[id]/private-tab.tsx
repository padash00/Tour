import Link from "next/link";
import { adminPrivateCheckIn, buildPrivatePairs, invitePrivatePlayer, revokePrivatePlayer, swapPrivatePlayers } from "@/app/actions/private-tournament";
import { ActionForm, SubmitButton } from "@/components/forms";
import { PlayerPicker, type PickPlayer } from "@/components/pickers";
import { Avatar, EmptyState, FaceitLevel, buttonClass } from "@/components/ui";
import { Panel, TableBox } from "@/components/admin/control";
import { BTN, BTN_SM, CARD } from "@/components/admin/tournament-kit";
import { formatShortDateTime } from "@/lib/format";
import { pairElo } from "@/lib/private-pairs";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";

type Row = {
  status: "invited" | "accepted" | "declined";
  checked_in_at: string | null;
  is_reserve: boolean;
  invited_at: string;
  player: { id: string; nickname: string; steam_id: string; avatar_url: string | null; faceit_level: number | null; faceit_elo: number | null };
};

const STATUS: Record<Row["status"], { text: string; cls: string }> = {
  invited: { text: "ждём ответа", cls: "text-warn" },
  accepted: { text: "принял", cls: "text-ok" },
  declined: { text: "отказался", cls: "text-fg-3" },
};

/** Пульт закрытого турнира: приглашения по нику, check-in за игрока, пары (по ELO / случайно), замена местами */
export async function PrivateTab({ t }: { t: Tournament }) {
  const [{ data: rows }, { data: all }, { data: teams }] = await Promise.all([
    db()
      .from("tournament_access")
      .select("status, checked_in_at, is_reserve, invited_at, player:players!tournament_access_player_id_fkey(id, nickname, steam_id, avatar_url, faceit_level, faceit_elo)")
      .eq("tournament_id", t.id)
      .order("invited_at"),
    db().from("players").select("steam_id, nickname, faceit_elo").eq("is_banned", false).order("nickname").limit(5000),
    db()
      .from("teams")
      .select("id, name, created_at, team_members(role, player:players(id, nickname, faceit_elo, faceit_level))")
      .eq("private_tournament_id", t.id)
      .order("created_at"),
  ]);
  const list = (rows ?? []) as unknown as Row[];
  const taken = new Set(list.filter((r) => r.status !== "declined").map((r) => r.player.steam_id));
  const pick: PickPlayer[] = (all ?? [])
    .filter((p) => p.steam_id && !taken.has(p.steam_id))
    .map((p) => ({ steam_id: p.steam_id, nickname: p.nickname, hint: p.faceit_elo ? `ELO ${p.faceit_elo}` : "без FACEIT" }));
  const accepted = list.filter((r) => r.status === "accepted");
  const checked = accepted.filter((r) => r.checked_in_at);
  const pairs = (teams ?? []).map((tm) => ({
    id: tm.id,
    name: tm.name,
    players: [...tm.team_members].sort((a, b) => (a.role === "captain" ? -1 : b.role === "captain" ? 1 : 0)).map((m) => m.player),
  }));
  const reserve = list.filter((r) => r.is_reserve).map((r) => r.player);
  const inPlan = [...pairs.flatMap((p) => p.players), ...reserve];
  const locked = !!t.bracket_published_at;

  return (
    <div className="space-y-8">
      <Panel title="Как это работает">
        <ol className={`${CARD} list-decimal space-y-1.5 p-5 pl-10 text-[15px] leading-relaxed text-fg-2`}>
          <li>Пригласите игроков по нику — им придёт уведомление на сайт и в Telegram. Турнир видят только приглашённые и админы.</li>
          <li>Игрок открывает страницу турнира и принимает приглашение.</li>
          <li>
            Переведите турнир в статус «Check-in» — принявшим придёт уведомление, каждый жмёт «Я на месте». Пришёл без телефона — отметьте его здесь
            кнопкой «Отметить».
          </li>
          <li>После check-in — «Составить пары». Лишний при нечётном числе становится запасным. Пары можно перемешать заново или поменять двоих местами.</li>
          <li>
            Вкладка{" "}
            <Link href={`/admin/tournaments/${t.id}?tab=bracket`} className="font-semibold text-accent hover:underline">
              «Сетка»
            </Link>{" "}
            → «Создать сетку», дальше автопилот, как обычно. После проверки турнир можно удалить в «Настройках».
          </li>
        </ol>
      </Panel>

      <Panel title={`Приглашённые · ${accepted.length} приняли · ${checked.length} на месте`}>
        <ActionForm action={invitePrivatePlayer} className="mb-4 flex flex-wrap items-start gap-2">
          <input type="hidden" name="tournamentId" value={t.id} />
          <div className="w-full sm:w-96">
            <PlayerPicker name="steamId" players={pick} placeholder="Ник или SteamID игрока" />
          </div>
          <SubmitButton size="md" className={BTN}>
            Пригласить
          </SubmitButton>
        </ActionForm>
        {list.length ? (
          <TableBox>
            <div className="divide-y divide-ink/[0.06]">
              {list.map((r) => (
                <div key={r.player.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <Avatar src={r.player.avatar_url} name={r.player.nickname} size={32} />
                  <Link href={`/players/${r.player.steam_id}`} className="min-w-0 flex-1 truncate text-[15px] font-semibold hover:text-accent">
                    {r.player.nickname}
                  </Link>
                  <FaceitLevel level={r.player.faceit_level} />
                  <span className="num w-14 text-right text-[14px] text-fg-3">{r.player.faceit_elo ?? "—"}</span>
                  <span className={`w-28 text-[14px] font-semibold ${STATUS[r.status].cls}`}>{STATUS[r.status].text}</span>
                  <span className="w-36 text-[14px] text-fg-3">
                    {r.checked_in_at ? <span className="font-semibold text-ok">✓ {formatShortDateTime(r.checked_in_at)}</span> : "без check-in"}
                    {r.is_reserve && <span className="ml-1 font-semibold text-fg-2">· запас</span>}
                  </span>
                  {r.status !== "declined" && (
                    <ActionForm action={adminPrivateCheckIn}>
                      <input type="hidden" name="tournamentId" value={t.id} />
                      <input type="hidden" name="playerId" value={r.player.id} />
                      {r.checked_in_at && <input type="hidden" name="undo" value="1" />}
                      <SubmitButton size="sm" variant={r.checked_in_at ? "ghost" : "secondary"} className={BTN_SM}>
                        {r.checked_in_at ? "Снять" : "Отметить"}
                      </SubmitButton>
                    </ActionForm>
                  )}
                  <ActionForm action={revokePrivatePlayer}>
                    <input type="hidden" name="tournamentId" value={t.id} />
                    <input type="hidden" name="playerId" value={r.player.id} />
                    <SubmitButton size="sm" variant="ghost" className={BTN_SM} confirm={`Закрыть доступ ${r.player.nickname}? Турнир перестанет быть ему виден.`}>
                      ✕
                    </SubmitButton>
                  </ActionForm>
                </div>
              ))}
            </div>
          </TableBox>
        ) : (
          <EmptyState compact title="Пока никого не пригласили" description="Начните вводить ник игрока в поле выше." />
        )}
      </Panel>

      <Panel title={pairs.length ? `Пары · ${pairs.length}` : "Пары"}>
        {locked ? (
          <p className="mb-4 text-[15px] text-fg-3">Сетка создана — пары зафиксированы. Чтобы пересоставить, удалите сетку во вкладке «Сетка».</p>
        ) : (
          <div className="mb-4 flex flex-wrap gap-2">
            <ActionForm action={buildPrivatePairs} inline>
              <input type="hidden" name="tournamentId" value={t.id} />
              <input type="hidden" name="mode" value="elo" />
              <SubmitButton size="md" className={BTN} confirm={pairs.length ? "Пересоставить пары заново по ELO?" : undefined}>
                {pairs.length ? "Перемешать по ELO" : "Составить пары по ELO"}
              </SubmitButton>
            </ActionForm>
            <ActionForm action={buildPrivatePairs} inline>
              <input type="hidden" name="tournamentId" value={t.id} />
              <input type="hidden" name="mode" value="random" />
              <SubmitButton size="md" variant="secondary" className={BTN} confirm={pairs.length ? "Пересоставить пары заново случайно?" : undefined}>
                {pairs.length ? "Перемешать случайно" : "Составить пары случайно"}
              </SubmitButton>
            </ActionForm>
            <span className="self-center text-[14px] text-fg-3">
              Из {checked.length} отметившихся. По ELO — сильная половина с слабой, без FACEIT считается слабым.
            </span>
          </div>
        )}
        {pairs.length ? (
          <>
            <TableBox>
              <div className="divide-y divide-ink/[0.06]">
                {pairs.map((p, i) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                    <span className="num w-8 text-[14px] text-fg-3">{i + 1}</span>
                    <span className="min-w-0 flex-1 text-[15px] font-semibold">
                      {p.players.map((x) => `${x.nickname}${x.faceit_elo ? ` (${x.faceit_elo})` : ""}`).join(" + ")}
                    </span>
                    <span className="num text-[14px] text-fg-3">Σ ELO {pairElo(p.players.map((x) => ({ id: x.id, nickname: x.nickname, elo: x.faceit_elo })))}</span>
                  </div>
                ))}
                {reserve.length > 0 && (
                  <div className="flex items-center gap-3 px-4 py-2.5 text-[15px] text-fg-3">
                    <span className="w-8" />
                    Запасной: <span className="font-semibold text-fg-2">{reserve.map((x) => x.nickname).join(", ")}</span>
                  </div>
                )}
              </div>
            </TableBox>
            {!locked && (
              <ActionForm action={swapPrivatePlayers} className="mt-4 flex flex-wrap items-center gap-2">
                <input type="hidden" name="tournamentId" value={t.id} />
                <span className="text-[14.5px] text-fg-2">Поменять местами:</span>
                {(["a", "b"] as const).map((k) => (
                  <select key={k} name={k} className="field w-56" aria-label={k === "a" ? "Первый игрок" : "Второй игрок"} defaultValue="">
                    <option value="" disabled>
                      игрок…
                    </option>
                    {inPlan.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.nickname}
                      </option>
                    ))}
                  </select>
                ))}
                <SubmitButton size="sm" variant="secondary" className={BTN}>
                  Поменять
                </SubmitButton>
              </ActionForm>
            )}
            <p className="mt-4 text-[14.5px] text-fg-3">
              Пары устраивают —{" "}
              <Link href={`/admin/tournaments/${t.id}?tab=bracket`} className={buttonClass("secondary", "sm", BTN_SM)}>
                перейти к сетке
              </Link>
            </p>
          </>
        ) : (
          <EmptyState compact title="Пар пока нет" description="Составьте пары после check-in: нужно минимум 4 отметившихся игрока." />
        )}
      </Panel>
    </div>
  );
}
