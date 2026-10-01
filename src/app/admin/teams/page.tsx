import type { Metadata } from "next";
import Link from "next/link";
import { listTeams } from "@/lib/data";
import { formatDate, registrationStatusLabel } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { RegistrationStatus } from "@/lib/types";
import { EmptyState, TeamLogo } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";

export const metadata: Metadata = { title: "Команды — F16 Control" };

export default async function AdminTeamsPage(props: PageProps<"/admin/teams">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listTeams();
  const teams = q ? all.filter((t) => t.name.toLowerCase().includes(q) || t.tag.toLowerCase().includes(q)) : all;

  const [{ data: captains }, { data: regs }] = await Promise.all([
    db().from("players").select("id, nickname").in("id", [...new Set(all.map((t) => t.captain_id))]),
    db()
      .from("tournament_registrations")
      .select("team_id, status, tournament:tournaments!inner(name, status)")
      .in("status", ["pending", "approved"])
      .not("tournament.status", "in", "(finished,cancelled)"),
  ]);
  const captainName = new Map((captains ?? []).map((p) => [p.id as string, p.nickname as string]));
  type Reg = { team_id: string; status: RegistrationStatus; tournament: { name: string } };
  const regByTeam = new Map(((regs ?? []) as unknown as Reg[]).map((r) => [r.team_id, r]));

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Команды"
        description={`${all.length} активных`}
        actions={
          <form className="w-64">
            <input name="q" defaultValue={q} placeholder="Название или тег" className="field h-8 text-[13px]" />
          </form>
        }
      />
      {teams.length === 0 ? (
        <EmptyState compact title={q ? "Ничего не найдено" : "Команд пока нет"} />
      ) : (
        <TableBox minWidth={900} maxHeight={720}>
          <thead>
            <tr>
              <th>Команда</th>
              <th>Капитан</th>
              <th className="text-right">Игроков</th>
              <th className="text-right">Avg ELO</th>
              <th>Турнир</th>
              <th>Статус</th>
              <th>Инвайт</th>
              <th>Создана</th>
            </tr>
          </thead>
          <tbody>
            {teams.map((t) => {
              const reg = regByTeam.get(t.id);
              return (
                <tr key={t.id}>
                  <td>
                    <Link href={`/teams/${t.tag}`} className="flex items-center gap-2.5 text-fg hover:text-accent">
                      <TeamLogo src={t.logo_url} tag={t.tag} size={24} />
                      <span className="font-medium">{t.name}</span>
                      <span className="text-[12px] text-fg-3">{t.tag}</span>
                    </Link>
                  </td>
                  <td>{captainName.get(t.captain_id) ?? "—"}</td>
                  <td className="text-right num">{t.member_count}</td>
                  <td className="text-right num">{t.avg_elo ?? "—"}</td>
                  <td className="max-w-[180px] truncate">{reg?.tournament.name ?? <span className="text-fg-3">—</span>}</td>
                  <td>
                    {reg ? (
                      <span className={reg.status === "approved" ? "text-ok" : "text-warn"}>{registrationStatusLabel[reg.status]}</span>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </td>
                  <td className="num text-[12px]">{t.invite_code}</td>
                  <td className="num">{formatDate(t.created_at)}</td>
                </tr>
              );
            })}
          </tbody>
        </TableBox>
      )}
    </div>
  );
}
