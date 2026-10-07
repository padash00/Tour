import Link from "next/link";
import { SocialDownloads } from "@/components/social-downloads";
import { mapName } from "@/lib/format";
import type { MapHighlight, Placement, TournamentRecap } from "@/lib/recap";
import { fmt } from "@/components/stats-format";
import { Avatar, Eyebrow, TeamLogo, cn } from "@/components/ds";

const CARD = "rounded-surface border border-line-subtle bg-surface";

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

/** одиночный участник (1×1): «команда» — это сам игрок */
const isSoloPlacement = (p: Placement) => !!p.team.is_solo || (p.roster.length === 1 && p.roster[0].nickname === p.team.name);

/**
 * Карточка пьедестала: компактная, высота по содержимому. 1 место — крупнее и с золотым свечением,
 * вместо пустоты — итог на турнире (серии, карты) и отметка MVP.
 */
function PlaceCard({ p, big, mvpName }: { p: Placement; big?: boolean; mvpName?: string | null }) {
  const solo = isSoloPlacement(p);
  const player = solo ? p.roster[0] : null;
  const href = player ? `/players/${player.steam_id}` : `/teams/${encodeURIComponent(p.team.tag)}`;
  const size = big ? ("xl" as const) : ("lg" as const);
  const r = p.record;
  return (
    <div
      className={cn(
        CARD,
        "relative flex flex-col items-center overflow-hidden px-5 text-center transition-transform duration-300 hover:-translate-y-0.5",
        big ? "pt-8 pb-7 border-[#e8c27a]/35 shadow-[0_0_80px_-28px_rgba(232,194,122,0.55)]" : "pt-6 pb-6",
      )}
    >
      {big && <span aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-[#e8c27a]/[0.10] to-transparent" />}
      <span className={cn("relative inline-flex items-center gap-1.5 rounded-[6px] border px-2.5 h-7 text-[12px] font-semibold", MEDAL[p.place])}>
        {p.place === "1" ? "🏆" : p.place === "2" ? "🥈" : "🥉"} {PLACE_LABEL[p.place] ?? `${p.place} место`}
      </span>
      <Link href={href} className="group relative mt-5 flex flex-col items-center gap-3 min-w-0 max-w-full">
        <span className={cn("rounded-full p-[3px]", big ? "bg-[#e8c27a]/40" : p.place === "2" ? "bg-[#c9d3e0]/25" : "bg-[#d39a6a]/30")}>
          {player ? (
            <Avatar src={player.avatar_url} name={player.nickname} size={size} />
          ) : (
            <TeamLogo src={p.team.logo_url} tag={p.team.tag} size={size} />
          )}
        </span>
        <span className={cn("max-w-full break-words font-semibold tracking-[-0.015em] group-hover:text-accent-strong", big ? "text-[24px] lg:text-[28px] leading-[1.1]" : "text-[18px] lg:text-[20px]")}>
          {p.team.name}
        </span>
      </Link>
      <div className="relative mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] text-fg-3">
        <span>
          серии <span className="num text-fg-2">{r.wins}–{r.losses}</span>
        </span>
        <span aria-hidden>·</span>
        <span>
          карты <span className="num text-fg-2">{r.mapWins}–{r.mapLosses}</span>
        </span>
        {mvpName && (
          <span className="rounded-[5px] border border-accent/30 bg-accent/[0.08] px-1.5 text-[11px] font-semibold text-accent">MVP {solo ? "" : mvpName}</span>
        )}
      </div>
      {!solo && p.roster.length > 0 && (
        <div className="relative mt-4 flex flex-wrap justify-center gap-1.5 border-t border-line-subtle pt-4">
          {p.roster.map((m) => (
            <Link key={m.id} href={`/players/${m.steam_id}`} title={m.nickname} className="flex items-center gap-1.5 rounded-full bg-white/[0.04] py-0.5 pl-0.5 pr-2.5 text-[12px] text-fg-2 hover:text-fg">
              <Avatar src={m.avatar_url} name={m.nickname} size="xs" />
              <span className="max-w-[110px] truncate">{m.nickname}</span>
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
    <Link href={`/matches/${m.id}`} className={cn(CARD, "block p-6 hover:border-line-strong transition-colors")}>
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

/** Кнопки «Скачать картинку итогов» — PNG для ленты и для мессенджеров */
export function RecapView({ recap, solo, imageBase }: { recap: TournamentRecap; solo?: boolean; imageBase?: string }) {
  const { placements, nominations, championPath, mvp, leaders, longestMap, closestMap, totals } = recap;
  const champion = placements.find((p) => p.place === "1");
  // на пьедестале — места 1–3; 4-е (проигравший матча за 3-е место) — строкой под ним
  const rest = placements.filter((p) => p.place !== "1" && p.place !== "4");
  const fourth = placements.find((p) => p.place === "4");

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
      {imageBase && <SocialDownloads base={imageBase} title="Картинка итогов" text="Пьедестал, MVP и лидеры — для поста, сторис или превью ссылки." />}
      {/* пьедестал */}
      <section>
        <Eyebrow className="mb-6">Призёры</Eyebrow>
        {/* пьедестал: на десктопе 2 · 1 · 3 по нижнему краю, на телефоне — по порядку мест */}
        <div className={cn("grid items-end gap-4", rest.length >= 3 ? "md:grid-cols-4" : rest.length === 2 ? "md:grid-cols-[1fr_1.18fr_1fr]" : "md:grid-cols-[1.18fr_1fr]")}>
          {[champion, ...rest].map((p) => {
            const second = p.place === "2";
            const first = p.place === "1";
            const mvpHere = mvp?.team_id === p.team.id ? (mvp.player?.nickname ?? mvp.name) : null;
            return (
              <div
                key={`${p.place}-${p.team.id}`}
                className={cn(rest.length >= 2 && (first ? "md:order-2" : second ? "md:order-1" : "md:order-3"))}
              >
                <PlaceCard p={p} big={first} mvpName={mvpHere} />
              </div>
            );
          })}
        </div>
      </section>

      {fourth && (
        <p className="-mt-10 text-[14px] text-fg-3">
          4 место — <span className="text-fg-2">{fourth.team.name}</span> (проиграли матч за 3-е место)
        </p>
      )}

      {/* номинации: решение судей или кандидат по статистике */}
      {nominations.length > 0 && (
        <section>
          <Eyebrow className="mb-6">Номинации</Eyebrow>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {nominations.map((n) => (
              <div key={n.key} className={cn(CARD, "p-6")}>
                <div className="text-[13px] text-fg-3">{n.title}</div>
                <div className="mt-3 flex items-center gap-3 min-w-0">
                  {n.team && <TeamLogo src={n.team.logo_url} tag={n.team.tag} size="sm" />}
                  <div className="min-w-0">
                    <div className="truncate text-[18px] font-semibold">{n.name}</div>
                    <div className="truncate text-[12px] text-fg-3">{n.team && n.team.name !== n.name ? n.team.name : ""}</div>
                  </div>
                </div>
                <div className="mt-3 text-[12px] text-fg-3">{n.source === "judges" ? `решение судей${n.value ? ` · ${n.value}` : ""}` : n.value}</div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* путь чемпиона */}
      {championPath.length > 0 && (
        <section>
          <Eyebrow className="mb-6">Путь чемпиона</Eyebrow>
          <ol className={cn(CARD, "divide-y divide-white/[0.06]")}>
            {championPath.map((s) => (
              <li key={s.matchId}>
                <Link href={`/matches/${s.matchId}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[220px_1fr_auto] items-center gap-x-6 gap-y-1 px-6 py-4 hover:bg-surface-2">
                  <span className="text-[13px] text-fg-3">{s.stage}</span>
                  <span className="order-3 sm:order-none col-span-2 sm:col-span-1 flex items-center gap-3 min-w-0">
                    <span className="text-fg-3 text-[13px]">против</span>
                    {s.opponent && <TeamLogo src={s.opponent.logo_url} tag={s.opponent.tag} size="xs" />}
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
              <Avatar src={mvp.player?.avatar_url} name={mvp.player?.nickname ?? mvp.name} size="lg" />
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
                <div className="text-[14px] text-fg-3">{mvp.team && mvp.team.name !== (mvp.player?.nickname ?? mvp.name) ? mvp.team.name : ""}</div>
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
                  <Avatar src={l.player?.avatar_url} name={l.name} size="sm" />
                  <div className="min-w-0">
                    {l.player ? (
                      <Link href={`/players/${l.player.steam_id}`} className="block truncate font-medium hover:text-accent-strong">
                        {l.name}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium">{l.name}</span>
                    )}
                    <div className="truncate text-[12px] text-fg-3">{l.team && l.team.name !== l.name ? l.team.name : ""}</div>
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
            <div key={x.l} className="p-6 border-line-subtle [&:not(:first-child)]:border-l max-sm:[&:nth-child(odd)]:border-l-0 max-sm:[&:nth-child(n+3)]:border-t">
              <div className="num text-[30px] font-semibold">{x.v}</div>
              <div className="mt-1 text-[13px] text-fg-3">{x.l}</div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
