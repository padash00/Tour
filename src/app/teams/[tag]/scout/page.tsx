import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { Container } from "@/components/ds";
import { getCurrentPlayer } from "@/lib/auth";
import { getTeamByTag } from "@/lib/data";
import { canScout, teamScout, type ScoutCount, type ScoutSide } from "@/lib/scout";

export const metadata: Metadata = { title: "Разведка соперника", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

const map = (m: string) => m.replace(/^de_/, "");

function Bars({ list, empty }: { list: ScoutCount[]; empty: string }) {
  if (!list.length) return <p className="text-[13.5px] text-white/45">{empty}</p>;
  return (
    <ul className="space-y-1.5">
      {list.map((c) => (
        <li key={c.name} className="text-[14px]">
          <div className="flex justify-between gap-2"><span>{c.name}</span><span className="num text-white/60">{c.share}%</span></div>
          <div className="mt-0.5 h-1.5 rounded bg-white/10"><div className="h-1.5 rounded bg-[#d4ff1f]" style={{ width: `${Math.max(3, c.share)}%` }} /></div>
        </li>
      ))}
    </ul>
  );
}

function SidePanel({ title, s, color }: { title: string; s: ScoutSide; color: string }) {
  return (
    <section className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[18px] font-extrabold" style={{ color }}>{title}</h2>
        <span className="text-[13px] text-white/55">{s.rounds} раундов · выигрывают {s.winRate}%</span>
      </div>
      <div className="mt-3 grid gap-5 sm:grid-cols-2">
        <div>
          <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-white/50">Где стоят на 0:20</div>
          <Bars list={s.spots} empty="Мало данных" />
        </div>
        <div>
          <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-white/50">Где первая дуэль · выигрывают {s.openingWin}%</div>
          <Bars list={s.openingPlaces} empty="Мало данных" />
        </div>
      </div>
      <div className="mt-5">
        <div className="mb-2 text-[13px] font-bold uppercase tracking-wide text-white/50">Гранаты</div>
        {s.nades.length ? (
          <ul className="grid gap-1.5 sm:grid-cols-2">
            {s.nades.map((n) => (
              <li key={`${n.type}${n.to}`} className="rounded-lg bg-white/5 px-3 py-1.5 text-[14px]">
                <b>{n.type}</b> → {n.to} <span className="text-white/50">· {n.perGame} за карту · ~{n.rt} с</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13.5px] text-white/45">Мало данных</p>
        )}
      </div>
    </section>
  );
}

/** Разведка соперника: как команда играет по разборам её карт в клубе */
export default async function ScoutPage(props: PageProps<"/teams/[tag]/scout">) {
  const { tag } = await props.params;
  const sp = await props.searchParams;
  const team = await getTeamByTag(decodeURIComponent(tag));
  if (!team) notFound();
  const me = await getCurrentPlayer();
  if (!(await canScout(team.id, me))) notFound();
  const mapParam = typeof sp.map === "string" && /^[a-z0-9_]{3,40}$/.test(sp.map) ? sp.map : null;
  const r = await teamScout(team.id, mapParam);
  const href = (m: string | null) => `/teams/${encodeURIComponent(team.tag)}/scout${m ? `?map=${m}` : ""}`;

  return (
    <Container width="wide" className="space-y-5 pb-16 pt-6 sm:pt-8">
      <Link href={`/teams/${encodeURIComponent(team.tag)}`} className="-ml-1 inline-flex items-center gap-1 text-meta text-fg-3 hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden />
        {team.name}
      </Link>
      <div className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
        <div className="text-[13px] font-bold uppercase tracking-wide text-[#d4ff1f]">Разведка соперника</div>
        <h1 className="mt-1 text-[26px] font-black">{team.name}</h1>
        <p className="mt-1 text-[14px] text-white/60">
          По разборам карт в клубе, где играли минимум трое из состава. {r?.games.length ? `Карт: ${r.games.length}.` : ""} Видят игроки этой команды, их ближайшие соперники и админы.
        </p>
        {r && r.maps.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Link href={href(null)} className={`rounded-lg px-3 py-1.5 text-[13.5px] font-bold ${!r.map ? "bg-[#d4ff1f] text-[#0b0d09]" : "bg-white/10 text-white/85 hover:bg-white/15"}`}>Все карты</Link>
            {r.maps.map((m) => (
              <Link key={m.map} href={href(m.map)} className={`rounded-lg px-3 py-1.5 text-[13.5px] font-bold ${r.map === m.map ? "bg-[#d4ff1f] text-[#0b0d09]" : "bg-white/10 text-white/85 hover:bg-white/15"}`}>
                {map(m.map)} · {m.games} ({m.wins} побед)
              </Link>
            ))}
          </div>
        )}
      </div>

      {!r || r.games.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-line p-8 text-center text-fg-3">
          Пока нет разобранных карт этой команды. Разведка появится, как только они сыграют в клубе — лобби или матч турнира: каждая карта разбирается сама.
        </div>
      ) : (
        <>
          {r.insights.length > 0 && (
            <section className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
              <h2 className="text-[18px] font-extrabold">Главное</h2>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-[15px] text-white/85">
                {r.insights.map((x) => <li key={x}>{x}</li>)}
              </ul>
            </section>
          )}
          <div className="grid gap-5 lg:grid-cols-2">
            <SidePanel title="В атаке (T)" s={r.T} color="#e8a23a" />
            <SidePanel title="В защите (CT)" s={r.CT} color="#5aa9e6" />
          </div>
          <section className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
            <h2 className="text-[18px] font-extrabold">Игроки</h2>
            {r.plants.length > 0 && <p className="mt-1 text-[14px] text-white/60">Закладки: {r.plants.map((p) => `${p.name} ${p.share}%`).join(" · ")}{r.plantTime != null ? ` · в среднем на ${r.plantTime} с` : ""}</p>}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-[14px]">
                <thead className="text-[12.5px] uppercase text-white/45">
                  <tr><th className="py-1.5 pr-3">Игрок</th><th className="pr-3">Раундов</th><th className="pr-3">Убийств за раунд</th><th className="pr-3">Идёт первым</th><th className="pr-3">AWP</th><th className="pr-3">Атака: обычно</th><th>Защита: обычно</th></tr>
                </thead>
                <tbody>
                  {r.players.map((p) => (
                    <tr key={p.steamid} className="border-t border-white/10">
                      <td className="py-2 pr-3 font-bold">{p.name}</td>
                      <td className="num pr-3">{p.rounds}</td>
                      <td className="num pr-3">{p.kpr}</td>
                      <td className="pr-3">{p.entry}%{p.entry ? <span className="text-white/45"> · побед {p.entryWin}%</span> : null}</td>
                      <td className="num pr-3">{p.awp}%</td>
                      <td className="pr-3 text-white/80">{p.spotsT.map((s) => `${s.name} ${s.share}%`).join(", ") || "—"}</td>
                      <td className="text-white/80">{p.spotsCT.map((s) => `${s.name} ${s.share}%`).join(", ") || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
          <section className="rounded-2xl bg-[#0f120c] p-4 text-white sm:p-5">
            <h2 className="text-[18px] font-extrabold">Карты</h2>
            <ul className="mt-2 space-y-1 text-[14px]">
              {r.games.map((g) => (
                <li key={g.id}>
                  <Link href={`/analysis/${g.id}`} className="hover:text-[#d4ff1f]">{g.title}</Link>
                  <span className="text-white/50"> · {g.won}:{g.lost} · {new Date(g.date).toLocaleDateString("ru-RU")}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </Container>
  );
}
