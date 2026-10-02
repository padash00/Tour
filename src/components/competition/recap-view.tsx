import Link from "next/link";
import { mapName } from "@/lib/format";
import type { MapHighlight, Placement, TournamentRecap } from "@/lib/recap";
import { fmt } from "@/components/stats-table";
import { CARD, Eyebrow } from "@/components/primitives";
import { Avatar, TeamLogo, cn } from "@/components/ui";

/*
 * Итоги турнира: пьедестал, путь чемпиона, MVP, лидеры статистики, карты-рекорды, цифры турнира.
 * Используется во вкладке «Итоги» и на странице /tournaments/[slug]/recap (её удобно отправить в соцсети).
 */

const MEDAL: Record<string, string> = {
  "1": "text-[#e8c27a] border-[#e8c27a]/40 bg-[#e8c27a]/[0.08]",
  "2": "text-[#c9d3e0] border-[#c9d3e0]/35 bg-[#c9d3e0]/[0.06]",
  "3": "text-[#d39a6a] border-[#d39a6a]/35 bg-[#d39a6a]/[0.06]",
  "3–4": "text-[#d39a6a] border-[#d39a6a]/35 bg-[#d39a6a]/[0.06]",
};
const PLACE_LABEL: Record<string, string> = { "1": "Чемпион", "2": "2 место", "3": "3 место", "3–4": "3–4 место" };

function PlaceCard({ p, big }: { p: Placement; big?: boolean }) {
  return (
    <div className={cn(CARD, "flex flex-col p-6 lg:p-8", big && "lg:p-10 border-[#e8c27a]/25")}>
      <span className={cn("inline-flex w-fit items-center gap-2 rounded-[6px] border px-3 h-8 text-[13px] font-semibold", MEDAL[p.place])}>
        {p.place === "1" ? "🏆" : "●"} {PLACE_LABEL[p.place] ?? `${p.place} место`}
      </span>
      <Link href={`/teams/${encodeURIComponent(p.team.tag)}`} className="group mt-6 flex items-center gap-4 min-w-0">
        <TeamLogo src={p.team.logo_url} tag={p.team.tag} size={big ? 88 : 64} />
        <div className="min-w-0">
          <div className={cn("font-semibold tracking-[-0.015em] break-words group-hover:text-accent-strong", big ? "text-[30px] lg:text-[40px] leading-[1.05]" : "text-[22px] lg:text-[26px]")}>
            {p.team.name}
          </div>
          <div className="num mt-1 text-[13px] text-fg-3">{p.team.tag}</div>
        </div>
      </Link>
      {p.roster.length > 0 && (
        <div className="mt-6 flex flex-wrap gap-x-4 gap-y-2.5 border-t border-white/[0.06] pt-5">
          {p.roster.map((r) => (
            <Link key={r.id} href={`/players/${r.steam_id}`} className="flex items-center gap-2 min-h-8 text-[14px] text-fg-2 hover:text-fg">
              <Avatar src={r.avatar_url} name={r.nickname} size={24} />
              <span className="max-w-[140px] truncate">{r.nickname}</span>
              {r.role !== "main" && <span className="text-[11px] text-fg-3">запас</span>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function MapRecord({ label, h }: { label: string; h: MapHighlight }) {
  const m = h.match;
  return (
    <Link href={`/matches/${m.id}`} className={cn(CARD, "block p-6 hover:border-white/[0.18] transition-colors")}>
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-4 flex items-baseline justify-between gap-4">
        <div className="text-[22px] font-semibold">{mapName(h.map.map_name)}</div>
        <div className="num text-[26px] font-semibold">
          {h.map.team1_score}:{h.map.team2_score}
        </div>
      </div>
      <div className="mt-2 text-[14px] text-fg-3 break-words">
        {m.team1?.name ?? "—"} — {m.team2?.name ?? "—"} · {h.rounds} раундов
      </div>
    </Link>
  );
}

export function RecapView({ recap, solo }: { recap: TournamentRecap; solo?: boolean }) {
  const { placements, championPath, mvp, leaders, longestMap, closestMap, totals } = recap;
  const champion = placements.find((p) => p.place === "1");
  const rest = placements.filter((p) => p.place !== "1");

  if (!champion) {
    return (
      <div className={cn(CARD, "border-dashed p-8 lg:p-10")}>
        <div className="text-[20px] font-semibold">Итоги появятся после финала</div>
        <p className="mt-2 max-w-xl text-fg-3">Когда будет сыгран решающий матч, здесь соберутся призёры, путь чемпиона, MVP и рекорды турнира.</p>
      </div>
    );
  }

  return (
    <div className="space-y-14">
      {/* пьедестал */}
      <section>
        <Eyebrow className="mb-6">Призёры</Eyebrow>
        <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <PlaceCard p={champion} big />
          <div className="grid gap-4">
            {rest.map((p) => (
              <PlaceCard key={`${p.place}-${p.team.id}`} p={p} />
            ))}
          </div>
        </div>
      </section>

      {/* путь чемпиона */}
      {championPath.length > 0 && (
        <section>
          <Eyebrow className="mb-6">Путь чемпиона</Eyebrow>
          <ol className={cn(CARD, "divide-y divide-white/[0.06]")}>
            {championPath.map((s) => (
              <li key={s.matchId}>
                <Link href={`/matches/${s.matchId}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_1fr_auto] items-center gap-x-6 gap-y-1 px-6 py-4 hover:bg-white/[0.02]">
                  <span className="text-[13px] text-fg-3">{s.stage}</span>
                  <span className="order-3 sm:order-none col-span-2 sm:col-span-1 flex items-center gap-3 min-w-0">
                    <span className="text-fg-3 text-[13px]">против</span>
                    {s.opponent && <TeamLogo src={s.opponent.logo_url} tag={s.opponent.tag} size={28} />}
                    <span className="font-medium break-words">{s.opponent?.name ?? "—"}</span>
                  </span>
                  <span className={cn("num text-right text-[18px] font-semibold", s.won ? "text-ok" : "text-danger")}>
                    {s.walkover ? "тех." : s.score}
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </section>
      )}

      {/* MVP */}
      {mvp && (
        <section className={cn(CARD, "p-8 lg:p-10 border-accent/20")}>
          <Eyebrow>MVP турнира</Eyebrow>
          <div className="mt-5 flex flex-wrap items-center gap-x-12 gap-y-6">
            <div className="flex items-center gap-5 min-w-0">
              <Avatar src={mvp.player?.avatar_url} name={mvp.player?.nickname ?? mvp.name} size={72} />
              <div className="min-w-0">
                <div className="text-[32px] lg:text-[40px] font-semibold tracking-[-0.015em] break-words">
                  {mvp.player ? (
                    <Link href={`/players/${mvp.player.steam_id}`} className="hover:text-accent-strong">
                      {mvp.player.nickname}
                    </Link>
                  ) : (
                    mvp.name
                  )}
                </div>
                <div className="text-[14px] text-fg-3">{mvp.team?.name ?? ""}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-x-10 gap-y-4">
              {[
                ...(mvp.swing != null ? [{ l: "Swing", v: fmt.swing(mvp.swing), c: "text-ok" }] : []),
                { l: "F16 Rating", v: fmt.r(mvp.rating) },
                { l: "ADR", v: fmt.d1(mvp.adr) },
                { l: "K/D", v: mvp.kd.toFixed(2) },
                { l: "Карты", v: String(mvp.maps) },
              ].map((x) => (
                <div key={x.l}>
                  <div className={cn("num text-[26px] font-semibold", "c" in x ? x.c : "")}>{x.v}</div>
                  <div className="mt-1 text-[12px] text-fg-3">{x.l}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* лидеры */}
      {leaders.length > 0 && (
        <section>
          <Eyebrow className="mb-6">Лидеры турнира</Eyebrow>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {leaders.map((l) => (
              <div key={l.key} className={cn(CARD, "p-6")}>
                <div className="text-[13px] text-fg-3">{l.label}</div>
                <div className="num mt-3 text-[30px] font-semibold tracking-[-0.01em]">{l.value}</div>
                <div className="mt-4 flex items-center gap-3 min-w-0">
                  <Avatar src={l.player?.avatar_url} name={l.name} size={32} />
                  <div className="min-w-0">
                    {l.player ? (
                      <Link href={`/players/${l.player.steam_id}`} className="block truncate font-medium hover:text-accent-strong">
                        {l.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">{l.name}</span>
                    )}
                    <div className="truncate text-[12px] text-fg-3">{l.team?.name ?? ""}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* карты-рекорды */}
      {(longestMap || closestMap) && (
        <section>
          <Eyebrow className="mb-6">Карты турнира</Eyebrow>
          <div className="grid gap-4 md:grid-cols-2">
            {longestMap && <MapRecord label="Самая длинная карта" h={longestMap} />}
            {closestMap && <MapRecord label="Самая напряжённая карта" h={closestMap} />}
          </div>
        </section>
      )}

      {/* цифры */}
      <section>
        <Eyebrow className="mb-6">Турнир в цифрах</Eyebrow>
        <div className={cn(CARD, "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 divide-white/[0.06]")}>
          {[
            { l: solo ? "Участников" : "Команд", v: totals.teams },
            { l: "Игроков", v: totals.players || "—" },
            { l: "Матчей", v: totals.matches },
            { l: "Карт", v: totals.maps },
            { l: "Раундов", v: totals.rounds },
            { l: "Убийств", v: totals.kills || "—" },
          ].map((x) => (
            <div key={x.l} className="p-6 border-white/[0.06] [&:not(:first-child)]:border-l max-sm:[&:nth-child(odd)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
              <div className="num text-[30px] font-semibold">{x.v}</div>
              <div className="mt-1 text-[13px] text-fg-3">{x.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
