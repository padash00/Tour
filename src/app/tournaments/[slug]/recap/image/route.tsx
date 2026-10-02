/* eslint-disable @next/next/no-img-element -- картинка рисуется next/og (satori), не браузером */
import { ImageResponse } from "next/og";
import type { NextRequest } from "next/server";
import { getTournamentBySlug } from "@/lib/data";
import { formatDate, plural } from "@/lib/format";
import { modeOf } from "@/lib/modes";
import { ogFonts } from "@/lib/og-font";
import { OG_FORMATS, ogAccess, ogFormat } from "@/lib/og-image";
import { getTournamentRecap, type Placement, type StatLeader } from "@/lib/recap";

/**
 * Итоги турнира картинкой для соцсетей: пьедестал, MVP, лидеры статистики.
 *   /tournaments/<slug>/recap/image            — 1080×1350 (лента Instagram)
 *   /tournaments/<slug>/recap/image?f=wide     — 1200×630 (WhatsApp, Telegram, превью ссылки)
 *   &download=1 — отдать файлом
 * Только для завершённого турнира, иначе 404.
 */

const GOLD = "#e8c27a";
const SILVER = "#c9d3e0";
const BRONZE = "#d39a6a";
const ACCENT = "#8ab8ff";
const MEDAL: Record<string, string> = { "1": GOLD, "2": SILVER, "3": BRONZE, "3–4": BRONZE };

/** картинка участника: аватар игрока (1×1) или логотип команды; без картинки — инициалы */
function Pic({ p, size }: { p: Placement; size: number }) {
  const solo = !!p.team.is_solo || (p.roster.length === 1 && p.roster[0].nickname === p.team.name);
  const src = solo ? p.roster[0]?.avatar_url : p.team.logo_url;
  const ring = MEDAL[p.place] ?? SILVER;
  return (
    <div style={{ display: "flex", padding: 4, borderRadius: size, background: `${ring}66` }}>
      {src ? (
        <img src={src} alt="" width={size} height={size} style={{ borderRadius: size, objectFit: "cover" }} />
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
            fontSize: size * 0.34,
            fontWeight: 700,
          }}
        >
          {(p.team.tag || p.team.name).slice(0, 3).toUpperCase()}
        </div>
      )}
    </div>
  );
}

function Podium({ p, size, name, big }: { p: Placement; size: number; name: number; big?: boolean }) {
  const color = MEDAL[p.place] ?? SILVER;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: big ? 360 : 280 }}>
      <div style={{ display: "flex", fontSize: big ? 26 : 22, fontWeight: 700, color, letterSpacing: 2 }}>
        {p.place === "1" ? "ЧЕМПИОН" : `${p.place} МЕСТО`}
      </div>
      <div style={{ display: "flex", marginTop: 18 }}>
        <Pic p={p} size={size} />
      </div>
      {/* длинный ник одним словом satori не переносит — уменьшаем шрифт, а самый длинный рвём по буквам */}
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          marginTop: 18,
          fontSize: p.team.name.length > 12 ? Math.max(18, Math.round((name * 13) / p.team.name.length)) : name,
          fontWeight: 700,
          textAlign: "center",
          width: big ? 360 : 280,
          lineHeight: 1.15,
          wordBreak: "break-all",
        }}
      >
        {p.team.name}
      </div>
      <div style={{ display: "flex", marginTop: 10, fontSize: 20, color: "#8a97ab" }}>
        {`серии ${p.record.wins}–${p.record.losses} · карты ${p.record.mapWins}–${p.record.mapLosses}`}
      </div>
    </div>
  );
}

function StatTile({ l }: { l: StatLeader }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        flex: 1,
        padding: "24px 26px",
        borderRadius: 20,
        background: "rgba(14,24,40,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ display: "flex", fontSize: 19, color: "#8a97ab" }}>{l.label}</div>
      <div style={{ display: "flex", marginTop: 8, fontSize: 46, fontWeight: 700 }}>{l.value}</div>
      <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
        {l.player?.avatar_url && <img src={l.player.avatar_url} alt="" width={30} height={30} style={{ borderRadius: 30, marginRight: 10 }} />}
        <div style={{ display: "flex", fontSize: 21, color: "#d6deea" }}>{l.name}</div>
      </div>
    </div>
  );
}

export async function GET(req: NextRequest, ctx: RouteContext<"/tournaments/[slug]/recap/image">) {
  const { slug } = await ctx.params;
  const t = await getTournamentBySlug(slug);
  if (!t || t.status !== "finished") return new Response("Итоги ещё не готовы", { status: 404 });
  const [recap, fonts] = await Promise.all([getTournamentRecap(t), ogFonts()]);
  const champ = recap.placements.find((p) => p.place === "1");
  if (!champ) return new Response("Итоги ещё не готовы", { status: 404 });
  const second = recap.placements.find((p) => p.place === "2");
  const third = recap.placements.find((p) => p.place === "3" || p.place === "3–4");
  const mvp = recap.mvp;
  const tops = ["kills", "adr", "rating"].map((k) => recap.leaders.find((l) => l.key === k)).filter((x): x is StatLeader => !!x);

  const fmt = ogFormat(req.nextUrl.searchParams.get("f"));
  const access = await ogAccess(req, fmt);
  if (!access.allowed) return new Response("Скачивание — только для администратора", { status: 403, headers: { "Cache-Control": "private, no-store" } });
  const scale = access.scale;
  const wide = fmt === "wide";
  const story = fmt === "story";
  const size = OG_FORMATS[fmt];
  const logo = new URL("/brand/f16-arena-horizontal.svg", req.nextUrl.origin).toString();
  const meta = [t.starts_at ? formatDate(t.starts_at) : null, modeOf(t.format).title, t.location].filter(Boolean).join(" · ");

  const header = (
    <div style={{ display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        {/* логотип 2228×842 — satori нужна и ширина, и высота */}
        <img src={logo} alt="" width={Math.round((wide ? 44 : 56) * 2.646)} height={wide ? 44 : 56} />
        <div style={{ display: "flex", fontSize: wide ? 18 : 22, letterSpacing: 6, color: "#7f93b0" }}>ИТОГИ ТУРНИРА</div>
      </div>
      <div style={{ display: "flex", marginTop: wide ? 18 : 40, fontSize: wide ? 48 : 68, fontWeight: 700, lineHeight: 1.05 }}>{t.name}</div>
      {meta && <div style={{ display: "flex", marginTop: 10, fontSize: wide ? 20 : 26, color: "#8a97ab" }}>{meta}</div>}
    </div>
  );

  const body = wide ? (
    <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: 34 }}>
      {second ? <Podium p={second} size={96} name={28} /> : <div style={{ display: "flex", width: 280 }} />}
      <Podium p={champ} size={132} name={36} big />
      {third ? <Podium p={third} size={96} name={28} /> : <div style={{ display: "flex", width: 280 }} />}
    </div>
  ) : (
    // сторис 9:16 — содержимое по центру высоты, а не прижато к шапке
    <div style={{ display: "flex", flexDirection: "column", ...(story ? { flex: 1, justifyContent: "center", paddingBottom: 60 } : {}) }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginTop: story ? 0 : 64 }}>
        {second ? <Podium p={second} size={124} name={30} /> : <div style={{ display: "flex", width: 280 }} />}
        <Podium p={champ} size={176} name={40} big />
        {third ? <Podium p={third} size={124} name={30} /> : <div style={{ display: "flex", width: 280 }} />}
      </div>
      {mvp && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            marginTop: story ? 110 : 64,
            padding: "28px 34px",
            borderRadius: 24,
            background: "linear-gradient(90deg, rgba(138,184,255,0.14), rgba(138,184,255,0.03))",
            border: "1px solid rgba(138,184,255,0.3)",
          }}
        >
          {mvp.player?.avatar_url && <img src={mvp.player.avatar_url} alt="" width={96} height={96} style={{ borderRadius: 96, marginRight: 28 }} />}
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontSize: 22, color: ACCENT, letterSpacing: 4 }}>MVP ТУРНИРА</div>
            <div style={{ display: "flex", marginTop: 6, fontSize: 44, fontWeight: 700 }}>{mvp.player?.nickname ?? mvp.name}</div>
          </div>
          <div style={{ display: "flex", gap: 34 }}>
            {[
              { l: "Rating", v: mvp.rating.toFixed(2) },
              { l: "ADR", v: mvp.adr.toFixed(1) },
              { l: "K/D", v: mvp.kd.toFixed(2) },
            ].map((x) => (
              <div key={x.l} style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
                <div style={{ display: "flex", fontSize: 38, fontWeight: 700 }}>{x.v}</div>
                <div style={{ display: "flex", fontSize: 18, color: "#8a97ab" }}>{x.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {tops.length > 0 && (
        <div style={{ display: "flex", gap: 18, marginTop: story ? 40 : 24 }}>
          {tops.map((l) => (
            <StatTile key={l.key} l={l} />
          ))}
        </div>
      )}
    </div>
  );

  const image = new ImageResponse(
    (
      <div style={{ display: "flex", position: "relative", width: "100%", height: "100%" }}>
      <div
        style={{
          width: size.width,
          height: size.height,
          // satori масштабирует от центра: сдвигаем блок, чтобы после увеличения он ровно лёг на холст
            ...(scale !== 1
              ? { position: "absolute", left: (size.width * (scale - 1)) / 2, top: (size.height * (scale - 1)) / 2, transform: `scale(${scale})` }
              : {}),
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: wide ? "48px 64px" : story ? "130px 72px 100px" : "72px 72px 56px",
          background: `radial-gradient(1000px 700px at 50% ${wide ? "100%" : "34%"}, #2a2a2c 0%, #121a28 38%, #070b12 75%)`,
          color: "#f4f7fb",
          // undefined в стиле satori не принимает — ключ только когда шрифт загрузился
          ...(fonts.length ? { fontFamily: "Onest" } : {}),
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", ...(story ? { flex: 1 } : {}) }}>
          {header}
          {body}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: wide ? 16 : 20, color: "#5d6b80" }}>
          <span>
            {[
              `${recap.totals.matches} ${plural(recap.totals.matches, "матч", "матча", "матчей")}`,
              `${recap.totals.maps} ${plural(recap.totals.maps, "карта", "карты", "карт")}`,
              `${recap.totals.rounds} ${plural(recap.totals.rounds, "раунд", "раунда", "раундов")}`,
            ].join(" · ")}
          </span>
          <span>tournament.f16-arena.kz</span>
        </div>
      </div>
      </div>
    ),
    { width: size.width * scale, height: size.height * scale, ...(fonts.length ? { fonts } : {}) },
  );

  const headers = new Headers(image.headers);
  headers.set("Cache-Control", access.private ? "private, no-store" : "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400");
  if (req.nextUrl.searchParams.get("download")) {
    headers.set("Content-Disposition", `attachment; filename="f16-${slug}-itogi-${fmt}.png"`);
  }
  return new Response(image.body, { status: 200, headers });
}
