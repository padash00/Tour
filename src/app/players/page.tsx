import type { Metadata } from "next";
import Link from "next/link";
import { listPlayers } from "@/lib/data";
import { Avatar, Container, EmptyState, FaceitLevel, PageHeader } from "@/components/ui";

export const metadata: Metadata = { title: "Игроки" };

export default async function PlayersPage(props: PageProps<"/players">) {
  const sp = await props.searchParams;
  const q = typeof sp.q === "string" ? sp.q.trim().toLowerCase() : "";
  const all = await listPlayers();
  const players = q ? all.filter((p) => p.nickname.toLowerCase().includes(q) || p.steam_id.includes(q)) : all;

  return (
    <Container>
      <PageHeader
        eyebrow="Сообщество"
        title="Игроки"
        description="Все игроки платформы. Порядок — по FACEIT ELO, пока не сыграны первые матчи F16."
      />
      <form className="mb-6 sm:w-72">
        <input name="q" defaultValue={q} placeholder="Ник или SteamID" className="field h-9 py-0" />
      </form>
      {players.length === 0 ? (
        <EmptyState title={all.length === 0 ? "Игроков пока нет" : "Ничего не найдено"} />
      ) : (
        <div className="card overflow-x-auto">
          <table className="tbl min-w-[640px]">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Игрок</th>
                <th>Команда</th>
                <th className="text-center">FACEIT</th>
                <th className="text-right">ELO</th>
                <th className="text-right">Матчи F16</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p, i) => (
                <tr key={p.id}>
                  <td className="num text-fg-3">{i + 1}</td>
                  <td>
                    <Link href={`/players/${p.steam_id}`} className="flex items-center gap-3 text-fg hover:text-accent">
                      <Avatar src={p.avatar_url} name={p.nickname} size={30} />
                      <span className="font-medium">{p.nickname}</span>
                    </Link>
                  </td>
                  <td>
                    {p.team ? (
                      <Link href={`/teams/${p.team.tag}`} className="hover:text-fg">
                        {p.team.name}
                      </Link>
                    ) : (
                      <span className="text-fg-3">—</span>
                    )}
                  </td>
                  <td className="text-center">
                    <FaceitLevel level={p.faceit_level} />
                  </td>
                  <td className="text-right num">{p.faceit_elo ?? "—"}</td>
                  <td className="text-right num text-fg-3">0</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Container>
  );
}
