/* eslint-disable @next/next/no-img-element -- логотип для печати: SVG бренда как есть */
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/auth";
import { getTournamentById, getTournamentRegistrations } from "@/lib/data";
import { CITY_TOURNAMENT, nominationDiploma, placeDiploma, registrationOrganization, type Diploma } from "@/lib/diplomas";
import { getTournamentNominations } from "@/lib/nominations";
import { getTournamentRecap } from "@/lib/recap";
import { PrintButton } from "@/components/admin/print-button";
import { AdminHeader } from "@/components/admin/control";

export const metadata: Metadata = { title: "Дипломы — F16 Control" };

const DEFAULT_SIGNER = "Директор КГУ «Молодёжный ресурсный центр»";

/*
 * Дипломы для печати: A4 альбомная, одна страница — один диплом.
 * Места 1–3 (команда и её организация) и каждая номинация (человек и команда).
 * Место, дата и подпись настраиваются формой над листами (параметры адреса) — на печать форма не попадает.
 * Печать скрывает всё оформление пульта: остаются только листы.
 */
export default async function DiplomasPage(props: PageProps<"/admin/tournaments/[id]/diplomas">) {
  const { id } = await props.params;
  await requireAdmin(`/admin/tournaments/${id}/diplomas`);
  const t = await getTournamentById(id);
  if (!t) notFound();
  const sp = await props.searchParams;
  const param = (k: string, fallback: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 160) : fallback);

  const defaultDate = t.starts_at
    ? new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Almaty" }).format(new Date(t.starts_at))
    : "";
  const place = param("place", t.location ?? "");
  const date = param("date", defaultDate);
  const signer = param("signer", DEFAULT_SIGNER);
  const signerName = param("signerName", "");

  const [recap, nominations, regs] = await Promise.all([getTournamentRecap(t), getTournamentNominations(t.id), getTournamentRegistrations(t.id)]);

  const diplomas: Diploma[] = [];
  for (const p of recap.placements) {
    const reg = regs.find((r) => r.team_id === p.team.id);
    const d = placeDiploma(`place-${p.place}-${p.team.id}`, p.place, p.team.name, registrationOrganization(reg), t.name, CITY_TOURNAMENT);
    if (d) diplomas.push(d);
  }
  for (const n of nominations) {
    if (!n.winner) continue;
    diplomas.push(nominationDiploma(`nom-${n.key}`, n.title, n.winner.name, n.winner.team?.name ?? null, t.name, CITY_TOURNAMENT));
  }

  return (
    <div className="diplomas-page space-y-6">
      <style>{PRINT_CSS}</style>
      <div className="no-print space-y-5">
        <AdminHeader
          back={{ href: `/admin/tournaments/${t.id}?tab=awards`, label: t.name }}
          title="Дипломы"
          description={`${diplomas.length} шт. · A4 альбомная · одна страница — один диплом`}
          actions={<PrintButton />}
        />
        <form method="get" className="grid gap-3 rounded-[12px] border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_1.4fr_1fr_auto] lg:items-end">
          {[
            ["place", "Место проведения", place, "г. …"],
            ["date", "Дата", date, "1 января 2026 г."],
            ["signer", "Подпись: должность", signer, DEFAULT_SIGNER],
            ["signerName", "Подпись: ФИО", signerName, "оставить пустым"],
          ].map(([name, label, value, hint]) => (
            <label key={name} className="block text-[12px] text-fg-3">
              {label}
              <input name={name} defaultValue={value} placeholder={hint} className="field mt-1 h-9 w-full text-[13px]" />
            </label>
          ))}
          <button type="submit" className="h-9 rounded-[8px] border border-line px-4 text-[13px] text-fg hover:bg-surface-2">
            Применить
          </button>
        </form>
        {diplomas.length === 0 && (
          <p className="text-[13px] text-fg-3">
            Пока некого награждать: места появятся после финала, номинации — во вкладке{" "}
            <Link href={`/admin/tournaments/${t.id}?tab=awards`} className="text-accent hover:underline">
              «Награды»
            </Link>
            .
          </p>
        )}
      </div>

      <div className="diplomas-root">
        {diplomas.map((d) => (
          <section key={d.key} className="diploma-sheet">
            <div className="diploma-frame">
              <img src="/brand/f16-arena-black.svg" alt="F16 Arena" className="diploma-logo" />
              <div className="diploma-title">ДИПЛОМ</div>
              <div className="diploma-small">награждается</div>
              <div className="diploma-recipient">{d.recipient}</div>
              {d.subline && <div className="diploma-subline">{d.subline}</div>}
              <div className="diploma-reason">{d.reason}</div>
              {d.event && <div className="diploma-reason">{d.event}</div>}
              <div className="diploma-footer">
                <div className="diploma-sign">
                  <span>{signer}</span>
                  <span className="diploma-line" />
                  <span>{signerName}</span>
                </div>
                <div className="diploma-when">{[place, date].filter(Boolean).join(", ")}</div>
              </div>
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

/* Лист: светлая «бумага» и на экране, и при печати. На экране листы идут друг под другом с тенью. */
const PRINT_CSS = `
.diplomas-root { display: flex; flex-direction: column; align-items: center; gap: 24px; overflow-x: auto; padding-bottom: 8px; }
.diploma-sheet {
  width: 297mm; height: 210mm; box-sizing: border-box; padding: 12mm; background: #fff; color: #111;
  box-shadow: 0 10px 40px rgba(0,0,0,.35); font-family: inherit;
}
.diploma-frame {
  height: 100%; box-sizing: border-box; border: 1.2mm solid #111; outline: 0.4mm solid #111; outline-offset: -3.5mm;
  display: flex; flex-direction: column; align-items: center; padding: 12mm 20mm 10mm; text-align: center;
}
.diploma-logo { height: 20mm; width: auto; }
.diploma-title { margin-top: 8mm; font-size: 30pt; font-weight: 800; letter-spacing: 0.35em; padding-left: 0.35em; }
.diploma-small { margin-top: 5mm; font-size: 14pt; color: #444; }
.diploma-recipient { margin-top: 6mm; font-size: 28pt; font-weight: 700; line-height: 1.15; max-width: 230mm; overflow-wrap: anywhere; }
.diploma-subline { margin-top: 2mm; font-size: 14pt; color: #333; }
.diploma-reason { margin-top: 5mm; font-size: 16pt; line-height: 1.3; max-width: 230mm; }
.diploma-reason + .diploma-reason { margin-top: 1mm; }
.diploma-footer { margin-top: auto; width: 100%; display: flex; justify-content: space-between; align-items: flex-end; gap: 10mm; font-size: 11pt; }
.diploma-sign { display: flex; align-items: flex-end; gap: 3mm; text-align: left; max-width: 200mm; }
.diploma-line { display: inline-block; width: 45mm; border-bottom: 0.3mm solid #111; height: 1em; flex-shrink: 0; }
.diploma-when { white-space: nowrap; color: #333; }
@media print {
  @page { size: A4 landscape; margin: 0; }
  html, body { background: #fff !important; }
  /* всё, кроме листов и их предков, скрыто; предки — без отступов и рамок */
  body *:not(:has(.diplomas-root)):not(.diplomas-root):not(.diplomas-root *) { display: none !important; }
  *:has(.diplomas-root) {
    display: block !important; position: static !important; margin: 0 !important; padding: 0 !important; border: 0 !important;
    width: auto !important; height: auto !important; min-height: 0 !important; max-width: none !important; overflow: visible !important;
    background: #fff !important; box-shadow: none !important; transform: none !important;
  }
  .no-print { display: none !important; }
  .diplomas-root { display: block; gap: 0; overflow: visible; padding: 0; }
  .diploma-sheet { box-shadow: none; break-after: page; page-break-after: always; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .diploma-sheet:last-child { break-after: auto; page-break-after: auto; }
}
`;
