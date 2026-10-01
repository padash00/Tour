import type { Metadata } from "next";
import Link from "next/link";
import { togglePlayerFlag } from "@/app/actions/admin";
import { listPlayers } from "@/lib/data";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, EmptyState, FaceitLevel } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";

export const metadata: Metadata = { title: "Игроки — F16 Control" };

export default async function AdminPlayersPage(props: PageProps<"/admin/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listPlayers();
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;
  const envAdmins = env.adminSteamIds;

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Игроки"
        description={`${all.length} зарегистрировано`}
        actions={
          <form className="w-64">
            <input name="q" defaultValue={q} placeholder="Ник или SteamID" className="field h-8 text-[13px]" />
          </form>
        }
      />
      {players.length === 0 ? (
        <EmptyState compact title="Игроков не найдено" />
      ) : (
        <TableBox minWidth={940}>
          <thead>
            <tr>
              <th>SteamID64</th>
              <th>Ник</th>
              <th className="text-center">FACEIT</th>
              <th className="text-right">ELO</th>
              <th>Команда</th>
              <th>Вход</th>
              <th>Статус</th>
              <th className="text-right">Действия</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p) => {
              const envAdmin = envAdmins.includes(p.steam_id);
              return (
                <tr key={p.id}>
                  <td className="num text-[12px] text-fg-3">{p.steam_id}</td>
                  <td>
                    <Link href={`/players/${p.steam_id}`} className="flex items-center gap-2.5 text-fg hover:text-accent">
                      <Avatar src={p.avatar_url} name={p.nickname} size={24} />
                      <span className="font-medium">{p.nickname}</span>
                    </Link>
                  </td>
                  <td className="text-center">
                    <FaceitLevel level={p.faceit_level} />
                  </td>
                  <td className="text-right num">{p.faceit_elo ?? "—"}</td>
                  <td>{p.team?.name ?? <span className="text-fg-3">—</span>}</td>
                  <td className="num">{formatDate(p.last_login_at)}</td>
                  <td>
                    <span className="flex items-center gap-2 text-[12px]">
                      {(p.is_admin || envAdmin) && <span className="text-accent">admin</span>}
                      {p.is_banned && <span className="text-danger">бан</span>}
                      {!p.is_admin && !envAdmin && !p.is_banned && <span className="text-fg-3">игрок</span>}
                    </span>
                  </td>
                  <td>
                    <div className="flex justify-end items-center gap-1">
                      {!envAdmin && (
                        <ActionForm action={togglePlayerFlag}>
                          <input type="hidden" name="playerId" value={p.id} />
                          <input type="hidden" name="flag" value="is_admin" />
                          <SubmitButton
                            size="sm"
                            variant="ghost"
                            confirm={p.is_admin ? `Снять права админа с ${p.nickname}?` : `Сделать ${p.nickname} администратором?`}
                          >
                            {p.is_admin ? "− admin" : "+ admin"}
                          </SubmitButton>
                        </ActionForm>
                      )}
                      <ActionForm action={togglePlayerFlag}>
                        <input type="hidden" name="playerId" value={p.id} />
                        <input type="hidden" name="flag" value="is_banned" />
                        <SubmitButton
                          size="sm"
                          variant={p.is_banned ? "secondary" : "ghost"}
                          className={p.is_banned ? undefined : "text-danger/80 hover:text-danger"}
                          confirm={p.is_banned ? `Разблокировать ${p.nickname}?` : `Заблокировать ${p.nickname}?`}
                        >
                          {p.is_banned ? "Разбан" : "Бан"}
                        </SubmitButton>
                      </ActionForm>
                    </div>
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
