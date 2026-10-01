import type { Metadata } from "next";
import Link from "next/link";
import { approvedCounts } from "@/lib/data";
import { formatShortDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Tournament, TournamentStatus } from "@/lib/types";
import { ButtonLink, EmptyState } from "@/components/ui";
import { TournamentStatusChip } from "@/components/primitives";
import { AdminHeader, TableBox } from "@/components/admin/control";
import { MiniLifecycle } from "@/components/admin/kit";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Турниры — F16 Control" };

/** Позиция статуса на ленте Черновик → Регистрация → Check-in → Идёт → Завершён */
const LIFE_INDEX: Record<TournamentStatus, number> = {
  draft: 0,
  registration: 1,
  registration_closed: 1,
  checkin: 2,
  live: 3,
  finished: 4,
  cancelled: -1,
};

/** Следующее действие оператора — подсказка в строке */
function nextAction(t: Tournament, pending: number): { text: string; tab?: string } | null {
  if (pending > 0) return { text: `Рассмотреть заявки (${pending})`, tab: "registration" };
  switch (t.status) {
    case "draft":
      return { text: "Открыть регистрацию" };
    case "registration":
      return { text: "Закрыть регистрацию" };
    case "registration_closed":
      return { text: "Открыть check-in" };
    case "checkin":
      return t.bracket_published_at ? { text: "Запустить турнир" } : { text: "Создать сетку" };
    case "live":
      return { text: "Матчи турнира", tab: "matches" };
    default:
      return null;
  }
}

export default async function AdminTournamentsPage() {
  await requireAdmin("/admin/tournaments"); // права проверяются в каждой странице, не только в layout
  const [{ data }, { data: pendingRows }] = await Promise.all([
    db().from("tournaments").select("*").order("created_at", { ascending: false }),
    db().from("tournament_registrations").select("tournament_id").eq("status", "pending"),
  ]);
  const tournaments = (data ?? []) as Tournament[];
  const counts = await approvedCounts(tournaments.map((t) => t.id));
  const pending: Record<string, number> = {};
  for (const r of pendingRows ?? []) pending[r.tournament_id] = (pending[r.tournament_id] ?? 0) + 1;

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Турниры"
        description={`${tournaments.length} всего · ${tournaments.filter((t) => !["finished", "cancelled", "draft"].includes(t.status)).length} в работе`}
        actions={
          <ButtonLink href="/admin/tournaments/new" size="sm">
            Новый турнир
          </ButtonLink>
        }
      />
      {tournaments.length === 0 ? (
        <EmptyState
          title="Турниров ещё нет"
          description="Новый турнир сохраняется как черновик и не виден игрокам, пока вы не откроете регистрацию."
          action={
            <ButtonLink href="/admin/tournaments/new" size="sm">
              Новый турнир
            </ButtonLink>
          }
        />
      ) : (
        <TableBox minWidth={980}>
          <thead>
            <tr>
              <th>Турнир</th>
              <th>Этап</th>
              <th className="text-right">Команды</th>
              <th className="text-right">Заявки</th>
              <th>Старт</th>
              <th>Следующий шаг</th>
              <th className="text-right">Ещё</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => {
              const next = nextAction(t, pending[t.id] ?? 0);
              const base = `/admin/tournaments/${t.id}`;
              return (
                <tr key={t.id} className={t.status === "live" ? "bg-danger/[0.03]" : undefined}>
                  <td>
                    <Link href={base} className="font-semibold text-fg hover:text-accent">
                      {t.name}
                    </Link>
                    <div className="text-[11px] text-fg-3 num">/{t.slug}</div>
                  </td>
                  <td>
                    <div className="flex flex-col gap-1.5">
                      <TournamentStatusChip status={t.status} size="sm" />
                      <MiniLifecycle total={5} current={LIFE_INDEX[t.status]} cancelled={t.status === "cancelled"} />
                    </div>
                  </td>
                  <td className="text-right num text-fg">
                    {counts[t.id] ?? 0}
                    <span className="text-fg-3">/{t.max_teams}</span>
                  </td>
                  <td className={`text-right num ${pending[t.id] ? "text-warn" : "text-fg-3"}`}>{pending[t.id] ?? 0}</td>
                  <td className="num">{formatShortDateTime(t.starts_at)}</td>
                  <td>
                    {next ? (
                      <Link href={next.tab ? `${base}?tab=${next.tab}` : base} className="text-[12px] font-medium text-accent hover:underline">
                        {next.text} →
                      </Link>
                    ) : (
                      <span className="text-[12px] text-fg-3">—</span>
                    )}
                  </td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/tournaments/${t.slug}`} className="text-[12px] text-fg-3 hover:text-fg">
                      На сайте ↗
                    </Link>
                    <span className="text-fg-3 mx-2">·</span>
                    <Link href={`${base}?tab=settings#danger`} className="text-[12px] text-danger/80 hover:text-danger">
                      Удалить
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
    </div>
  );
}
