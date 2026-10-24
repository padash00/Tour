import { ImageResponse } from "next/og";
import { getTournamentBySlug } from "@/lib/data";
import { OG_FONT, ogFonts } from "@/lib/og-font";
import { getTournamentRecap } from "@/lib/recap";
import { buildRecapPoster } from "@/lib/recap-poster";

/** Превью итогов для соцсетей: тот же плакат, что и «Итоги» картинкой (широкий формат) */
export const alt = "Итоги турнира F16 Arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RecapOgImage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  // Inter Tight с кириллицей (см. og-font)
  const fonts = await ogFonts();
  const recap = t && t.status === "finished" ? await getTournamentRecap(t) : null;

  if (t && recap?.placements.some((p) => p.place === "1")) {
    const poster = await buildRecapPoster(t, recap, "wide", 1, fonts);
    return new ImageResponse(poster.node, { ...size, ...(fonts.length ? { fonts } : {}) });
  }

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "64px 80px",
          background: "#0b0d10",
          color: "#ffffff",
          ...(fonts.length ? { fontFamily: OG_FONT } : {}),
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 8, color: "#c6f432" }}>F16 ARENA</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{t?.name ?? "F16 Arena"}</div>
        <div style={{ display: "flex", marginTop: 40, fontSize: 32, color: "#8a8f98" }}>Итоги появятся после финала</div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
