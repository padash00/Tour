import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { PrintButton } from "@/components/admin/print-button";
import { ApplicationSheet, PRINT_CSS } from "@/components/official/application-sheet";
import { Callout, Container, EmptyState, PageTitle } from "@/components/ds";
import { requirePlayer } from "@/lib/auth";
import { getActiveMembership, getTournamentBySlug } from "@/lib/data";
import { formatDateTime } from "@/lib/format";
import { loadOfficial } from "@/lib/official-data";
import { auditPersonalView } from "@/lib/profiles";

export const metadata: Metadata = { title: "Заявка — Приложение №1", robots: { index: false } };
export const dynamic = "force-dynamic";

/*
 * Капитан скачивает (печатает или сохраняет в PDF) заявку своей команды — Приложение №1.
 * Только капитан команды с активной заявкой на официальный турнир; в листе — ФИО и данные игроков его состава.
 */
export default async function CaptainApplicationPage(props: PageProps<"/tournaments/[slug]/application">) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  if (!t || !t.is_official) notFound();
  const player = await requirePlayer(`/tournaments/${slug}/application`);
  const membership = await getActiveMembership(player.id);
  const isCaptain = !!membership && membership.team.captain_id === player.id;
  const data = isCaptain ? await loadOfficial(t) : null;
  // только капитан команды с одобренной заявкой
  const index = data ? data.teams.findIndex((x) => x.registration.team.id === membership!.team.id && x.registration.status === "approved") : -1;

  const back = (
    <Link href={`/tournaments/${t.slug}`} className="-ml-1 inline-flex min-h-11 items-center gap-1 text-meta text-fg-3 hover:text-fg sm:min-h-0">
      <ChevronLeft className="size-4" aria-hidden />
      {t.name}
    </Link>
  );

  if (!data || index < 0) {
    return (
      <Container width="read" className="pb-16 pt-6 sm:pt-8">
        {back}
        <div className="mt-6">
          <EmptyState
            title="Заявки нет"
            text={isCaptain ? "Заявку можно скачать, когда организатор одобрит участие вашей команды." : "Скачать заявку может только капитан команды-участника."}
          />
        </div>
      </Container>
    );
  }

  await auditPersonalView(player.id, "official.print.captain", { type: "tournament", id: t.id }, { registration: data.teams[index].registration.id });

  return (
    <Container className="pb-16 pt-6 sm:pt-8">
      <style>{PRINT_CSS}</style>
      {back}
      <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
        <div>
          <PageTitle>Заявка — Приложение №1</PageTitle>
          <p className="mt-1 text-meta text-fg-3">Команда {data.teams[index].registration.team.name}</p>
        </div>
        <PrintButton label="Скачать / распечатать" />
      </div>
      <div className="mt-5 max-w-read">
        <Callout tone="warn" title="Что сделать с заявкой">
          1. Нажмите «Скачать / распечатать» — в окне печати выберите принтер или «Сохранить как PDF».
          <br />
          2. Подпишите: от организации — руководитель или уполномоченное лицо (печать — при наличии); самостоятельная команда — капитан.
          <br />
          3. Принесите распечатанную и подписанную заявку организатору вместе со справками с места учёбы или работы
          {t.registration_closes_at ? ` — до ${formatDateTime(t.registration_closes_at)}` : ""}.
        </Callout>
        <p className="mt-3 text-meta text-fg-3">Если в листе ошибка — исправьте анкету игрока или напишите организатору: после подачи заявку меняет только он.</p>
      </div>
      <div className="f16-print mt-8">
        <ApplicationSheet t={t} data={data} index={index} />
      </div>
    </Container>
  );
}
