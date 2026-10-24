/* eslint-disable @next/next/no-img-element -- картинка рисуется next/og (satori), не браузером */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG_FONT, type OgFont } from "@/lib/og-font";
import { ogImage } from "@/lib/og-image";
import { cut, Crest, fit, LOGO_RATIO, rgba, svgPng, type Pic } from "@/lib/recap-poster";
import { getMapImages } from "@/lib/settings";
import type { LeaderboardRow } from "@/lib/stats";
import type { Tournament } from "@/lib/types";

/**
 * Плакат «ТОП-5 лучших игроков» — родственник плаката итогов (lib/recap-poster): тёмный фон с обложкой карты,
 * лаймовый акцент, F16 и полоса «F16 ARENA ×». Пять вертикальных карточек: фото игрока, герб команды,
 * белая плашка с ником, крупный F16 Rating. Только реальные данные из таблицы игроков.
 */

const BG = "#0b0d10";
const LIME = "#c6f432";
const INK = "#0b0d10";
const WHITE = "#ffffff";
const GREY = "#8a8f98";

export const TOP_FORMATS = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  square: { width: 1200, height: 1200 },
} as const;
export type TopFormat = keyof typeof TOP_FORMATS;
export const topFormat = (f: string | null): TopFormat => (f === "story" || f === "square" ? f : "post");

/** высота карточки и размеры шрифтов по форматам */
const LAYOUT = {
  post: { pad: 48, gap: 14, card: 850, title: 76, sub: 26, name: 27, rating: 74, logo: 44, top: 48, badge: 52 },
  story: { pad: 48, gap: 14, card: 1000, title: 80, sub: 28, name: 28, rating: 78, logo: 46, top: 90, badge: 56 },
  square: { pad: 48, gap: 16, card: 640, title: 64, sub: 24, name: 28, rating: 78, logo: 42, top: 40, badge: 54 },
} as const;

export async function buildTopPoster(t: Tournament, players: LeaderboardRow[], subtitle: string, fmt: TopFormat, scale: number, fonts: OgFont[]) {
  const { width: W, height: H } = TOP_FORMATS[fmt];
  const L = LAYOUT[fmt];
  const n = players.length;
  const cw = Math.floor((W - 2 * L.pad - 4 * L.gap) / 5);
  const photoH = L.card - 250;

  const mapImages = await getMapImages();
  const coverUrl = Object.values(mapImages)[0] ?? null;
  const [bg, logoSvg, ...pics] = await Promise.all([
    ogImage(coverUrl, W * scale, 72, H * scale),
    readFile(join(process.cwd(), "public/brand/f16-arena-horizontal.svg")),
    ...players.map((p) => ogImage(p.player?.avatar_url, cw * scale, 90, photoH * scale)),
    ...players.map((p) => ogImage(p.team?.logo_url, L.badge * scale, 90, L.badge * scale)),
  ]);
  const avatars = pics.slice(0, n);
  const logos = pics.slice(n);
  const logo = await svgPng(logoSvg, 240 * scale);

  const top = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <img src={logo} alt="" width={Math.round(L.logo * LOGO_RATIO)} height={L.logo} />
      <div style={{ display: "flex", padding: "9px 20px", border: "2px solid rgba(255,255,255,0.3)", borderRadius: 8, fontSize: 21, fontWeight: 700, letterSpacing: 4 }}>
        СТАТИСТИКА
      </div>
    </div>
  );

  const title = n >= 2 ? `ТОП-${n} ЛУЧШИХ ИГРОКОВ` : "ЛУЧШИЙ ИГРОК";
  const head = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: fmt === "story" ? 56 : 30 }}>
      <div style={{ display: "flex", justifyContent: "center", textAlign: "center", fontSize: L.title, fontWeight: 700, color: LIME, lineHeight: 1.0, letterSpacing: -1 }}>{title}</div>
      <div style={{ display: "flex", justifyContent: "center", textAlign: "center", marginTop: 10, fontSize: fit(t.name, L.title * 0.78, 22), fontWeight: 700, color: WHITE, lineHeight: 1.05, textTransform: "uppercase" }}>
        {cut(t.name, 40)}
      </div>
      <div style={{ display: "flex", marginTop: 20, transform: "skewX(-10deg)", fontSize: L.sub, fontWeight: 700, color: "#e4e7eb", letterSpacing: 5 }}>{subtitle}</div>
    </div>
  );

  const card = (p: LeaderboardRow, i: number) => {
    const nick = p.player?.nickname ?? p.name;
    const first = i === 0;
    const line = first ? LIME : rgba(LIME, 0.55);
    const teamPic: Pic = { src: logos[i], tag: p.team?.tag || p.team?.name || "" };
    return (
      <div key={p.steam_id} style={{ display: "flex", flexDirection: "column", width: cw, height: L.card, borderRadius: 16, border: `${first ? 3 : 2}px solid ${line}`, background: "rgba(14,17,21,0.88)", overflow: "hidden", position: "relative" }}>
        {/* фото */}
        <div style={{ display: "flex", position: "relative", width: cw - (first ? 6 : 4), height: photoH, background: "#161a20" }}>
          {avatars[i] ? (
            <div style={{ display: "flex", width: "100%", height: "100%", backgroundImage: `url(${avatars[i]})`, backgroundSize: "100% 100%" }} />
          ) : (
            <div style={{ display: "flex", width: "100%", height: "100%", alignItems: "center", justifyContent: "center", fontSize: cw * 0.5, fontWeight: 700, color: "rgba(255,255,255,0.18)" }}>{nick.slice(0, 1).toUpperCase()}</div>
          )}
          <div style={{ display: "flex", position: "absolute", left: 0, bottom: 0, width: "100%", height: photoH * 0.45, backgroundImage: "linear-gradient(180deg, rgba(14,17,21,0) 0%, rgba(14,17,21,0.95) 100%)" }} />
          {/* место */}
          <div style={{ display: "flex", position: "absolute", left: 0, top: 0, padding: "4px 12px", background: first ? LIME : "rgba(0,0,0,0.65)", color: first ? INK : LIME, fontSize: 24, fontWeight: 700, borderRadius: "0 0 10px 0" }}>{i + 1}</div>
          {/* герб команды */}
          {t.format !== "1v1" && (teamPic.src || (teamPic.tag && teamPic.tag !== nick && teamPic.tag.length <= 5)) && (
            <div style={{ display: "flex", position: "absolute", right: 8, top: 8 }}>
              <Crest pic={teamPic} size={Math.round(L.badge * 0.7)} color={rgba(WHITE, 0.45)} />
            </div>
          )}
        </div>
        {/* плашка с ником */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 56, marginTop: -28, marginLeft: 8, marginRight: 8, background: WHITE, color: INK, borderRadius: 6, fontSize: fit(nick, L.name, 9), fontWeight: 700, whiteSpace: "nowrap", position: "relative" }}>
          {cut(nick, 16)}
        </div>
        {/* рейтинг */}
        <div style={{ display: "flex", flex: 1, flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: L.rating, fontWeight: 700, color: LIME, lineHeight: 1, letterSpacing: -2 }}>{p.rating.toFixed(2)}</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: 19, fontWeight: 700, color: WHITE, letterSpacing: 4 }}>РЕЙТИНГ</div>
          <div style={{ display: "flex", marginTop: 12, fontSize: 18, color: GREY, whiteSpace: "nowrap" }}>{`${p.kills} K · ${Math.round(p.adr)} ADR`}</div>
        </div>
      </div>
    );
  };

  const cards = (
    <div style={{ display: "flex", justifyContent: "center", gap: L.gap }}>
      {players.map((p, i) => card(p, i))}
    </div>
  );

  const ornFs = 21;
  const ornament = (
    <div style={{ display: "flex", height: 48, alignItems: "center", background: LIME, color: INK, overflow: "hidden", whiteSpace: "nowrap" }}>
      {Array.from({ length: 12 }, (_, i) => (
        <span key={i} style={{ display: "flex", flexShrink: 0, marginLeft: ornFs, fontSize: ornFs, fontWeight: 700, letterSpacing: 2 }}>
          F16 ARENA ×
        </span>
      ))}
    </div>
  );
  const footer = (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: `0 ${L.pad}px 20px`, fontSize: 21, color: GREY }}>
      <span style={{ display: "flex", flex: 1, fontWeight: 700, letterSpacing: 3 }}>F16 RATING</span>
      <img src={logo} alt="" width={Math.round(30 * LOGO_RATIO)} height={30} />
      <span style={{ display: "flex", flex: 1, justifyContent: "flex-end" }}>tournament.f16-arena.kz</span>
    </div>
  );

  const content = (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", padding: `${L.top}px ${L.pad}px ${fmt === "story" ? 60 : 24}px` }}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {top}
        {head}
      </div>
      {cards}
    </div>
  );

  const node = (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          width: W,
          height: H,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          background: BG,
          color: WHITE,
          ...(scale !== 1 ? { position: "absolute", left: (W * (scale - 1)) / 2, top: (H * (scale - 1)) / 2, transform: `scale(${scale})` } : {}),
          ...(fonts.length ? { fontFamily: OG_FONT } : {}),
        }}
      >
        <div
          style={{
            display: "flex",
            position: "absolute",
            left: 0,
            top: 0,
            width: W,
            height: H,
            backgroundColor: BG,
            backgroundImage: `linear-gradient(180deg, rgba(11,13,16,0.72) 0%, rgba(11,13,16,0.9) 45%, rgba(11,13,16,0.97) 100%)${bg ? `, url(${bg})` : ""}`,
            backgroundSize: "100% 100%",
          }}
        />
        <div style={{ display: "flex", flexDirection: "column", position: "relative", width: W, height: H }}>
          {content}
          {footer}
          {ornament}
        </div>
      </div>
    </div>
  );
  return { node, width: W * scale, height: H * scale };
}
