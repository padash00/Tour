import { formatPhone, fullName, positionOf } from "@/lib/profile";
import type { OfficialData } from "@/lib/official-data";
import type { Tournament } from "@/lib/types";

/*
 * Лист «Заявка на участие» (Приложение №1 к Положению): A4, чёрное на белом. Общий для пульта и для капитана.
 * При печати видимым остаётся только .f16-print — шапка сайта и пульта скрываются.
 */

export const PRINT_CSS = `
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

export function ApplicationSheet({ t, data, index }: { t: Tournament; data: OfficialData; index: number }) {
  const team = data.teams[index];
  const a = team.application;
  const rows = sheetRows(data, index);
  const captainProfile = data.profiles.get(team.registration.team.captain_id) ?? null;
  const captainName = fullName(captainProfile) || (team.registration.roster.find((p) => p.player_id === team.registration.team.captain_id)?.player.nickname ?? "");
  const line = "inline-block min-w-[220px] border-b border-black px-1";
  return (
    <section className="f16-sheet mx-auto max-w-[210mm] rounded-[4px] p-[14mm] shadow-[0_0_0_1px_var(--color-line),var(--shadow-soft)]">
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
