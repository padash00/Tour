import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/print-button";
import { requireAdmin } from "@/lib/auth";
import { getTournamentById } from "@/lib/data";
import { loadOfficial, type OfficialData } from "@/lib/official-data";
import { formatPhone, fullName, positionOf } from "@/lib/profile";
import { auditPersonalView } from "@/lib/profiles";
import type { Tournament } from "@/lib/types";

export const metadata: Metadata = { title: "Заявки — Приложение №1 — F16 Control" };

/*
 * «Заявка на участие» (Приложение №1 к Положению) — для печати или сохранения в PDF: A4, чёрное на белом.
 * ?reg=<id> — одна заявка, без параметра — все активные заявки, каждая с новой страницы.
 * При печати оболочка F16 Control скрывается: видимым остаётся только лист заявки.
 */

const PRINT_CSS = `
@page { size: A4; margin: 16mm 14mm; }
@media print {
  html, body { background: #fff !important; }
  body * { visibility: hidden !important; }
  .f16-print, .f16-print * { visibility: visible !important; }
  .f16-print { position: absolute; left: 0; top: 0; width: 100%; }
  .f16-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; border: 0 !important; }
  .f16-sheet + .f16-sheet { break-before: page; page-break-before: always; }
}
.f16-sheet { font-family: "Times New Roman", Times, serif; color: #000; background: #fff; font-size: 13pt; line-height: 1.35; }
.f16-sheet table { width: 100%; border-collapse: collapse; }
.f16-sheet th, .f16-sheet td { border: 1px solid #000; padding: 4px 6px; vertical-align: top; text-align: left; }
.f16-sheet th { font-weight: bold; text-align: center; }
`;

type Row = { name: string; role?: string; year: string; workplace: string; position: string; group: string };

function sheetRows(data: OfficialData, teamIndex: number): Row[] {
  const team = data.teams[teamIndex];
  const rows: Row[] = team.registration.roster
    .slice()
    .sort((a, b) => Number(b.player_id === team.registration.team.captain_id) - Number(a.player_id === team.registration.team.captain_id))
    .map((p) => {
      const profile = data.profiles.get(p.player_id) ?? null;
      return {
        name: fullName(profile) || p.player.nickname,
        role: p.player_id === team.registration.team.captain_id ? "капитан" : p.role === "sub" ? "запасной" : undefined,
        year: profile?.birth_date?.slice(0, 4) ?? "",
        workplace: profile?.organization ?? "",
        position: positionOf(profile),
        group: profile?.occupation === "studies" ? (profile.study_group ?? "") : "",
      };
    });
  const a = team.application;
  if (a?.coach_name) {
    rows.push({ name: a.coach_name, role: "тренер", year: a.coach_birth_date?.slice(0, 4) ?? "", workplace: a.coach_workplace ?? "", position: a.coach_position ?? "", group: "" });
  }
  return rows;
}

export default async function ApplicationPrintPage(props: PageProps<"/admin/tournaments/[id]/application">) {
  const { id } = await props.params;
  const admin = await requireAdmin(`/admin/tournaments/${id}/application`); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const t = await getTournamentById(id);
  if (!t || !t.is_official) notFound();
  const data = await loadOfficial(t);
  const reg = typeof sp.reg === "string" ? sp.reg : null;
  const indexes = data.teams.map((_, i) => i).filter((i) => !reg || data.teams[i].registration.id === reg);
  if (reg && indexes.length === 0) notFound();
  await auditPersonalView(admin.id, "official.print", { type: "tournament", id: t.id }, { registration: reg ?? undefined });

  return (
    <div className="space-y-6">
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/admin/tournaments/${t.id}?tab=official`} className="text-[12px] text-fg-3 hover:text-fg">
            ← {t.name}
          </Link>
          <h1 className="mt-2 text-[22px] font-semibold">{reg ? "Заявка команды" : `Заявки команд · ${indexes.length}`}</h1>
          <p className="mt-1 text-[13px] text-fg-3">Формат A4. В диалоге печати можно выбрать «Сохранить как PDF». Каждая заявка — с новой страницы.</p>
        </div>
        <PrintButton />
      </div>
      {indexes.length === 0 ? (
        <p className="text-[13px] text-fg-3">Активных заявок нет.</p>
      ) : (
        <div className="f16-print space-y-8">
          {indexes.map((i) => (
            <Sheet key={data.teams[i].registration.id} t={t} data={data} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

function Sheet({ t, data, index }: { t: Tournament; data: OfficialData; index: number }) {
  const team = data.teams[index];
  const a = team.application;
  const rows = sheetRows(data, index);
  const captainProfile = data.profiles.get(team.registration.team.captain_id) ?? null;
  const captainName = fullName(captainProfile) || (team.registration.roster.find((p) => p.player_id === team.registration.team.captain_id)?.player.nickname ?? "");
  const line = "inline-block min-w-[220px] border-b border-black px-1";
  return (
    <section className="f16-sheet mx-auto max-w-[210mm] rounded-[4px] p-[14mm] shadow-[0_0_0_1px_#ffffff20]">
      <p style={{ textAlign: "right", fontSize: "11pt" }}>
        Приложение №1
        <br />к Положению о проведении городского спортивного
        <br />турнира «{t.name}»
      </p>
      <h2 style={{ textAlign: "center", fontWeight: "bold", fontSize: "15pt", marginTop: "18pt" }}>ЗАЯВКА</h2>
      <p style={{ textAlign: "center", marginBottom: "14pt" }}>на участие в турнире «{t.name}»</p>
      <p>
        Организация: <span className={line}>{a?.organization ?? ""}</span>
      </p>
      <p style={{ marginTop: "6pt", marginBottom: "10pt" }}>
        Название команды: <span className={line}>{team.registration.team.name}</span>
      </p>
      <table>
        <thead>
          <tr>
            <th style={{ width: "6%" }}>№</th>
            <th style={{ width: "30%" }}>Ф.И.О.</th>
            <th style={{ width: "10%" }}>Год рождения</th>
            <th>Место работы / учёбы</th>
            <th style={{ width: "16%" }}>Должность / курс</th>
            <th style={{ width: "10%" }}>Группа</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td style={{ textAlign: "center" }}>{i + 1}</td>
              <td>
                {r.name}
                {r.role ? ` (${r.role})` : ""}
              </td>
              <td style={{ textAlign: "center" }}>{r.year}</td>
              <td>{r.workplace}</td>
              <td>{r.position}</td>
              <td>{r.group}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p style={{ marginTop: "14pt" }}>
        Капитан команды: <span className={line}>{captainName}</span> тел.: <span className={line}>{formatPhone(a?.captain_phone ?? captainProfile?.phone)}</span>
      </p>
      <p style={{ marginTop: "6pt" }}>
        Ответственное лицо: <span className={line}>{a?.responsible_name ?? ""}</span> тел.: <span className={line}>{formatPhone(a?.responsible_phone)}</span>
      </p>
      <p style={{ marginTop: "28pt" }}>Руководитель организации ____________________ / ____________________</p>
      <p style={{ marginTop: "4pt", paddingLeft: "60%", fontSize: "10pt" }}>(подпись) &nbsp;&nbsp;&nbsp;&nbsp; (Ф.И.О.)</p>
      <p style={{ marginTop: "14pt" }}>М.П.</p>
      <p style={{ marginTop: "14pt" }}>«____» ____________________ 20___ г.</p>
    </section>
  );
}
