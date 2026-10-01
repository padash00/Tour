import type { Metadata } from "next";
import Link from "next/link";
import { approvedCounts } from "@/lib/data";
import { formatShortDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Tournament } from "@/lib/types";
import { StatusChip } from "@/components/admin/tournament-kit";
import { ButtonLink, EmptyState } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";

export const metadata: Metadata = { title: "Турниры — F16 Control" };

function registrationState(t: Tournament) {
  if (t.status === "registration") return { text: "открыта", cls: "text-ok" };
  if (t.status === "draft") return { text: t.registration_opens_at ? `с ${formatShortDateTime(t.registration_opens_at)}` : "не открыта", cls: "text-fg-3" };
  if (t.status === "checkin") return { text: "check-in", cls: "text-warn" };
  return { text: "закрыта", cls: "text-fg-3" };
}

export default async function AdminTournamentsPage() {
  const { data } = await db().from("tournaments").select("*").order("created_at", { ascending: false });
  const tournaments = (data ?? []) as Tournament[];
  const counts = await approvedCounts(tournaments.map((t) => t.id));

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Турниры"
        actions={<ButtonLink href="/admin/tournaments/new" size="sm" className="rounded-[8px]">Новый турнир</ButtonLink>}
      />
      {tournaments.length === 0 ? (
        <EmptyState
          title="Турниров ещё нет"
          description="Новый турнир сохраняется как черновик и не виден игрокам, пока вы не откроете регистрацию."
          action={<ButtonLink href="/admin/tournaments/new" size="sm" className="rounded-[8px]">Новый турнир</ButtonLink>}
        />
      ) : (
        <TableBox minWidth={760}>
          <thead>
            <tr>
              <th>Турнир</th>
              <th>Статус</th>
              <th>Регистрация</th>
              <th className="text-right">Команды</th>
              <th>Старт</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => {
              const reg = registrationState(t);
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/admin/tournaments/${t.id}`} className="font-semibold text-fg hover:text-accent">
                      {t.name}
                    </Link>
                    <div className="text-[11px] text-fg-3 num">/{t.slug}</div>
                  </td>
                  <td>
                    <StatusChip status={t.status} />
                  </td>
                  <td className={reg.cls}>{reg.text}</td>
                  <td className="text-right num text-fg">
                    {counts[t.id] ?? 0}
                    <span className="text-fg-3">/{t.max_teams}</span>
                  </td>
                  <td className="num">{formatShortDateTime(t.starts_at)}</td>
                  <td className="text-right whitespace-nowrap">
                    <Link href={`/admin/tournaments/${t.id}`} className="text-[12px] text-accent hover:underline">
                      Управлять
                    </Link>
                    <span className="text-fg-3 mx-2">·</span>
                    <Link href={`/tournaments/${t.slug}`} className="text-[12px] text-fg-3 hover:text-fg">
                      На сайте ↗
                    </Link>
                    <span className="text-fg-3 mx-2">·</span>
                    <Link href={`/admin/tournaments/${t.id}?tab=settings#danger`} className="text-[12px] text-danger/80 hover:text-danger">
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
