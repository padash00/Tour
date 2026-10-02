/* eslint-disable @next/next/no-img-element -- картинка рисуется next/og (satori), не браузером */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { roundTitle } from "@/lib/bracket";
import { formatDate, mapName } from "@/lib/format";
import { getMatch, getMatchRosters } from "@/lib/matches";
import { ogFonts } from "@/lib/og-font";
import { OG_FORMATS, ogFormat, ogImage } from "@/lib/og-image";
import { getMapImages } from "@/lib/settings";
import { aggregatePlayers, getStatRows, type PlayerAgg } from "@/lib/stats";
import { db } from "@/lib/supabase";

/**
 * Итог матча картинкой для соцсетей: счёт серии, карты с обложками и счётом, MVP и лучшие игроки.
 *   /matches/<id>/image            — пост Instagram 1080×1350
 *   /matches/<id>/image?f=story    — сторис 1080×1920
 *   /matches/<id>/image?f=wide     — 1200×630 (превью ссылки в WhatsApp/Telegram)
 *   &download=1 — отдать файлом. Только сыгранный матч, иначе 404.
 */

const GOLD = "#e8c27a";
const ACCENT = "#8ab8ff";
const MUTED = "#8a97ab";

type Side = { id: string | null; name: string; pic: string | null; tag: string };

function Pic({ s, size, win }: { s: Side; size: number; win: boolean }) {
  return (
    <div style={{ display: "flex", padding: 5, borderRadius: size, background: win ? `${GOLD}88` : "rgba(255,255,255,0.12)" }}>
      {s.pic ? (
        <img src={s.pic} alt="" width={size} height={size} style={{ borderRadius: size, objectFit: "cover" }} />
      ) : (
        <div
          style={{
            display: "flex",
            width: size,
            height: size,
            borderRadius: size,
            alignItems: "center",
            justifyContent: "center",
            background: "#16223a",
            color: "#c9d3e0",
            fontSize: size * 0.32,
            fontWeight: 700,
          }}
        >
          {(s.tag || s.name).slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );
}

/** длинное имя одним словом satori не переносит — уменьшаем шрифт */
const fit = (name: string, base: number, max = 14) => (name.length > max ? Math.max(Math.round(base * 0.55), Math.round((base * max) / name.length)) : base);

export async function GET(req: NextRequest, ctx: RouteContext<"/matches/[id]/image">) {
  const { id } = await ctx.params;
  const m = await getMatch(id);
  if (!m || m.status !== "finished" || m.tournament.status === "draft" || !m.team1 || !m.team2) {
    return new Response("Матч ещё не сыгран", { status: 404 });
  }
  const f = ogFormat(req.nextUrl.searchParams.get("f"));
  const size = OG_FORMATS[f];
  const wide = f === "wide";
  const story = f === "story";

  const [rosters, rows, mapImages, fonts, { data: all }] = await Promise.all([
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
    getMapImages(),
    ogFonts(),
    db().from("matches").select("bracket, round").eq("tournament_id", m.tournament_id),
  ]);

  // 1×1: «команда» — сам игрок, показываем его аватар
  const side = (team: NonNullable<typeof m.team1>, list: typeof rosters.team1): Side => {
    const solo = !!team.is_solo || (list.length === 1 && list[0].player.nickname === team.name);
    return { id: team.id, name: team.name, tag: team.tag, pic: solo ? (list[0]?.player.avatar_url ?? team.logo_url) : team.logo_url };
  };
  const [pic1, pic2] = await Promise.all([side(m.team1, rosters.team1), side(m.team2, rosters.team2)].map((s) => ogImage(s.pic, 320)));
  const t1 = { ...side(m.team1, rosters.team1), pic: pic1 };
  const t2 = { ...side(m.team2, rosters.team2), pic: pic2 };
  const w1 = m.winner_id === m.team1_id;

  const maps = m.maps.filter((x) => x.status === "finished").sort((a, b) => a.map_number - b.map_number);
  const covers = await Promise.all(maps.map((x) => ogImage(mapImages[x.map_name.split("@")[0]] ?? null, wide ? 600 : 1080)));

  const players = aggregatePlayers(rows).sort((a, b) => b.rating - a.rating);
  const mvp = players[0] ?? null;
  const mvpPic = mvp ? await ogImage([...rosters.team1, ...rosters.team2].find((r) => r.player.steam_id === mvp.steam_id)?.player.avatar_url, 200) : null;
  const best = (teamId: string | null) => players.filter((p) => p.team_id === teamId).sort((a, b) => b.rating - a.rating)[0] ?? null;
  const solo = rosters.team1.length <= 1 && rosters.team2.length <= 1;

  const rounds = all ?? [];
  const totalUpper = Math.max(0, ...rounds.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...rounds.filter((x) => x.bracket === "lower").map((x) => x.round));
  const stage =
    m.bracket === "group"
      ? `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`
      : m.bracket === "swiss"
        ? `Швейцарка · раунд ${m.round}`
        : roundTitle(m.bracket, m.round, totalUpper, totalLower);
  const meta = [stage, `BO${m.best_of}`, m.finished_at ? formatDate(m.finished_at) : null].filter(Boolean).join(" · ");
  const logo = new URL("/brand/f16-arena-horizontal.svg", req.nextUrl.origin).toString();
  const pick = (teamId: string | null) => (teamId === m.team1_id ? m.team1!.tag : teamId === m.team2_id ? m.team2!.tag : null);

  // ── блоки
  const header = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <img src={logo} alt="" width={Math.round((wide ? 40 : 56) * 2.646)} height={wide ? 40 : 56} />
        <div style={{ display: "flex", fontSize: wide ? 16 : 22, letterSpacing: 6, color: "#7f93b0" }}>ИТОГ МАТЧА</div>
      </div>
      <div style={{ display: "flex", marginTop: wide ? 16 : story ? 56 : 36, fontSize: wide ? 30 : story ? 52 : 44, fontWeight: 700, lineHeight: 1.1 }}>
        {m.tournament.name}
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: wide ? 18 : 26, color: MUTED }}>{meta}</div>
    </div>
  );

  const picSize = wide ? 104 : story ? 230 : 168;
  const nameSize = wide ? 26 : story ? 40 : 34;
  const scoreSize = wide ? 96 : story ? 220 : 160;
  const sideBlock = (s: Side, win: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: wide ? 230 : 330 }}>
      <Pic s={s} size={picSize} win={win} />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 18,
          fontSize: fit(s.name, nameSize),
          fontWeight: 700,
          textAlign: "center",
          width: wide ? 230 : 330,
          wordBreak: "break-all",
          color: win ? "#ffffff" : "#aab5c6",
        }}
      >
        {s.name}
      </div>
      <div style={{ display: "flex", marginTop: 8, fontSize: wide ? 16 : 22, letterSpacing: 4, color: win ? GOLD : "#5d6b80", fontWeight: 700 }}>
        {win ? "ПОБЕДА" : " "}
      </div>
    </div>
  );
  const scoreboard = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: wide ? 22 : story ? 150 : 64 }}>
      {sideBlock(t1, w1)}
      <div style={{ display: "flex", alignItems: "center", fontSize: scoreSize, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
        <span style={{ color: w1 ? "#ffffff" : "#6b788c" }}>{m.team1_score}</span>
        <span style={{ color: "#3c4a5e", margin: "0 18px", fontSize: scoreSize * 0.7 }}>:</span>
        <span style={{ color: w1 ? "#6b788c" : "#ffffff" }}>{m.team2_score}</span>
      </div>
      {sideBlock(t2, !w1)}
    </div>
  );

  const mapH = wide ? 74 : story ? 170 : 112;
  const mapRows = (
    <div style={{ display: "flex", flexDirection: "column", gap: wide ? 10 : story ? 22 : 16, marginTop: wide ? 0 : story ? 130 : 56 }}>
      {maps.map((x, i) => {
        const win1 = x.team1_score > x.team2_score;
        const by = x.picked_by ? pick(x.picked_by) : null;
        return (
          <div
            key={x.id}
            style={{
              display: "flex",
              position: "relative",
              height: mapH,
              borderRadius: 20,
              overflow: "hidden",
              border: "1px solid rgba(255,255,255,0.10)",
              background: "#141c2a",
            }}
          >
            {covers[i] && (
              <img src={covers[i]!} alt="" width={wide ? 560 : 936} height={mapH} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: mapH, objectFit: "cover" }} />
            )}
            <div
              style={{
                display: "flex",
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                height: mapH,
                background: "linear-gradient(90deg, rgba(7,11,18,0.92) 0%, rgba(7,11,18,0.62) 55%, rgba(7,11,18,0.85) 100%)",
              }}
            />
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", padding: wide ? "0 22px" : "0 34px" }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: wide ? 13 : story ? 22 : 18, color: "#9fb0c8", letterSpacing: 2 }}>
                  {`КАРТА ${x.map_number}${by ? ` · ПИК ${by}` : " · DECIDER"}`}
                </div>
                <div style={{ display: "flex", marginTop: 4, fontSize: wide ? 26 : story ? 50 : 40, fontWeight: 700 }}>{mapName(x.map_name)}</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", fontSize: wide ? 34 : story ? 64 : 52, fontWeight: 700 }}>
                <span style={{ color: win1 ? "#ffffff" : "#6b788c" }}>{x.team1_score}</span>
                <span style={{ color: "#4a576b", margin: "0 10px" }}>:</span>
                <span style={{ color: win1 ? "#6b788c" : "#ffffff" }}>{x.team2_score}</span>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  const stat = (l: string, v: string) => (
    <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
      <div style={{ display: "flex", fontSize: story ? 56 : 36, fontWeight: 700 }}>{v}</div>
      <div style={{ display: "flex", fontSize: story ? 22 : 17, color: MUTED }}>{l}</div>
    </div>
  );
  const mvpCard = mvp && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        marginTop: story ? 110 : 40,
        padding: story ? "36px 40px" : "24px 30px",
        flexWrap: story ? "wrap" : "nowrap",
        borderRadius: 24,
        background: "linear-gradient(90deg, rgba(138,184,255,0.16), rgba(138,184,255,0.03))",
        border: "1px solid rgba(138,184,255,0.3)",
      }}
    >
      {mvpPic && <img src={mvpPic} alt="" width={story ? 104 : 84} height={story ? 104 : 84} style={{ borderRadius: 104, marginRight: 24 }} />}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", fontSize: story ? 24 : 19, color: ACCENT, letterSpacing: 4 }}>MVP МАТЧА</div>
        <div style={{ display: "flex", marginTop: 4, fontSize: fit(mvp.name, story ? 48 : 34, story ? 22 : 13), fontWeight: 700 }}>{mvp.name}</div>
      </div>
      <div
        style={{
          display: "flex",
          gap: story ? 0 : 28,
          ...(story ? { width: "100%", justifyContent: "space-between", marginTop: 28, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)" } : {}),
        }}
      >
        {stat("Rating", mvp.rating.toFixed(2))}
        {stat("ADR", mvp.adr.toFixed(1))}
        {stat("K–D", `${mvp.kills}–${mvp.deaths}`)}
      </div>
    </div>
  );

  // лучшие с каждой стороны — в командных матчах (в дуэли это те же двое)
  const bestTile = (p: PlayerAgg | null, team: string) =>
    p && (
      <div
        key={team}
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "22px 26px",
          borderRadius: 20,
          background: "rgba(14,24,40,0.85)",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      >
        <div style={{ display: "flex", fontSize: 18, color: MUTED }}>{`Лучший в ${team}`}</div>
        <div style={{ display: "flex", marginTop: 6, fontSize: fit(p.name, 32, 14), fontWeight: 700 }}>{p.name}</div>
        <div style={{ display: "flex", marginTop: 6, fontSize: 20, color: "#c9d3e0" }}>{`${p.kills}–${p.deaths} · ADR ${p.adr.toFixed(0)} · ${p.rating.toFixed(2)}`}</div>
      </div>
    );
  const bests = !solo && (best(m.team1_id) || best(m.team2_id)) && (
    <div style={{ display: "flex", gap: 18, marginTop: 18 }}>
      {bestTile(best(m.team1_id), m.team1.name)}
      {bestTile(best(m.team2_id), m.team2.name)}
    </div>
  );

  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", fontSize: wide ? 15 : 22, color: "#5d6b80" }}>
      <span>{`Матч #${m.number}`}</span>
      <span>tournament.f16-arena.kz</span>
    </div>
  );

  const body = wide ? (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {header}
      <div style={{ display: "flex", alignItems: "center", gap: 36, marginTop: 10 }}>
        <div style={{ display: "flex", flexDirection: "column", width: 560 }}>{scoreboard}</div>
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>{mapRows}</div>
      </div>
    </div>
  ) : (
    <div style={{ display: "flex", flexDirection: "column" }}>
      {header}
      {scoreboard}
      {mapRows}
      {mvpCard}
      {bests}
    </div>
  );

  const image = new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: wide ? "40px 56px" : story ? "120px 72px 90px" : "72px 72px 56px",
          background: `radial-gradient(1000px 800px at 50% ${wide ? "40%" : "26%"}, #2a2a2c 0%, #121a28 38%, #070b12 75%)`,
          color: "#f4f7fb",
          ...(fonts.length ? { fontFamily: "Onest" } : {}),
        }}
      >
        {body}
        {footer}
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  if (req.nextUrl.searchParams.get("download")) {
    headers.set("Content-Disposition", `attachment; filename="f16-match-${m.number}-${f}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
