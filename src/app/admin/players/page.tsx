import type { Metadata } from "next";
import Link from "next/link";
import { togglePlayerFlag } from "@/app/actions/admin";
import { listPlayers } from "@/lib/data";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, EmptyState, FaceitLevel, Pill } from "@/components/ui";

export const metadata: Metadata = { title: "Игроки — админ" };

export default async function AdminPlayersPage(props: PageProps<"/admin/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listPlayers();
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;
  const envAdmins = env.adminSteamIds;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="label">Сообщество</div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Игроки · {all.length}</h1>
        </div>
        <form className="w-72">
          <input name="q" defaultValue={q} placeholder="Ник или SteamID" className="field h-9 py-0" />
        </form>
      </div>
      {players.length === 0 ? (
        <EmptyState title="Игроков не найдено" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[860px]">
            <thead>
              <tr>
                <th>Игрок</th>
                <th>SteamID64</th>
                <th>Команда</th>
                <th className="text-center">FACEIT</th>
                <th>Последний вход</th>
                <th className="text-right">Права</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => {
                const envAdmin = envAdmins.includes(p.steam_id);
                return (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/players/${p.steam_id}`} className="flex items-center gap-3 text-fg hover:text-accent">
                        <Avatar src={p.avatar_url} name={p.nickname} size={28} />
                        <span className="font-medium">{p.nickname}</span>
                      </Link>
                    </td>
                    <td className="num text-xs">{p.steam_id}</td>
                    <td>{p.team?.name ?? <span className="text-fg-3">—</span>}</td>
                    <td className="text-center"><FaceitLevel level={p.faceit_level} /></td>
                    <td className="text-xs">{formatDate(p.last_login_at)}</td>
                    <td>
                      <div className="flex justify-end items-center gap-1.5">
                        {(p.is_admin || envAdmin) && <Pill tone="accent">Admin</Pill>}
                        {p.is_banned && <Pill tone="danger">Бан</Pill>}
                        <ActionForm action={togglePlayerFlag}>
                          <input type="hidden" name="playerId" value={p.id} />
                          <input type="hidden" name="flag" value="is_banned" />
                          <SubmitButton
                            size="sm"
                            variant={p.is_banned ? "secondary" : "ghost"}
                            confirm={p.is_banned ? `Разблокировать ${p.nickname}?` : `Заблокировать ${p.nickname}?`}
                          >
                            {p.is_banned ? "Разбан" : "Бан"}
                          </SubmitButton>
                        </ActionForm>
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
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
