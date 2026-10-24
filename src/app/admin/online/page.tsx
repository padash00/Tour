import type { Metadata } from "next";
import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { onlineNow } from "@/lib/presence";
import { Avatar } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";
import { Quiet, Strip, StripCell } from "@/components/admin/kit";
import { LiveRefresh } from "@/components/live-refresh";

export const metadata: Metadata = { title: "Кто на сайте — F16 Control" };

/** Понятное название страницы, где сейчас игрок */
function pageLabel(path: string, names: Map<string, string>) {
  const [, a, b, c] = path.split("/");
  if (!a) return "Главная";
  const named = (id?: string) => (id && names.get(id)) || null;
  switch (a) {
    case "tournaments":
      if (!b) return "Список турниров";
      return c === "recap" ? `Итоги: ${named(b) ?? b}` : `Турнир: ${named(b) ?? b}`;
    case "matches":
      return b ? `Матч ${named(b) ?? ""}`.trim() : "Матчи";
    case "lobbies":
    case "lobby":
      return b ? "В лобби" : "Список лобби";
    case "stats":
      return "Рейтинг";
    case "players":
      return b ? `Профиль игрока ${named(b) ?? ""}`.trim() : "Игроки";
    case "teams":
      return b ? `Команда ${b}` : "Команды";
    case "team":
      return "Моя команда";
    case "me":
      return "Моя игра";
    case "notifications":
      return "Уведомления";
    case "find":
      return "Поиск команды";
    case "admin":
      return "Пульт F16 Control";
    case "login":
      return "Вход";
    case "rules":
      return "Правила";
    case "help":
      return "Как это работает";
    default:
      return path;
  }
}

const ago = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  return s < 60 ? `${s} с назад` : `${Math.round(s / 60)} мин назад`;
};
const duration = (ms: number) => {
  const m = Math.round(ms / 60_000);
  return m < 1 ? "только что зашёл" : m < 60 ? `${m} мин` : `${Math.floor(m / 60)} ч ${m % 60} мин`;
};

export default async function AdminOnlinePage() {
  await requireAdmin("/admin/online");
  const { players, guests, now } = onlineNow();
  const ids = players.map((p) => p.playerId!).filter(Boolean);

  // имена для страниц: турниры по адресу, матчи по номеру, игроки по SteamID
  const slugs = [...new Set(players.map((p) => p.path.split("/")).filter((x) => x[1] === "tournaments" && x[2]).map((x) => x[2]))];
  const matchIds = [...new Set(players.map((p) => p.path.split("/")).filter((x) => x[1] === "matches" && x[2]).map((x) => x[2]))].filter((x) => /^[0-9a-f-]{36}$/.test(x));
  const [{ data: rows }, { data: tours }, { data: matches }] = await Promise.all([
    ids.length ? db().from("players").select("id, nickname, avatar_url, steam_id, is_admin").in("id", ids) : Promise.resolve({ data: [] }),
    slugs.length ? db().from("tournaments").select("slug, name").in("slug", slugs) : Promise.resolve({ data: [] }),
    matchIds.length ? db().from("matches").select("id, number").in("id", matchIds) : Promise.resolve({ data: [] }),
  ]);
  const byId = new Map((rows ?? []).map((r) => [r.id, r]));
  const names = new Map<string, string>([
    ...(tours ?? []).map((t) => [t.slug, t.name] as [string, string]),
    ...(matches ?? []).map((m) => [m.id, `#${m.number}`] as [string, string]),
    ...(rows ?? []).map((r) => [r.steam_id, r.nickname] as [string, string]),
  ]);
  const inMatch = players.filter((p) => p.path.startsWith("/matches/")).length;

  return (
    <div className="space-y-6">
      <LiveRefresh intervalMs={15000} />
      <AdminHeader
        title="Кто на сайте"
        description="Игроки, у которых сайт открыт прямо сейчас (сигнал за последние 2 минуты), и на какой они странице. Обновляется само каждые 15 секунд."
      />
      <Strip className="grid-cols-1 sm:grid-cols-3">
        <StripCell label="Вошедших игроков" value={players.length} tone={players.length ? "ok" : undefined} hint="через Steam" />
        <StripCell label="Гостей" value={guests} hint="без входа, считаются по вкладкам" />
        <StripCell label="Смотрят матчи" value={inMatch} hint="из вошедших игроков" />
      </Strip>

      {players.length === 0 ? (
        <Quiet>Сейчас на сайте нет вошедших игроков. Гостей: {guests}.</Quiet>
      ) : (
        <TableBox minWidth={720}>
          <thead>
            <tr>
              <th>Игрок</th>
              <th>Где сейчас</th>
              <th>На сайте</th>
              <th className="text-right">Последний сигнал</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const r = byId.get(p.playerId!);
              const nick = r?.nickname ?? "—";
              return (
                <tr key={p.playerId}>
                  <td>
                    <span className="flex items-center gap-3">
                      <Avatar src={r?.avatar_url} name={nick} size={32} />
                      <span className="min-w-0">
                        <span className="block truncate text-[15px] font-semibold text-fg">{nick}</span>
                        {r?.is_admin && <span className="text-[12.5px] font-semibold text-accent">администратор</span>}
                      </span>
                    </span>
                  </td>
                  <td>
                    <Link href={p.path} className="text-[15px] text-fg-2 hover:text-accent">
                      {pageLabel(p.path, names)}
                    </Link>
                  </td>
                  <td className="text-[15px] text-fg-2">{duration(now - p.since)}</td>
                  <td className="text-right text-[14px] text-fg-3">{ago(now - p.at)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
      <p className="text-[13px] text-fg-3">
        Данные хранятся только в памяти сайта и не записываются в базу. После обновления сайта список заполняется заново примерно за минуту.
      </p>
    </div>
  );
}
