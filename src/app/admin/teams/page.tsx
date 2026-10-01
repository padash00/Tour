import type { Metadata } from "next";
import Link from "next/link";
import { listTeams } from "@/lib/data";
import { formatDate } from "@/lib/format";
import { EmptyState, TeamLogo } from "@/components/ui";

export const metadata: Metadata = { title: "Команды — админ" };

export default async function AdminTeamsPage() {
  const teams = await listTeams();
  return (
    <div className="space-y-8">
      <div>
        <div className="label">Сообщество</div>
        <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Команды · {teams.length}</h1>
      </div>
      {teams.length === 0 ? (
        <EmptyState title="Команд пока нет" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th>Команда</th>
                <th>Регион</th>
                <th className="text-right">Игроков</th>
                <th className="text-right">Avg ELO</th>
                <th>Инвайт</th>
                <th>Создана</th>
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link href={`/teams/${t.tag}`} className="flex items-center gap-3 text-fg hover:text-accent">
                      <TeamLogo src={t.logo_url} tag={t.tag} size={30} />
                      <span className="font-medium">{t.name}</span>
                      <span className="text-xs text-fg-3">{t.tag}</span>
                    </Link>
                  </td>
                  <td>{t.region ?? "—"}</td>
                  <td className="text-right num">{t.member_count}</td>
                  <td className="text-right num">{t.avg_elo ?? "—"}</td>
                  <td className="num text-xs">{t.invite_code}</td>
                  <td>{formatDate(t.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
