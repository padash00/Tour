import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { audit } from "@/lib/audit";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { getTournamentById } from "@/lib/data";
import { buildOfficialExport, type Cell, type ExportResult } from "@/lib/official";
import { exportTeams, loadOfficial } from "@/lib/official-data";
import { getTournamentRecap } from "@/lib/recap";

/**
 * Выгрузка официального турнира в Excel (.xlsx) для организаторов и акимата:
 * листы «Участники», «Команды», «Итоги». Только администратор; каждое скачивание — в журнал.
 */
export async function GET(_request: Request, ctx: RouteContext<"/admin/tournaments/[id]/official-export">) {
  const player = await getCurrentPlayer();
  if (!player || !isAdmin(player)) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  const { id } = await ctx.params;
  const t = await getTournamentById(id);
  if (!t || !t.is_official) return NextResponse.json({ error: "not found" }, { status: 404 });

  const data = await loadOfficial(t);
  // итоги — только у завершённого турнира
  let results: ExportResult[] = [];
  if (t.status === "finished") {
    const recap = await getTournamentRecap(t).catch(() => null);
    results = (recap?.placements ?? []).map((p) => ({ place: p.place, team: p.team.name, ...p.record }));
  }
  const sheets = buildOfficialExport(exportTeams(data), data.day, results);

  const book = new ExcelJS.Workbook();
  book.creator = "F16 Arena";
  book.created = new Date();
  addSheet(book, "Участники", sheets.participants);
  addSheet(book, "Команды", sheets.teams);
  addSheet(book, "Итоги", t.status === "finished" ? sheets.results : [sheets.results[0], ["Турнир ещё не завершён"]]);
  const buffer = await book.xlsx.writeBuffer();

  await audit(player.id, "official.export", { type: "tournament", id: t.id }, { participants: sheets.participants.length - 1 });
  return new NextResponse(new Uint8Array(buffer as ArrayBuffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${t.slug}-uchastniki.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}

function addSheet(book: ExcelJS.Workbook, name: string, rows: Cell[][]) {
  const sheet = book.addWorksheet(name, { views: [{ state: "frozen", ySplit: 1 }] });
  // в .xlsx строки хранятся как текст, а не формулы — ввод игроков («=…») не выполнится, экранировать не нужно
  for (const row of rows) sheet.addRow(row);
  const header = sheet.getRow(1);
  header.font = { bold: true };
  header.alignment = { vertical: "middle", wrapText: true };
  // ширина колонок — по самому длинному значению, в разумных пределах
  sheet.columns.forEach((col, i) => {
    const longest = Math.max(...rows.map((r) => String(r[i] ?? "").length));
    col.width = Math.min(48, Math.max(6, longest + 2));
  });
}
