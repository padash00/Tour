import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/admin/print-button";
import { requireAdmin } from "@/lib/auth";
import { getTournamentById } from "@/lib/data";
import { loadOfficial } from "@/lib/official-data";
import { ApplicationSheet, PRINT_CSS } from "@/components/official/application-sheet";
import { auditPersonalView } from "@/lib/profiles";

export const metadata: Metadata = { title: "Заявки — Приложение №1 — F16 Control" };

/*
 * «Заявка на участие» (Приложение №1 к Положению) — для печати или сохранения в PDF: A4, чёрное на белом.
 * ?reg=<id> — одна заявка, без параметра — все активные заявки, каждая с новой страницы.
 * При печати оболочка F16 Control скрывается: видимым остаётся только лист заявки.
 */

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
          <Link href={`/admin/tournaments/${t.id}?tab=official`} className="text-[14px] font-semibold text-fg-3 hover:text-fg">
            ← {t.name}
          </Link>
          <h1 className="mt-2 text-[28px] font-bold tracking-[-0.02em]">{reg ? "Заявка команды" : `Заявки команд · ${indexes.length}`}</h1>
          <p className="mt-2 max-w-read text-[15px] text-fg-2">Лист A4. Нажмите «Печать»: в окне печати можно выбрать принтер или «Сохранить как PDF». Каждая заявка печатается с новой страницы.</p>
        </div>
        <PrintButton />
      </div>
      {indexes.length === 0 ? (
        <p className="text-[15px] text-fg-3">Активных заявок нет.</p>
      ) : (
        <div className="f16-print space-y-8">
          {indexes.map((i) => (
            <ApplicationSheet key={data.teams[i].registration.id} t={t} data={data} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
