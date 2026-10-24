/* eslint-disable @next/next/no-img-element -- картинка рисуется next/og (satori), не браузером */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import type { ReactNode } from "react";
import { roundTitle } from "@/lib/bracket";
import { formatDate, mapName } from "@/lib/format";
import { getMatch, getMatchRosters } from "@/lib/matches";
import { modeOf } from "@/lib/modes";
import { OG_FONT, ogFonts } from "@/lib/og-font";
import { OG_FORMATS, ogAccess, ogFormat, ogImage } from "@/lib/og-image";
import type { RoundChip, RoundHow } from "@/lib/rounds";
import { getMatchRounds } from "@/lib/rounds-data";
import { getMapImages } from "@/lib/settings";
import { aggregatePlayers, getStatRows, type PlayerAgg } from "@/lib/stats";
import { db } from "@/lib/supabase";

/**
 * Картинки матча для соцсетей — в стиле Telegram-каналов про CS:
 *   /matches/<id>/image                 — «Результат», пост Instagram 1080×1350
 *   /matches/<id>/image?f=story         — «Результат», сторис 1080×1920
 *   /matches/<id>/image?f=wide          — «Результат», 1200×630 (превью ссылки в WhatsApp/Telegram)
 *   /matches/<id>/image?f=stats&map=N   — «Статистика карты» N: составы K A D ADR и история раундов (только админ)
 *   &download=1 — отдать файлом. Только сыгранный матч, иначе 404.
 */

const BG = "#0b0d10";
const LIME = "#c6f432";
const INK = "#0b0d10";
const WHITE = "#ffffff";
const GREY = "#8a8f98";
const DIM = "#4d535c";
/** цвета команд на «Статистике карты» (не стороны CT/T): команда 1 — синяя, команда 2 — оранжевая */
const TEAM_COLOR = { 1: "#6ea8ff", 2: "#f2a33a" } as const;
/** пропорции логотипа f16-arena-horizontal.svg (1414×326) */
const LOGO_RATIO = 1414 / 326;

type Side = { id: string | null; name: string; tag: string; pic: string | null };

/** длинное имя одним словом satori не переносит — уменьшаем шрифт */
const fit = (name: string, base: number, max = 14) => (name.length > max ? Math.max(Math.round(base * 0.55), Math.round((base * max) / name.length)) : base);
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const rgba = (hex: string, a: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/** Логотип команды; без логотипа — тег в квадрате */
function Crest({ s, size, dim }: { s: Side; size: number; dim?: boolean }) {
  return s.pic ? (
    <img src={s.pic} alt="" width={size} height={size} style={{ borderRadius: size * 0.18, objectFit: "cover", opacity: dim ? 0.6 : 1 }} />
  ) : (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        borderRadius: size * 0.18,
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255,255,255,0.07)",
        border: "2px solid rgba(255,255,255,0.18)",
        color: dim ? GREY : WHITE,
        fontSize: Math.round(size * (s.tag.length > 3 ? 0.24 : 0.3)),
        fontWeight: 700,
      }}
    >
      {(s.tag || s.name).slice(0, 4).toUpperCase()}
    </div>
  );
}

/** Значок исхода раунда — простые фигуры SVG (иконки lucide satori не рисует) */
function roundIconSvg(how: RoundHow, color: string) {
  const body =
    how === "bomb"
      ? `<path d="M12 1l2.6 6.1L21 5l-2.1 6.4L23 14l-6.6.9L15 21l-3-5.3L9 21l-1.4-6.1L1 14l4.1-2.6L3 5l6.4 2.1z" fill="${color}"/>`
      : how === "defuse"
        ? `<path d="M4 4l7 8M20 4l-7 8M12 12v9M8 21h8" stroke="${color}" stroke-width="3" fill="none" stroke-linecap="round"/>`
        : how === "time"
          ? `<circle cx="12" cy="13" r="8.5" stroke="${color}" stroke-width="2.6" fill="none"/><path d="M12 8.5v4.5l3 2M9 2h6" stroke="${color}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`
          : // все соперники убиты — череп
            `<path d="M12 2C6.5 2 3 5.8 3 10.5c0 2.9 1.4 4.8 3 5.9V20a1 1 0 0 0 1 1h2v-2h2v2h2v-2h2v2h2a1 1 0 0 0 1-1v-3.6c1.6-1.1 3-3 3-5.9C21 5.8 17.5 2 12 2z" fill="${color}"/><circle cx="8.6" cy="11" r="2.2" fill="${BG}"/><circle cx="15.4" cy="11" r="2.2" fill="${BG}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">${body}</svg>`;
}

/**
 * SVG → PNG data URL нужной ширины: логотип и значки раундов отдаём satori готовой растровой картинкой.
 * (Внутри блока с transform: scale нельзя ставить overflow: hidden — satori обрезает картинки не по тем координатам.)
 */
async function svgPng(svg: string | Buffer, width: number) {
  const sharp = (await import("sharp")).default;
  const out = await sharp(Buffer.from(svg), { density: 300 }).resize({ width }).png().toBuffer();
  return `data:image/png;base64,${out.toString("base64")}`;
}

export async function GET(req: NextRequest, ctx: RouteContext<"/matches/[id]/image">) {
  const { id } = await ctx.params;
  const m = await getMatch(id);
  // серия ещё идёт (BO3 на третьей карте) — картинки по уже сыгранным картам можно скачать сразу
  const seriesLive = m?.status === "live" && m.maps.some((x) => x.status === "finished");
  if (!m || (m.status !== "finished" && !seriesLive) || m.tournament.status === "draft" || !m.team1 || !m.team2) {
    return new Response("Матч ещё не сыгран", { status: 404 });
  }
  const statsMode = req.nextUrl.searchParams.get("f") === "stats";
  // «Статистика карты» — доступ как у поста (только админ, в 2×)
  const f = statsMode ? "post" : ogFormat(req.nextUrl.searchParams.get("f"));
  const access = await ogAccess(req, f);
  if (!access.allowed) return new Response("Скачивание — только для администратора", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const scale = access.scale;

  const [rosters, rows, mapImages, fonts, { data: all }] = await Promise.all([
    getMatchRosters(m),
    getStatRows({ matchId: m.id }),
    getMapImages(),
    ogFonts(),
    db().from("matches").select("bracket, round").eq("tournament_id", m.tournament_id),
  ]);

  // 1×1: «команда» — сам игрок, показываем его аватар
  const side = (team: NonNullable<typeof m.team1>, list: typeof rosters.team1) => {
    const solo = !!team.is_solo || (list.length === 1 && list[0].player.nickname === team.name);
    return { id: team.id, name: team.name, tag: team.tag, src: solo ? (list[0]?.player.avatar_url ?? team.logo_url) : team.logo_url };
  };
  const s1 = side(m.team1, rosters.team1);
  const s2 = side(m.team2, rosters.team2);
  const [pic1, pic2] = await Promise.all([ogImage(s1.src, 320 * scale, 90), ogImage(s2.src, 320 * scale, 90)]);
  const t1: Side = { id: s1.id, name: s1.name, tag: s1.tag, pic: pic1 };
  const t2: Side = { id: s2.id, name: s2.name, tag: s2.tag, pic: pic2 };
  const w1 = m.winner_id === m.team1_id;
  // во время серии победителя нет — обе команды яркие
  const bright1 = seriesLive || w1;
  const bright2 = seriesLive || !w1;

  const maps = m.maps.filter((x) => x.status === "finished").sort((a, b) => a.map_number - b.map_number);
  const rounds = all ?? [];
  const totalUpper = Math.max(0, ...rounds.filter((x) => x.bracket === "upper").map((x) => x.round));
  const totalLower = Math.max(0, ...rounds.filter((x) => x.bracket === "lower").map((x) => x.round));
  const stage =
    m.bracket === "group"
      ? `${m.group_label ? `Группа ${m.group_label} · ` : ""}тур ${m.round}`
      : m.bracket === "swiss"
        ? `Швейцарка · раунд ${m.round}`
        : roundTitle(m.bracket, m.round, totalUpper, totalLower);
  const tagOf = (teamId: string | null) => (teamId === m.team1_id ? m.team1!.tag : teamId === m.team2_id ? m.team2!.tag : null);
  // логотип для тёмного фона
  const logo = await svgPng(await readFile(join(process.cwd(), "public/brand/f16-arena-horizontal.svg")), 240 * scale);
  const cover = (map: string | undefined) => (map ? (mapImages[map.split("@")[0]] ?? null) : null);

  const finish = (body: ReactNode, w: number, h: number, name: string) => {
    const image = new ImageResponse(
      (
        <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
          <div
            style={{
              width: w,
              height: h,
              display: "flex",
              flexDirection: "column",
              position: "relative",
              background: BG,
              color: WHITE,
              // satori масштабирует от центра: сдвигаем блок, чтобы после увеличения он ровно лёг на холст
              ...(scale !== 1 ? { position: "absolute", left: (w * (scale - 1)) / 2, top: (h * (scale - 1)) / 2, transform: `scale(${scale})` } : {}),
              ...(fonts.length ? { fontFamily: OG_FONT } : {}),
            }}
          >
            {body}
          </div>
        </div>
      ),
      { width: w * scale, height: h * scale, ...(fonts.length ? { fonts } : {}) },
    );
    const headers = new Headers(image.headers);
    // админские картинки не должны оседать в общем кэше CDN
    headers.set("Cache-Control", access.private || seriesLive ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
    if (req.nextUrl.searchParams.get("download")) headers.set("Content-Disposition", `attachment; filename="${name}"`);
    return new Response(image.body, { status: 200, headers });
  };

  /** фон: обложка карты (заранее обрезана под холст — objectFit satori не применяет), сильно затемнённая */
  const backdrop = (src: string | null, w: number, h: number, shade: string) => (
    <>
      <div
        style={{
          display: "flex",
          position: "absolute",
          left: 0,
          top: 0,
          width: w,
          height: h,
          backgroundColor: BG,
          backgroundImage: src ? `${shade}, url(${src})` : shade,
          backgroundSize: "100% 100%",
        }}
      />
    </>
  );

  // ─────────────────────────────── «Статистика карты»
  if (statsMode) {
    const want = Number(req.nextUrl.searchParams.get("map"));
    const map = maps.find((x) => x.map_number === want) ?? maps[0];
    if (!map) return new Response("Карта не сыграна", { status: 404 });
    const mapRounds = await getMatchRounds(
      m.id,
      { team1: rosters.team1.map((r) => r.player.steam_id), team2: rosters.team2.map((r) => r.player.steam_id) },
      modeOf(m.tournament.format).size,
      [map.map_number],
    );
    // лишние записи после конца карты (сервер дописал раунд после матча) не показываем
    const chips: RoundChip[] = (mapRounds[0]?.rounds ?? []).slice(0, map.team1_score + map.team2_score);
    const players = aggregatePlayers(rows.filter((r) => r.map_number === map.map_number));
    const teamPlayers = (teamId: string | null) => players.filter((p) => p.team_id === teamId).sort((a, b) => b.rating - a.rating || b.kills - a.kills);
    const list1 = teamPlayers(m.team1_id);
    const list2 = teamPlayers(m.team2_id);
    const by = map.picked_by ? tagOf(map.picked_by) : null;
    const byColor = map.picked_by === m.team1_id ? TEAM_COLOR[1] : TEAM_COLOR[2];

    const W = 1200;
    const PAD = 32;
    const ROW = 48;
    const BAR = 58;
    const histH = chips.length ? 104 : 18;
    const block = (n: number) => BAR + Math.max(n, 1) * (ROW + 4);
    const H = PAD + 70 + 16 + block(list1.length) + histH + block(list2.length) + 60 + PAD;
    const bg = await ogImage(cover(map.map_name), W * scale, 80, H * scale);
    const cols = [
      { k: "K", w: 76 },
      { k: "A", w: 76 },
      { k: "D", w: 76 },
      { k: "ADR", w: 100 },
      { k: "Rating", w: 110 },
    ];
    const vals = (p: PlayerAgg) => [String(p.kills), String(p.assists), String(p.deaths), p.adr.toFixed(1), p.rating.toFixed(2)];
    const ratingColor = (r: number) => (r >= 1.1 ? "#a6e86c" : r < 0.9 ? "#ff7a7a" : WHITE);

    const teamBlock = (s: Side, list: PlayerAgg[], n: 1 | 2) => {
      const c = TEAM_COLOR[n];
      return (
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: BAR,
              padding: "0 24px 0 12px",
              background: `linear-gradient(90deg, ${rgba(c, 0.9)} 0%, ${rgba(c, 0.5)} 100%)`,
              borderRadius: 10,
              color: INK,
            }}
          >
            <Crest s={s} size={38} />
            <div style={{ display: "flex", flex: 1, marginLeft: 14, fontSize: 26, fontWeight: 700 }}>{cut(s.name, 30)}</div>
            {cols.map((col) => (
              <div key={col.k} style={{ display: "flex", width: col.w, justifyContent: "flex-end", fontSize: 20, fontWeight: 700 }}>
                {col.k}
              </div>
            ))}
          </div>
          {list.map((p, i) => (
            <div
              key={p.steam_id}
              style={{
                display: "flex",
                alignItems: "center",
                height: ROW,
                marginTop: 4,
                padding: "0 24px",
                borderRadius: 8,
                background: rgba(c, i % 2 ? 0.12 : 0.19),
                fontSize: 23,
              }}
            >
              <div style={{ display: "flex", flex: 1, fontWeight: 700 }}>{cut(p.name, 28)}</div>
              {vals(p).map((v, j) => (
                <div key={j} style={{ display: "flex", width: cols[j].w, justifyContent: "flex-end", color: j === 4 ? ratingColor(p.rating) : WHITE, fontWeight: j === 4 ? 700 : 400 }}>
                  {v}
                </div>
              ))}
            </div>
          ))}
        </div>
      );
    };

    // история раундов: строка команды 1 сверху, команды 2 снизу; значок — в строке победителя раунда
    const switches = chips.filter((c, i) => i > 0 && c.switched).length;
    const cellW = chips.length ? Math.min(40, Math.floor((W - PAD * 2 - 8 - switches * 16) / chips.length)) : 0;
    const iconSize = Math.max(12, Math.min(26, cellW - 8));
    const hows = [...new Set(chips.map((c) => c.how))];
    const icons: Record<string, string> = Object.fromEntries(
      await Promise.all(
        hows.flatMap((how) => ([1, 2] as const).map(async (n) => [`${how}${n}`, await svgPng(roundIconSvg(how, TEAM_COLOR[n]), iconSize * scale)] as const)),
      ),
    );
    const history =
      chips.length > 0 ? (
        <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", height: histH, padding: "0 4px" }}>
          {([1, 2] as const).map((n) => (
            <div key={n} style={{ display: "flex", alignItems: "center", height: 40 }}>
              {chips.map((c, i) => (
                <div key={c.n} style={{ display: "flex", alignItems: "center" }}>
                  {i > 0 && c.switched && <div style={{ display: "flex", width: 2, height: 34, margin: "0 7px", background: "rgba(255,255,255,0.28)" }} />}
                  <div style={{ display: "flex", width: cellW, height: 34, alignItems: "center", justifyContent: "center" }}>
                    {c.winner === n ? (
                      <img src={icons[`${c.how}${n}`]} alt="" width={iconSize} height={iconSize} />
                    ) : (
                      <div style={{ display: "flex", width: 4, height: 4, borderRadius: 4, background: "rgba(255,255,255,0.16)" }} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", height: histH }} />
      );

    const body = (
      <>
        {backdrop(bg, W, H, "linear-gradient(180deg, rgba(11,13,16,0.84) 0%, rgba(11,13,16,0.9) 100%)")}
        <div style={{ display: "flex", flexDirection: "column", position: "relative", width: W, height: H, padding: PAD }}>
          <div style={{ display: "flex", alignItems: "center", height: 70 }}>
            <div style={{ display: "flex", flex: 1, alignItems: "center", fontSize: 26 }}>
              <span style={{ color: GREY }}>{`R: ${map.team1_score + map.team2_score}`}</span>
              <span style={{ color: DIM, margin: "0 12px" }}>·</span>
              <span style={{ fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>{mapName(map.map_name)}</span>
              <span style={{ color: DIM, margin: "0 12px" }}>·</span>
              <span style={{ fontWeight: 700, color: by ? byColor : GREY }}>{by ? `пик ${by}` : "decider"}</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", fontSize: 60, fontWeight: 700, letterSpacing: -1, lineHeight: 1 }}>
              <span style={{ color: TEAM_COLOR[1] }}>{map.team1_score}</span>
              <span style={{ color: WHITE, margin: "0 12px" }}>:</span>
              <span style={{ color: TEAM_COLOR[2] }}>{map.team2_score}</span>
            </div>
            <div style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>
              <img src={logo} alt="" width={Math.round(34 * LOGO_RATIO)} height={34} />
            </div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", marginTop: 16 }}>
            {teamBlock(t1, list1, 1)}
            {history}
            {teamBlock(t2, list2, 2)}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flex: 1, fontSize: 19, color: GREY }}>
            <span>{cut(`${m.tournament.name} · ${stage} · карта ${map.map_number} из ${m.best_of}`, 70)}</span>
            <span>tournament.f16-arena.kz</span>
          </div>
        </div>
      </>
    );
    return finish(body, W, H, `f16-match-${m.number}-map${map.map_number}-stats.png`);
  }

  // ─────────────────────────────── «Результат»
  const size = OG_FORMATS[f];
  const wide = f === "wide";
  const story = f === "story";
  const W = size.width;
  const H = size.height;
  const PAD = wide ? 40 : 60;

  const tileH = wide ? 92 : story ? 210 : 172;
  const tileGap = 14;
  const tileW = Math.floor((W - PAD * 2 - (Math.max(1, maps.length) - 1) * tileGap) / Math.max(1, maps.length));
  const [bg, ...covers] = await Promise.all([
    ogImage(cover(maps.at(-1)?.map_name), W * scale, 72, H * scale),
    ...maps.map((x) => ogImage(cover(x.map_name), tileW * scale, 82, tileH * scale)),
  ]);

  const players = aggregatePlayers(rows).sort((a, b) => b.rating - a.rating);
  const mvp = players[0] ?? null;
  const mvpTeam = mvp ? (mvp.team_id === m.team1_id ? m.team1 : mvp.team_id === m.team2_id ? m.team2 : null) : null;
  const mvpPic = mvp ? await ogImage([...rosters.team1, ...rosters.team2].find((r) => r.player.steam_id === mvp.steam_id)?.player.avatar_url, 200 * scale, 90) : null;

  const crest = wide ? 120 : story ? 240 : 196;
  const scoreFs = wide ? 124 : story ? 240 : 196;
  const nameFs = wide ? 24 : story ? 40 : 34;
  const colW = wide ? 300 : story ? 330 : 300;

  const top = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <img src={logo} alt="" width={Math.round((wide ? 32 : 46) * LOGO_RATIO)} height={wide ? 32 : 46} />
      <div
        style={{
          display: "flex",
          padding: wide ? "6px 14px" : "10px 20px",
          border: "2px solid rgba(255,255,255,0.3)",
          borderRadius: 8,
          fontSize: wide ? 15 : 22,
          fontWeight: 700,
          letterSpacing: 4,
        }}
      >
        {seriesLive ? "СЧЁТ СЕРИИ" : "РЕЗУЛЬТАТ"}
      </div>
    </div>
  );

  const plate = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: wide ? 16 : story ? 70 : 40 }}>
      <div
        style={{
          display: "flex",
          padding: wide ? "8px 24px" : "14px 36px",
          background: LIME,
          color: INK,
          fontSize: fit(m.tournament.name, wide ? 26 : story ? 46 : 40, 26),
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {m.tournament.name}
      </div>
      <div style={{ display: "flex", marginTop: wide ? 8 : 18, fontSize: wide ? 16 : 24, color: GREY, letterSpacing: 4, textTransform: "uppercase" }}>
        {[stage, m.finished_at ? formatDate(m.finished_at) : null].filter(Boolean).join(" · ")}
      </div>
    </div>
  );

  const teamCol = (s: Side, win: boolean) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: colW }}>
      <Crest s={s} size={crest} dim={!win} />
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: wide ? 10 : 22,
          width: colW,
          textAlign: "center",
          fontSize: fit(s.name, nameFs, 15),
          fontWeight: 700,
          color: win ? WHITE : GREY,
          textTransform: "uppercase",
        }}
      >
        {s.name}
      </div>
    </div>
  );

  const scoreRow = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: wide ? 14 : 0 }}>
      {teamCol(t1, bright1)}
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
        <div style={{ display: "flex", alignItems: "center", fontSize: scoreFs, fontWeight: 700, lineHeight: 1, letterSpacing: -4 }}>
          <span style={{ color: bright1 ? WHITE : DIM }}>{m.team1_score}</span>
          <span style={{ color: DIM, margin: wide ? "0 12px" : "0 24px", fontSize: scoreFs * 0.55 }}>–</span>
          <span style={{ color: bright2 ? WHITE : DIM }}>{m.team2_score}</span>
        </div>
        <div style={{ display: "flex", marginTop: wide ? 8 : 18, padding: wide ? "3px 14px" : "6px 22px", border: `2px solid ${LIME}`, color: LIME, fontSize: wide ? 18 : 28, fontWeight: 700, letterSpacing: 2 }}>
          {`BO${m.best_of}`}
        </div>
      </div>
      {teamCol(t2, bright2)}
    </div>
  );

  const tiles = maps.length > 0 && (
    <div style={{ display: "flex", gap: tileGap, marginTop: wide ? 16 : 0 }}>
      {maps.map((x, i) => {
        const win1 = x.team1_score > x.team2_score;
        const winner = win1 ? t1 : t2;
        return (
          <div
            key={x.id}
            style={{ display: "flex", position: "relative", width: tileW, height: tileH, borderRadius: 12, background: "#1a1d22", border: "2px solid rgba(255,255,255,0.12)" }}
          >
            <div
              style={{
                display: "flex",
                position: "absolute",
                left: 0,
                top: 0,
                width: tileW,
                height: tileH,
                borderRadius: 10,
                backgroundImage: `linear-gradient(180deg, rgba(11,13,16,0.2) 0%, rgba(11,13,16,0.85) 100%), linear-gradient(90deg, rgba(11,13,16,0.75) 0%, rgba(11,13,16,0) 55%)${covers[i] ? `, url(${covers[i]})` : ""}`,
                backgroundSize: "100% 100%",
              }}
            />
            <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", width: tileW, height: tileH, padding: wide ? "8px 12px" : "16px 20px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", alignItems: "center", fontSize: wide ? 30 : story ? 60 : 50, fontWeight: 700, lineHeight: 1 }}>
                  <span style={{ color: win1 ? WHITE : GREY }}>{x.team1_score}</span>
                  <span style={{ color: GREY, margin: "0 6px" }}>:</span>
                  <span style={{ color: win1 ? GREY : WHITE }}>{x.team2_score}</span>
                </div>
                {winner.pic && <img src={winner.pic} alt="" width={wide ? 26 : 44} height={wide ? 26 : 44} style={{ borderRadius: 8, objectFit: "cover" }} />}
              </div>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ display: "flex", fontSize: wide ? 15 : story ? 26 : 23, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase" }}>{mapName(x.map_name)}</div>
                <div style={{ display: "flex", padding: wide ? "2px 8px" : "4px 10px", background: LIME, color: INK, fontSize: wide ? 12 : 18, fontWeight: 700, borderRadius: 6 }}>
                  {cut(winner.tag.toUpperCase(), 6)}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );

  // MVP: аватар, ник и команда слева; три показателя в колонках фиксированной ширины — ничего не наезжает
  const statW = story ? 168 : 138;
  const stat = (label: string, value: string, color = WHITE) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: statW }}>
      <div style={{ display: "flex", fontSize: story ? 46 : 38, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: "flex", fontSize: story ? 20 : 17, color: GREY, marginTop: 4 }}>{label}</div>
    </div>
  );
  const avatar = story ? 100 : 82;
  const mvpBar = !wide && mvp && (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        padding: story ? "26px 30px" : "20px 24px",
        borderRadius: 14,
        background: "rgba(255,255,255,0.05)",
        border: `2px solid ${rgba(LIME, 0.5)}`,
      }}
    >
      {mvpPic ? (
        <img src={mvpPic} alt="" width={avatar} height={avatar} style={{ borderRadius: 12, objectFit: "cover" }} />
      ) : (
        <div style={{ display: "flex", width: avatar, height: avatar, borderRadius: 12, background: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", fontSize: 34, fontWeight: 700 }}>
          {mvp.name.slice(0, 1).toUpperCase()}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 22, overflow: "hidden" }}>
        <div style={{ display: "flex", fontSize: story ? 20 : 17, color: LIME, fontWeight: 700, letterSpacing: 4 }}>MVP МАТЧА</div>
        <div style={{ display: "flex", marginTop: 6, fontSize: fit(mvp.name, story ? 40 : 34, 13), fontWeight: 700, whiteSpace: "nowrap" }}>{cut(mvp.name, 22)}</div>
        {mvpTeam && mvpTeam.name !== mvp.name && <div style={{ display: "flex", marginTop: 2, fontSize: story ? 20 : 18, color: GREY, whiteSpace: "nowrap" }}>{cut(mvpTeam.name, 26)}</div>}
      </div>
      {stat("Рейтинг", mvp.rating.toFixed(2), LIME)}
      {stat("K–D", `${mvp.kills}–${mvp.deaths}`)}
      {stat("ADR", mvp.adr.toFixed(0))}
    </div>
  );

  // полоса-орнамент внизу: «F16 ARENA ×» по лайму
  const ornH = wide ? 30 : 48;
  const ornFs = wide ? 14 : 21;
  const ornament = (
    <div style={{ display: "flex", height: ornH, alignItems: "center", background: LIME, color: INK, overflow: "hidden", whiteSpace: "nowrap" }}>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ display: "flex", flexShrink: 0, marginLeft: ornFs, fontSize: ornFs, fontWeight: 700, letterSpacing: 2 }}>
          F16 ARENA ×
        </span>
      ))}
    </div>
  );

  const body = (
    <>
      {backdrop(bg, W, H, "linear-gradient(180deg, rgba(11,13,16,0.7) 0%, rgba(11,13,16,0.9) 40%, rgba(11,13,16,0.97) 100%)")}
      <div style={{ display: "flex", flexDirection: "column", position: "relative", width: W, height: H }}>
        {/* блоки распределены по высоте — без пустоты внизу */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "space-between",
            padding: `${wide ? 26 : story ? 90 : 50}px ${PAD}px ${wide ? 18 : story ? 80 : 44}px`,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column" }}>
            {top}
            {plate}
          </div>
          {scoreRow}
          {tiles}
          {mvpBar}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", padding: `0 ${PAD}px ${wide ? 12 : 22}px`, fontSize: wide ? 15 : 22, color: GREY }}>
          <span>{`Матч #${m.number}`}</span>
          <span>tournament.f16-arena.kz</span>
        </div>
        {ornament}
      </div>
    </>
  );
  return finish(body, W, H, `f16-match-${m.number}-${f}.png`);
}
