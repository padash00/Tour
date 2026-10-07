import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getTournamentById } from "@/lib/data";
import { getPlayerLeaderboard } from "@/lib/stats";
import { db } from "@/lib/supabase";

/**
 * Экспорт турнира в CSV (открывается в Excel/Google Таблицах): ?type=results | rosters | stats.
 * Разделитель «;» и BOM — чтобы русский Excel открыл кириллицу и колонки без настройки.
 */
type Row = (string | number | null | undefined)[];

function csv(rows: Row[]) {
  const cell = (v: string | number | null | undefined) => {
    let s = v == null ? "" : String(v);
    // защита от формул в Excel/Таблицах (CSV injection): ник «=HYPERLINK(...)» не должен выполниться.
    // Числа не трогаем — отрицательный Swing остаётся числом
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + rows.map((r) => r.map(cell).join(";")).join("\r\n");
}

const STATUS: Record<string, string> = {
  pending: "ожидает",
  upcoming: "скоро",
  veto: "вето",
  ready: "сервер готов",
  live: "идёт",
  finished: "завершён",
  cancelled: "отменён",
};

export async function GET(request: NextRequest, ctx: RouteContext<"/admin/tournaments/[id]/export">) {
  const player = await getCurrentPlayer();
  if (!player || !isAdmin(player)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const t = await getTournamentById(id);
  if (!t) return NextResponse.json({ error: "not found" }, { status: 404 });
  const type = request.nextUrl.searchParams.get("type") ?? "results";

  let rows: Row[];
  if (type === "rosters") {
    const { data } = await db()
      .from("tournament_roster_players")
      .select("role, player:players(nickname, steam_id), registration:tournament_registrations!tournament_roster_players_registration_id_fkey(status, seed, checked_in_at, team:teams(name, tag))")
      .eq("tournament_id", id);
    const list = (data ?? []).sort(
      (a, b) => (a.registration?.team?.name ?? "").localeCompare(b.registration?.team?.name ?? "") || a.role.localeCompare(b.role),
    );
    rows = [
      ["Команда", "Тег", "Заявка", "Посев", "Check-in", "Игрок", "SteamID64", "Роль"],
      ...list.map((r) => [
        r.registration?.team?.name,
        r.registration?.team?.tag,
        r.registration?.status,
        r.registration?.seed,
        r.registration?.checked_in_at ? "да" : "нет",
        r.player?.nickname,
        r.player?.steam_id,
        r.role === "main" ? "основа" : r.role === "sub" ? "запас" : r.role,
      ]),
    ];
  } else if (type === "stats") {
    const board = await getPlayerLeaderboard(id);
    const f = (n: number, d = 2) => n.toFixed(d).replace(".", ",");
    rows = [
      ["#", "Игрок", "SteamID64", "Команда", "Карты", "Раунды", "K", "D", "A", "K/D", "ADR", "KAST %", "HS %", "F16 Rating", "Swing п.п./раунд"],
      ...board.map((p, i) => [
        i + 1,
        p.player?.nickname ?? p.name,
        p.steam_id,
        p.team?.name,
        p.maps,
        p.rounds,
        p.kills,
        p.deaths,
        p.assists,
        f(p.kd),
        f(p.adr, 1),
        f(p.kast, 1),
        f(p.hsPct, 1),
        f(p.rating),
        p.swing == null ? "" : f(p.swing),
      ]),
    ];
  } else {
    const { data } = await db()
      .from("matches")
      .select(
        "number, stage, bracket, group_label, round, best_of, status, team1_score, team2_score, is_walkover, scheduled_at, finished_at, team1:teams!matches_team1_id_fkey(name), team2:teams!matches_team2_id_fkey(name), winner:teams!matches_winner_id_fkey(name), maps:match_maps(map_number, map_name, team1_score, team2_score, status)",
      )
      .eq("tournament_id", id)
      .order("number");
    const time = (s: string | null) => (s ? new Date(s).toLocaleString("ru-RU", { timeZone: "Asia/Almaty" }) : "");
    rows = [
      ["Матч", "Стадия", "Раунд", "Группа", "Формат", "Команда 1", "Команда 2", "Счёт", "Победитель", "Статус", "Тех. результат", "Карты", "Начало", "Завершён"],
      ...(data ?? []).map((m) => [
        m.number,
        m.bracket === "grand_final" ? "гранд-финал" : m.bracket === "upper" ? "верхняя" : m.bracket === "lower" ? "нижняя" : m.bracket === "group" ? "группа" : m.bracket === "swiss" ? "швейцарка" : m.bracket,
        m.round,
        m.group_label,
        `BO${m.best_of}`,
        m.team1?.name ?? "TBD",
        m.team2?.name ?? (m.status === "finished" ? "бай" : "TBD"),
        `${m.team1_score}:${m.team2_score}`,
        m.winner?.name,
        STATUS[m.status] ?? m.status,
        m.is_walkover ? "да" : "",
        [...(m.maps ?? [])]
          .sort((a, b) => a.map_number - b.map_number)
          .map((x) => `${x.map_name.split("@")[0]} ${x.status === "finished" ? `${x.team1_score}:${x.team2_score}` : "—"}`)
          .join(", "),
        time(m.scheduled_at),
        time(m.finished_at),
      ]),
    ];
  }

  const name = `${t.slug}-${type}.csv`;
  return new NextResponse(csv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "no-store",
    },
  });
}
