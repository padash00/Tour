/* eslint-disable @next/next/no-img-element -- картинка рисуется next/og (satori), не браузером */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { ReactNode } from "react";
import { formatDate, plural } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import { OG_FONT, type OgFont } from "@/lib/og-font";
import { OG_FORMATS, ogImage, type OgFormat } from "@/lib/og-image";
import type { Placement, StatLeader, TournamentRecap } from "@/lib/recap";
import { getMapImages } from "@/lib/settings";
import type { Tournament } from "@/lib/types";

/**
 * Плакат «Итоги турнира» в стиле Telegram-каналов про CS (как «Результат» матча):
 * тёмный фон с размытой обложкой карты, лаймовая плашка турнира, пьедестал с гербами, MVP, номинации, цифры.
 * Только данные из getTournamentRecap — ничего не выдумываем.
 */

const BG = "#0b0d10";
const LIME = "#c6f432";
const INK = "#0b0d10";
const WHITE = "#ffffff";
const GREY = "#8a8f98";
const MEDAL: Record<string, string> = { "1": "#f5c542", "2": "#c9d0da", "3": "#d98a4e", "3–4": "#d98a4e" };
/** пропорции логотипа f16-arena-horizontal.svg (1414×326) */
export const LOGO_RATIO = 1414 / 326;

export const fit = (name: string, base: number, max = 12) => (name.length > max ? Math.max(Math.round(base * 0.5), Math.round((base * max) / name.length)) : base);
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
export const rgba = (hex: string, a: number) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export type Pic = { src: string | null; tag: string };

/** Герб: логотип команды (или аватар соло-игрока); без картинки — ПОЛНЫЙ тег в квадрате */
export function Crest({ pic, size, color }: { pic: Pic; size: number; color: string }) {
  const r = size * 0.16;
  const ring = { border: `${Math.max(3, Math.round(size * 0.022))}px solid ${color}`, borderRadius: r + 4 } as const;
  return pic.src ? (
    <div style={{ display: "flex", ...ring, padding: 4, background: "rgba(0,0,0,0.35)" }}>
      <img src={pic.src} alt="" width={size} height={size} style={{ borderRadius: r, objectFit: "cover" }} />
    </div>
  ) : (
    <div style={{ display: "flex", ...ring, padding: 4, background: "rgba(0,0,0,0.35)" }}>
      <div
        style={{
          display: "flex",
          width: size,
          height: size,
          borderRadius: r,
          alignItems: "center",
          justifyContent: "center",
          background: "rgba(255,255,255,0.07)",
          color: WHITE,
          fontSize: Math.round(Math.min(size * 0.4, (size * 0.86) / (Math.max(pic.tag.length, 2) * 0.62))),
          fontWeight: 700,
          letterSpacing: -1,
        }}
      >
        {pic.tag.toUpperCase()}
      </div>
    </div>
  );
}

export async function svgPng(svg: Buffer, width: number) {
  const sharp = (await import("sharp")).default;
  const out = await sharp(svg, { density: 300 }).resize({ width }).png().toBuffer();
  return `data:image/png;base64,${out.toString("base64")}`;
}

export async function buildRecapPoster(t: Tournament, recap: TournamentRecap, fmt: OgFormat, scale: number, fonts: OgFont[]) {
  const size = OG_FORMATS[fmt];
  const W = size.width;
  const H = size.height;
  const wide = fmt === "wide";
  const story = fmt === "story";
  const PAD = wide ? 40 : 60;

  const champ = recap.placements.find((p) => p.place === "1")!;
  const second = recap.placements.find((p) => p.place === "2");
  const third = recap.placements.find((p) => p.place === "3" || p.place === "3–4");
  const mvp = recap.mvp;

  // размеры по форматам
  const cC = wide ? 124 : story ? 280 : 204; // герб чемпиона
  const cS = wide ? 88 : story ? 190 : 140; // герб 2–3 места
  const colC = wide ? 250 : story ? 400 : 380;
  const colS = wide ? 200 : story ? 300 : 290;

  const mapImages = await getMapImages();
  const coverName = recap.longestMap?.map.map_name ?? recap.closestMap?.map.map_name;
  const coverUrl = (coverName ? mapImages[coverName.split("@")[0]] : null) ?? Object.values(mapImages)[0] ?? null;

  const picOf = async (p: Placement | undefined, px: number): Promise<Pic> => {
    if (!p) return { src: null, tag: "" };
    const solo = !!p.team.is_solo || (p.roster.length === 1 && p.roster[0].nickname === p.team.name);
    const url = solo ? (p.roster[0]?.avatar_url ?? p.team.logo_url) : p.team.logo_url;
    return { src: await ogImage(url, px * scale, 90, px * scale), tag: p.team.tag || p.team.name };
  };
  const mvpAvatar = mvp?.player?.avatar_url;
  const [bg, picC, pic2, pic3, mvpPic, logoSvg] = await Promise.all([
    ogImage(coverUrl, W * scale, 72, H * scale),
    picOf(champ, cC),
    picOf(second, cS),
    picOf(third, cS),
    ogImage(mvpAvatar, 220 * scale, 90, 220 * scale),
    readFile(join(process.cwd(), "public/brand/f16-arena-horizontal.svg")),
  ]);
  const logo = await svgPng(logoSvg, 240 * scale);

  const meta = [t.starts_at ? formatDate(t.starts_at) : null, modeOf(t.format).title, t.location].filter(Boolean).join(" · ");

  // ── шапка
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
        ИТОГИ ТУРНИРА
      </div>
    </div>
  );
  const plate = (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: wide ? 14 : story ? 60 : 26 }}>
      <div
        style={{
          display: "flex",
          padding: wide ? "8px 24px" : "14px 36px",
          background: LIME,
          color: INK,
          fontSize: fit(t.name, wide ? 28 : story ? 48 : 42, 24),
          fontWeight: 700,
          letterSpacing: 1,
          textTransform: "uppercase",
        }}
      >
        {t.name}
      </div>
      {meta && (
        <div style={{ display: "flex", marginTop: wide ? 8 : 16, fontSize: wide ? 15 : 22, color: GREY, letterSpacing: 3, textTransform: "uppercase" }}>{cut(meta, wide ? 80 : 60)}</div>
      )}
    </div>
  );

  // ── пьедестал
  const rosterLine = (p: Placement, max: number) => cut(p.roster.map((r) => r.nickname).join(" · "), max);
  const podiumCol = (p: Placement | undefined, pic: Pic, big: boolean) => {
    const w = big ? colC : colS;
    if (!p) return <div style={{ display: "flex", width: w }} />;
    const color = MEDAL[p.place] ?? MEDAL["3"];
    const name = p.team.name;
    const nameFs = fit(name, big ? (wide ? 30 : story ? 50 : 46) : wide ? 20 : story ? 32 : 30, big ? 11 : 12);
    const plinthH = big ? (wide ? 40 : story ? 110 : 80) : p.place === "2" ? (wide ? 28 : story ? 76 : 56) : wide ? 20 : story ? 52 : 38;
    const label = p.place === "1" ? "ЧЕМПИОН" : `${p.place} МЕСТО`;
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: w }}>
        <div style={{ display: "flex", padding: wide ? "3px 12px" : "5px 18px", background: color, color: INK, fontSize: wide ? (big ? 16 : 13) : big ? 26 : 20, fontWeight: 700, letterSpacing: 3, borderRadius: 6 }}>
          {label}
        </div>
        <div style={{ display: "flex", marginTop: wide ? 10 : 18 }}>
          <Crest pic={pic} size={big ? cC : cS} color={color} />
        </div>
        <div style={{ display: "flex", justifyContent: "center", width: w, marginTop: wide ? 8 : 16, textAlign: "center", fontSize: nameFs, fontWeight: 700, textTransform: "uppercase", color: big ? WHITE : "#e4e7eb", lineHeight: 1.1 }}>
          {name}
        </div>
        {!wide && p.roster.length > 1 && (
          <div style={{ display: "flex", justifyContent: "center", width: w, marginTop: 8, textAlign: "center", fontSize: big ? 21 : 18, color: GREY, lineHeight: 1.2 }}>{rosterLine(p, big ? 38 : 30)}</div>
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: w,
            height: plinthH,
            marginTop: wide ? 10 : 18,
            borderRadius: "10px 10px 0 0",
            background: `linear-gradient(180deg, ${rgba(color, 0.55)} 0%, ${rgba(color, 0.12)} 100%)`,
            borderTop: `3px solid ${color}`,
            color,
            fontSize: plinthH * 0.7,
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {p.place === "3–4" ? "3" : p.place}
        </div>
      </div>
    );
  };
  const podium = (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", width: wide ? 800 : "100%" }}>
      {podiumCol(second, pic2, false)}
      {podiumCol(champ, picC, true)}
      {podiumCol(third, pic3, false)}
    </div>
  );

  // ── MVP
  const mvpName = mvp ? (mvp.player?.nickname ?? mvp.name) : "";
  const stat = (label: string, value: string, w: number, color = WHITE) => (
    <div key={label} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", width: w }}>
      <div style={{ display: "flex", fontSize: story ? 44 : 38, fontWeight: 700, color, lineHeight: 1.1 }}>{value}</div>
      <div style={{ display: "flex", fontSize: story ? 20 : 17, color: GREY, marginTop: 4 }}>{label}</div>
    </div>
  );
  const swing = mvp?.swing != null ? `${mvp.swing > 0 ? "+" : ""}${mvp.swing.toFixed(1)}` : null;
  const mvpAv = (px: number) =>
    mvpPic ? (
      <img src={mvpPic} alt="" width={px} height={px} style={{ borderRadius: px * 0.15, objectFit: "cover" }} />
    ) : (
      <div style={{ display: "flex", width: px, height: px, borderRadius: px * 0.15, background: "rgba(255,255,255,0.1)", alignItems: "center", justifyContent: "center", fontSize: px * 0.4, fontWeight: 700 }}>
        {mvpName.slice(0, 1).toUpperCase()}
      </div>
    );
  const mvpBar =
    mvp && !wide ? (
      <div style={{ display: "flex", alignItems: "center", padding: story ? "26px 30px" : "20px 24px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: `2px solid ${rgba(LIME, 0.55)}` }}>
        {mvpAv(story ? 112 : 92)}
        <div style={{ display: "flex", flexDirection: "column", flex: 1, marginLeft: 22 }}>
          <div style={{ display: "flex", fontSize: story ? 20 : 17, color: LIME, fontWeight: 700, letterSpacing: 4 }}>MVP ТУРНИРА</div>
          <div style={{ display: "flex", marginTop: 6, fontSize: fit(mvpName, story ? 44 : 38, 11), fontWeight: 700, whiteSpace: "nowrap" }}>{cut(mvpName, 20)}</div>
          {mvp.team && mvp.team.name !== mvpName && <div style={{ display: "flex", marginTop: 2, fontSize: story ? 20 : 18, color: GREY, whiteSpace: "nowrap" }}>{cut(mvp.team.name, 22)}</div>}
        </div>
        {stat("Rating", mvp.rating.toFixed(2), story ? 124 : 112, LIME)}
        {stat("ADR", mvp.adr.toFixed(0), story ? 112 : 100)}
        {stat("K/D", mvp.kd.toFixed(2), story ? 112 : 100)}
        {swing && stat("Swing", swing, story ? 112 : 100)}
      </div>
    ) : null;

  // ── номинации (без MVP: он выше)
  const noms = recap.nominations.filter((n) => n.key !== "mvp").slice(0, story ? 8 : 4);
  const nomRows = Math.ceil(noms.length / 2);
  const nomH = story ? 104 : 84;
  const nomGrid =
    noms.length > 0 && !wide ? (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ display: "flex", fontSize: story ? 20 : 17, color: GREY, letterSpacing: 4, fontWeight: 700 }}>НОМИНАЦИИ</div>
        {Array.from({ length: nomRows }, (_, r) => (
          <div key={r} style={{ display: "flex", gap: 12 }}>
            {[noms[r * 2], noms[r * 2 + 1]].map((n, i) =>
              n ? (
                <div key={n.key} style={{ display: "flex", flexDirection: "column", justifyContent: "center", flex: 1, height: nomH, padding: "0 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", borderLeft: `5px solid ${LIME}` }}>
                  <div style={{ display: "flex", fontSize: story ? 19 : 16, color: LIME, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", whiteSpace: "nowrap" }}>{cut(n.title, 26)}</div>
                  <div style={{ display: "flex", alignItems: "baseline", marginTop: 4, whiteSpace: "nowrap" }}>
                    <span style={{ fontSize: fit(n.name, story ? 34 : 30, 12), fontWeight: 700 }}>{cut(n.name, 18)}</span>
                    {n.team && n.team.name !== n.name && <span style={{ marginLeft: 10, fontSize: story ? 20 : 17, color: GREY }}>{cut(n.team.tag.toUpperCase(), 6)}</span>}
                  </div>
                </div>
              ) : (
                <div key={`e${i}`} style={{ display: "flex", flex: 1 }} />
              ),
            )}
          </div>
        ))}
      </div>
    ) : null;

  // ── лидеры (сторис)
  const tops = ["kills", "adr", "clutches"].map((k) => recap.leaders.find((l) => l.key === k)).filter((x): x is StatLeader => !!x);
  const leaders =
    story && tops.length > 0 ? (
      <div style={{ display: "flex", gap: 12 }}>
        {tops.map((l) => (
          <div key={l.key} style={{ display: "flex", flexDirection: "column", flex: 1, padding: "18px 20px", borderRadius: 12, background: "rgba(255,255,255,0.06)", border: "2px solid rgba(255,255,255,0.12)" }}>
            <div style={{ display: "flex", fontSize: 18, color: GREY, whiteSpace: "nowrap" }}>{cut(l.label, 20)}</div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 46, fontWeight: 700, color: LIME, lineHeight: 1.1 }}>{l.value}</div>
            <div style={{ display: "flex", marginTop: 4, fontSize: 22, fontWeight: 700, whiteSpace: "nowrap" }}>{cut(l.name, 14)}</div>
          </div>
        ))}
      </div>
    ) : null;

  // ── итоговые цифры
  const tt = recap.totals;
  const totalItems = [
    { v: tt.matches, l: plural(tt.matches, "матч", "матча", "матчей") },
    { v: tt.maps, l: plural(tt.maps, "карта", "карты", "карт") },
    { v: tt.rounds, l: plural(tt.rounds, "раунд", "раунда", "раундов") },
    { v: tt.kills, l: plural(tt.kills, "убийство", "убийства", "убийств") },
  ].filter((x) => x.v > 0);
  const totals = (
    <div style={{ display: "flex", justifyContent: "space-between", padding: wide ? "10px 0" : "20px 0", borderTop: "2px solid rgba(255,255,255,0.14)", borderBottom: wide ? "none" : "2px solid rgba(255,255,255,0.14)" }}>
      {totalItems.map((x) => (
        <div key={x.l} style={{ display: "flex", alignItems: "baseline", flex: 1, justifyContent: "center" }}>
          <span style={{ fontSize: wide ? 28 : story ? 52 : 46, fontWeight: 700, color: WHITE }}>{x.v}</span>
          <span style={{ marginLeft: 10, fontSize: wide ? 14 : story ? 22 : 20, color: GREY }}>{x.l}</span>
        </div>
      ))}
    </div>
  );

  // ── полоса-орнамент
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
  const footer = (
    <div style={{ display: "flex", justifyContent: "space-between", padding: `0 ${PAD}px ${wide ? 10 : 20}px`, fontSize: wide ? 15 : 22, color: GREY }}>
      <span>{t.name}</span>
      <span>tournament.f16-arena.kz</span>
    </div>
  );

  // ── MVP для широкого формата: вертикальная карточка справа от пьедестала
  const wideMvp =
    mvp && wide ? (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 230, padding: "14px 12px", borderRadius: 14, background: "rgba(255,255,255,0.06)", border: `2px solid ${rgba(LIME, 0.55)}` }}>
        <div style={{ display: "flex", fontSize: 14, color: LIME, fontWeight: 700, letterSpacing: 4 }}>MVP ТУРНИРА</div>
        <div style={{ display: "flex", marginTop: 8 }}>{mvpAv(84)}</div>
        <div style={{ display: "flex", marginTop: 8, fontSize: fit(mvpName, 28, 10), fontWeight: 700, whiteSpace: "nowrap" }}>{cut(mvpName, 16)}</div>
        <div style={{ display: "flex", justifyContent: "space-between", width: "100%", marginTop: 10 }}>
          {[
            { l: "Rating", v: mvp.rating.toFixed(2), c: LIME },
            { l: "ADR", v: mvp.adr.toFixed(0), c: WHITE },
            { l: "K/D", v: mvp.kd.toFixed(2), c: WHITE },
          ].map((x) => (
            <div key={x.l} style={{ display: "flex", flexDirection: "column", alignItems: "center", flex: 1 }}>
              <div style={{ display: "flex", fontSize: 21, fontWeight: 700, color: x.c }}>{x.v}</div>
              <div style={{ display: "flex", fontSize: 12, color: GREY }}>{x.l}</div>
            </div>
          ))}
        </div>
      </div>
    ) : null;

  const padding = `${wide ? 24 : story ? 90 : 48}px ${PAD}px ${wide ? 10 : story ? 70 : 28}px`;
  const wrap = { display: "flex", flexDirection: "column", flex: 1, justifyContent: "space-between", padding } as const;
  const content: ReactNode = wide ? (
    <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {top}
        {plate}
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between" }}>
        <div style={{ display: "flex", width: 800, alignItems: "flex-end" }}>{podium}</div>
        {wideMvp}
      </div>
      {totals}
    </div>
  ) : (
    <div style={wrap}>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {top}
        {plate}
      </div>
      {podium}
      {mvpBar}
      {nomGrid}
      {leaders}
      {totals}
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
          // satori масштабирует от центра: сдвигаем блок, чтобы после увеличения он ровно лёг на холст
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
