import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import {
  forceResult,
  reopenMatch,
  resetVeto,
  saveMapScore,
  setBestOf,
  setMatchLive,
  setServerInfo,
  startVeto,
} from "@/app/actions/admin-match";
import { sendMatchToServer } from "@/app/actions/admin-server";
import { mapName } from "@/lib/format";
import { getServerState } from "@/lib/server-control";
import { applyVetoTimeouts, getMatch } from "@/lib/matches";
import { ActionForm, SubmitButton } from "@/components/forms";
import { LiveRefresh } from "@/components/live-refresh";
import { MatchStatusBadge } from "@/components/match-bits";
import { Card, Field, Notice, cn } from "@/components/ui";

export const metadata: Metadata = { title: "Матч — админ" };

export default async function AdminMatchPage(props: PageProps<"/admin/matches/[id]">) {
  const { id } = await props.params;
  await applyVetoTimeouts(id);
  const m = await getMatch(id);
  if (!m) notFound();
  const servers = await getServerState();
  const t1 = m.team1?.name ?? "TBD";
  const t2 = m.team2?.name ?? "TBD";

  return (
    <div className="space-y-6 max-w-3xl">
      {(["veto", "live"].includes(m.status) || m.server_state === "loading") && <LiveRefresh intervalMs={4000} />}
      <div>
        <Link href="/admin/matches" className="text-sm text-fg-3 hover:text-fg-2">
          ← Матчи
        </Link>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-bold tracking-[-0.02em]">
            #{m.number} · {t1} <span className="text-fg-3">vs</span> {t2}
          </h1>
          <MatchStatusBadge status={m.status} />
        </div>
        <div className="mt-2 text-sm text-fg-3">
          {m.tournament.name} · BO{m.best_of} ·{" "}
          <Link href={`/matches/${m.id}`} className="text-accent hover:underline">
            публичная страница ↗
          </Link>
        </div>
      </div>

      {/* 1. Формат и вето */}
      <Card className="p-6 space-y-4">
        <div className="label">1 · Формат и вето</div>
        {["pending", "upcoming"].includes(m.status) && (
          <div className="flex flex-wrap gap-2">
            {[1, 3, 5].map((bo) => (
              <ActionForm key={bo} action={setBestOf}>
                <input type="hidden" name="matchId" value={m.id} />
                <input type="hidden" name="bestOf" value={bo} />
                <SubmitButton size="sm" variant={m.best_of === bo ? "primary" : "secondary"}>
                  BO{bo}
                </SubmitButton>
              </ActionForm>
            ))}
          </div>
        )}
        {m.status === "pending" && <p className="text-sm text-fg-3">Ждём, пока определятся обе команды.</p>}
        {m.status === "upcoming" && (
          <ActionForm action={startVeto}>
            <input type="hidden" name="matchId" value={m.id} />
            <SubmitButton>Начать вето</SubmitButton>
            <p className="mt-2 text-xs text-fg-3">Капитаны получат уведомление. На шаг — 60 секунд, потом карта выбирается случайно.</p>
          </ActionForm>
        )}
        {m.status === "veto" && (
          <p className="text-sm text-fg-2">
            Идёт вето: {m.veto.length} шаг(ов) сделано.{" "}
            <Link href={`/matches/${m.id}`} className="text-accent hover:underline">
              Смотреть →
            </Link>
          </p>
        )}
        {["ready", "live", "finished"].includes(m.status) && m.maps.length > 0 && (
          <p className="text-sm text-fg-2">Карты: {m.maps.map((x) => mapName(x.map_name)).join(" → ")}</p>
        )}
        {["veto", "ready"].includes(m.status) && (
          <ActionForm action={resetVeto}>
            <input type="hidden" name="matchId" value={m.id} />
            <SubmitButton size="sm" variant="ghost" confirm="Сбросить вето и начать заново?">
              Сбросить вето
            </SubmitButton>
          </ActionForm>
        )}
      </Card>

      {/* 2. Сервер */}
      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="label">2 · Сервер</div>
          <span className={cn("text-xs", servers.online ? "text-ok" : "text-danger")}>
            Agent {servers.online ? "online" : "offline"}
          </span>
        </div>
        {m.server_instance && (
          <p className="text-sm text-fg-2">
            {m.server_instance} ·{" "}
            {m.server_state === "ready"
              ? `готов, игроки видят ${m.server_address}`
              : m.server_state === "error"
                ? "ошибка загрузки матча — смотрите журнал команд на странице «Серверы»"
                : "загружаем матч в MatchZy…"}
          </p>
        )}
        {["ready", "live"].includes(m.status) ? (
          <ActionForm action={sendMatchToServer}>
            <input type="hidden" name="matchId" value={m.id} />
            <div className="flex flex-wrap items-center gap-2">
              <select name="instance" className="field w-56" defaultValue="">
                <option value="">Свободный сервер автоматически</option>
                {servers.instances.map((i) => (
                  <option key={i.name} value={i.name}>
                    {i.name} · {!i.running ? "выключен" : (i.gamestate ?? "none") === "none" ? "свободен" : i.gamestate}
                    {i.role === "reserve" ? " · резерв" : ""}
                  </option>
                ))}
              </select>
              <SubmitButton variant={m.server_instance ? "secondary" : "primary"}>
                {m.server_instance ? "Перенести на другой сервер" : "Отправить на сервер"}
              </SubmitButton>
            </div>
            <p className="mt-2 text-xs text-fg-3">
              Агент загрузит матч в MatchZy (составы по SteamID, карты после вето). Адрес появится у игроков после проверки сервера.
              Счёт и результат придут автоматически.
            </p>
          </ActionForm>
        ) : (
          <p className="text-sm text-fg-3">Сервер назначается после вето.</p>
        )}
        <details>
          <summary className="cursor-pointer text-xs text-fg-3 hover:text-fg-2">Указать адрес вручную (если агент недоступен)</summary>
          <ActionForm action={setServerInfo} className="mt-3">
            <input type="hidden" name="matchId" value={m.id} />
            <div className="grid sm:grid-cols-[1.4fr_1fr_auto] gap-3 items-end">
              <Field label="Адрес (ip:port)">
                <input name="address" defaultValue={m.server_address ?? ""} placeholder="192.168.0.159:27015" className="field num" />
              </Field>
              <Field label="Пароль">
                <input name="password" defaultValue={m.server_password ?? ""} className="field num" />
              </Field>
              <SubmitButton variant="secondary">Сохранить</SubmitButton>
            </div>
          </ActionForm>
        </details>
      </Card>

      {/* 3. Игра */}
      <Card className="p-6 space-y-4">
        <div className="label">3 · Игра</div>
        {m.status === "ready" && (
          <ActionForm action={setMatchLive}>
            <input type="hidden" name="matchId" value={m.id} />
            <SubmitButton>Матч начался → LIVE</SubmitButton>
          </ActionForm>
        )}
        {m.status === "live" &&
          m.maps.map((map) => (
            <div key={map.id} className={cn("rounded-xl border p-4", map.status === "live" ? "border-[#ef7a7a44]" : "border-line")}>
              <div className="flex items-center justify-between mb-3">
                <span className="font-semibold">
                  Map {map.map_number} · {mapName(map.map_name)}
                </span>
                <span className="text-xs text-fg-3">{map.status === "finished" ? "сыграна" : map.status === "live" ? "идёт" : "ожидает"}</span>
              </div>
              {map.status === "finished" ? (
                <div className="num">{map.team1_score} : {map.team2_score}</div>
              ) : map.status === "live" ? (
                <ActionForm action={saveMapScore}>
                  <input type="hidden" name="matchId" value={m.id} />
                  <input type="hidden" name="mapId" value={map.id} />
                  <div className="flex flex-wrap items-end gap-3">
                    <Field label={t1}>
                      <input name="score1" type="number" min={0} max={99} defaultValue={map.team1_score} className="field num w-24" />
                    </Field>
                    <Field label={t2}>
                      <input name="score2" type="number" min={0} max={99} defaultValue={map.team2_score} className="field num w-24" />
                    </Field>
                    <SubmitButton variant="secondary" name="finish" value="0">
                      Обновить счёт
                    </SubmitButton>
                    <SubmitButton name="finish" value="1" confirm="Завершить карту с этим счётом?">
                      Карта завершена
                    </SubmitButton>
                  </div>
                </ActionForm>
              ) : null}
            </div>
          ))}
        {m.status === "finished" && (
          <Notice tone="ok">
            Матч завершён: {m.winner_id === m.team1_id ? t1 : t2} побеждает {m.team1_score}:{m.team2_score}
            {m.is_walkover ? " (техническая победа)" : ""}.
          </Notice>
        )}
        {["pending", "upcoming", "veto"].includes(m.status) && <p className="text-sm text-fg-3">Счёт вводится после вето и старта матча.</p>}
      </Card>

      {/* 4. Ручные решения */}
      {m.team1_id && m.team2_id && (
        <Card className="p-6 border-[#ef7a7a33]">
          <div className="label mb-4">4 · Ручные решения</div>
          {m.status !== "finished" ? (
            <ActionForm action={forceResult}>
              <input type="hidden" name="matchId" value={m.id} />
              <div className="grid sm:grid-cols-[1fr_1.4fr_auto] gap-3 items-end">
                <Field label="Победитель">
                  <select name="winner" className="field">
                    <option value="">—</option>
                    <option value="1">{t1}</option>
                    <option value="2">{t2}</option>
                  </select>
                </Field>
                <Field label="Причина (неявка, дисквалификация…)">
                  <input name="reason" className="field" />
                </Field>
                <SubmitButton variant="danger" confirm="Зафиксировать техническую победу?">
                  Тех. победа
                </SubmitButton>
              </div>
            </ActionForm>
          ) : (
            <ActionForm action={reopenMatch}>
              <input type="hidden" name="matchId" value={m.id} />
              <div className="grid sm:grid-cols-[1fr_auto] gap-3 items-end">
                <Field label="Причина отмены результата">
                  <input name="reason" className="field" />
                </Field>
                <SubmitButton variant="danger" confirm="Отменить результат матча? Команды уберутся из следующих матчей.">
                  Отменить результат
                </SubmitButton>
              </div>
              <p className="mt-2 text-xs text-fg-3">Возможно, только пока следующие матчи не начались.</p>
            </ActionForm>
          )}
        </Card>
      )}
    </div>
  );
}
