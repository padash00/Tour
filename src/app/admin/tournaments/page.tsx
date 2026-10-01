import type { Metadata } from "next";
import Link from "next/link";
import { approvedCounts } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { ButtonLink, EmptyState, IconTrophy } from "@/components/ui";

export const metadata: Metadata = { title: "Турниры — админ" };

export default async function AdminTournamentsPage() {
  const { data } = await db().from("tournaments").select("*").order("created_at", { ascending: false });
  const tournaments = (data ?? []) as Tournament[];
  const counts = await approvedCounts(tournaments.map((t) => t.id));

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label">Управление</div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Турниры</h1>
        </div>
        <ButtonLink href="/admin/tournaments/new">Создать турнир</ButtonLink>
      </div>
      {tournaments.length === 0 ? (
        <EmptyState
          icon={<IconTrophy />}
          title="Турниров ещё нет"
          description="Создайте первый турнир. Он сохранится как черновик и не будет виден, пока вы не откроете регистрацию."
          action={<ButtonLink href="/admin/tournaments/new">Создать турнир</ButtonLink>}
        />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th>Турнир</th>
                <th>Статус</th>
                <th>Старт</th>
                <th className="text-right">Команды</th>
                <th>Призовой</th>
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/admin/tournaments/${t.id}`} className="font-medium text-fg hover:text-accent">
                      {t.name}
                    </Link>
                    <div className="text-xs text-fg-3 num">/{t.slug}</div>
                  </td>
                  <td><TournamentStatusPill status={t.status} /></td>
                  <td>{formatDate(t.starts_at)}</td>
                  <td className="text-right num">{counts[t.id] ?? 0}/{t.max_teams}</td>
                  <td>{t.prize_pool ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
