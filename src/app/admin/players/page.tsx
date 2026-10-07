import type { Metadata } from "next";
import Link from "next/link";
import { togglePlayerFlag } from "@/app/actions/admin";
import { listPlayers } from "@/lib/data";
import { env } from "@/lib/env";
import { formatDate } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Avatar, EmptyState, FaceitLevel } from "@/components/ui";
import { AdminHeader, TableBox } from "@/components/admin/control";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Игроки — F16 Control" };

export default async function AdminPlayersPage(props: PageProps<"/admin/players">) {
  await requireAdmin("/admin/players"); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const role = sp.r === "admin" || sp.r === "banned" ? sp.r : "all";
  const all = await listPlayers();
  const envAdmins = env.adminSteamIds;
  const isAdm = (p: (typeof all)[number]) => p.is_admin || envAdmins.includes(p.steam_id);
  const players = all
    .filter((p) => !q || p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q))
    .filter((p) => role === "all" || (role === "admin" ? isAdm(p) : p.is_banned));
  const ROLES = [
    { key: "all", label: "Все", n: all.length },
    { key: "admin", label: "Админы", n: all.filter(isAdm).length },
    { key: "banned", label: "Бан", n: all.filter((p) => p.is_banned).length },
  ];
  const roleHref = (r: string) => {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (r !== "all") p.set("r", r);
    const qs = p.toString();
    return qs ? `/admin/players?${qs}` : "/admin/players";
  };

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Игроки"
        description={`${all.length} зарегистрировано`}
        actions={
          <form className="w-72" role="search">
            {role !== "all" && <input type="hidden" name="r" value={role} />}
            <input name="q" defaultValue={q} placeholder="Ник или SteamID" aria-label="Поиск игрока" className="field !h-10 text-[13px]" />
          </form>
        }
      />
      <div className="flex gap-1">
        {ROLES.map((r) => (
          <Link
            key={r.key}
            href={roleHref(r.key)}
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-[7px] text-[12px] transition ${role === r.key ? "bg-accent/[0.1] text-accent" : "text-fg-3 hover:text-fg-2 hover:bg-white/[0.03]"}`}
          >
            {r.label} <span className="num opacity-70">{r.n}</span>
          </Link>
        ))}
      </div>
      {players.length === 0 ? (
        <EmptyState compact title="Игроков не найдено" />
      ) : (
        <TableBox minWidth={940} maxHeight={720}>
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
                      <Link href={`/admin/players/${p.id}/profile`} className="px-2 text-[12px] text-accent hover:underline">
                        Анкета
                      </Link>
                      {!envAdmin && (
                        <ActionForm action={togglePlayerFlag}>
                          <input type="hidden" name="playerId" value={p.id} />
                          <input type="hidden" name="flag" value="is_admin" />
                          <input type="hidden" name="value" value={p.is_admin ? "0" : "1"} />
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
                        <input type="hidden" name="value" value={p.is_banned ? "0" : "1"} />
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
