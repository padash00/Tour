import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/supabase";
import { getGame } from "@/lib/lobby";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { formatDateTime } from "@/lib/format";
import { getMapImages } from "@/lib/settings";
import { MapThumb } from "@/components/lobby/settings";
import { PageHero, WRAP, btnClass } from "@/components/primitives";
import { cn } from "@/components/ui";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f-]{36}$/i;

export async function generateMetadata(props: PageProps<"/lobbies/games/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  const g = UUID.test(id) ? await getGame(id) : null;
  return { title: g ? `${g.team1.name} ${g.team1_score}:${g.team2_score} ${g.team2.name}` : "Матч лобби" };
}

type Stat = { map_number: number; steam_id: string; team: number; name: string | null; kills: number; deaths: number; assists: number; damage: number; headshot_kills: number; rounds_played: number; kast: number; mvp: number };

export default async function LobbyGamePage(props: PageProps<"/lobbies/games/[id]">) {
  const { id } = await props.params;
  if (!UUID.test(id)) notFound();
  const g = await getGame(id);
  if (!g) notFound();
  const [{ data: lobby }, { data: rows }, images] = await Promise.all([
    db().from("lobbies").select("code").eq("id", g.lobby_id).maybeSingle(),
    db().from("lobby_player_stats").select("*").eq("game_id", g.id),
    getMapImages(),
  ]);
  const stats = (rows ?? []) as Stat[];

  // сумма по всем картам на игрока
  const total = new Map<string, Stat>();
  for (const r of stats) {
    const t = total.get(r.steam_id);
    if (!t) total.set(r.steam_id, { ...r });
    else for (const k of ["kills", "deaths", "assists", "damage", "headshot_kills", "rounds_played", "kast", "mvp"] as const) t[k] += r[k];
  }
  const table = (team: 1 | 2) => [...total.values()].filter((r) => r.team === team).sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
  const steamOf = new Map([...g.team1.players, ...g.team2.players].map((p) => [p.steam_id, p.nickname]));

  return (
    <>
      <PageHero
        compact
        eyebrow={`Неофициальный матч · ${MODES[g.settings.mode].label} · BO${g.best_of}`}
        title={
          <span className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className={cn(g.winner === 1 && "text-ok")}>{g.team1.name}</span>
            <span className="num text-fg-2">
              {g.team1_score}:{g.team2_score}
            </span>
            <span className={cn(g.winner === 2 && "text-ok")}>{g.team2.name}</span>
          </span>
        }
        description={g.finished_at ? `Сыгран ${formatDateTime(g.finished_at)}. В статистику турниров не идёт.` : g.status === "cancelled" ? "Матч отменён." : "Матч ещё идёт."}
        actions={
          lobby?.code && (
            <Link href={`/lobby/${lobby.code}`} className={btnClass("secondary", "md")}>
              В лобби #{lobby.code}
            </Link>
          )
        }
      />
      <div className={`${WRAP} space-y-10 pt-10`}>
        <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {g.maps.map((m, i) => (
            <MapThumb key={i} map={m.map} image={images[m.map]} className="h-24 rounded-[12px] border border-white/[0.06]">
              <span className="absolute bottom-2 left-3 text-[14px] font-semibold">{mapLabel(m.map)}</span>
              <span className="num absolute right-3 top-2 text-[18px] font-semibold">
                {m.team1_score}:{m.team2_score}
              </span>
            </MapThumb>
          ))}
        </div>
        {([1, 2] as const).map((team) => {
          const list = table(team);
          const t = team === 1 ? g.team1 : g.team2;
          return (
            <section key={team}>
              <h2 className="mb-3 text-[18px] font-semibold">
                {t.name}
                {t.bots.length > 0 && <span className="ml-2 text-[13px] font-normal text-fg-3">+ {t.bots.length} бот(а)</span>}
              </h2>
              <div className="overflow-x-auto rounded-[12px] border border-white/[0.06] bg-surface">
                <table className="w-full min-w-[620px] text-[14px]">
                  <thead className="text-[12px] uppercase tracking-wider text-fg-3">
                    <tr className="border-b border-white/[0.06]">
                      <th className="px-4 py-3 text-left font-medium">Игрок</th>
                      {["K", "D", "A", "±", "ADR", "HS%", "KAST", "MVP"].map((h) => (
                        <th key={h} className="px-3 py-3 text-right font-medium">
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {list.length === 0 && (
                      <tr>
                        <td colSpan={9} className="px-4 py-6 text-center text-fg-3">
                          Статистики нет
                        </td>
                      </tr>
                    )}
                    {list.map((r) => {
                      const rounds = Math.max(1, r.rounds_played);
                      const diff = r.kills - r.deaths;
                      return (
                        <tr key={r.steam_id} className="border-b border-white/[0.04] last:border-0">
                          <td className="px-4 py-2.5">
                            <Link href={`/players/${r.steam_id}`} className="font-medium hover:text-accent">
                              {steamOf.get(r.steam_id) ?? r.name}
                            </Link>
                          </td>
                          <td className="num px-3 text-right">{r.kills}</td>
                          <td className="num px-3 text-right">{r.deaths}</td>
                          <td className="num px-3 text-right">{r.assists}</td>
                          <td className={cn("num px-3 text-right", diff > 0 ? "text-ok" : diff < 0 ? "text-danger" : "text-fg-3")}>{diff > 0 ? `+${diff}` : diff}</td>
                          <td className="num px-3 text-right">{Math.round(r.damage / rounds)}</td>
                          <td className="num px-3 text-right">{r.kills ? Math.round((100 * r.headshot_kills) / r.kills) : 0}%</td>
                          <td className="num px-3 text-right">{r.kast ? `${Math.round((100 * r.kast) / rounds)}%` : "—"}</td>
                          <td className="num px-3 text-right">{r.mvp}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
      </div>
    </>
  );
}
