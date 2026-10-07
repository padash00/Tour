import { ImageResponse } from "next/og";
import { getTournamentBySlug } from "@/lib/data";
import { ogFonts } from "@/lib/og-font";
import { getTournamentRecap } from "@/lib/recap";

/** Превью итогов для соцсетей: турнир, чемпион, 2–3 место, MVP */
export const alt = "Итоги турнира F16 Arena";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function RecapOgImage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const t = await getTournamentBySlug(slug);
  // Onest с кириллицей (Google Fonts теперь отдаёт woff — старый поиск TTF находил пустоту)
  const fonts = await ogFonts();
  const recap = t && t.status === "finished" ? await getTournamentRecap(t) : null;
  const champ = recap?.placements.find((p) => p.place === "1");
  const others = recap?.placements.filter((p) => p.place !== "1" && p.place !== "4").slice(0, 3) ?? [];
  const mvp = recap?.mvp;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          padding: "64px 80px",
          background: "radial-gradient(900px 520px at 85% 0%, #1b2c4a 0%, #070b12 70%)",
          color: "#f4f7fb",
          ...(fonts.length ? { fontFamily: "Onest" } : {}),
        }}
      >
        <div style={{ display: "flex", fontSize: 22, letterSpacing: 8, color: "#7f93b0" }}>F16 ARENA · {fonts.length ? "ИТОГИ" : "RESULTS"}</div>
        <div style={{ display: "flex", marginTop: 18, fontSize: 64, fontWeight: 700, lineHeight: 1.05 }}>{t?.name ?? "F16 Arena"}</div>
        {champ ? (
          <div style={{ display: "flex", flexDirection: "column", marginTop: 48 }}>
            <div style={{ display: "flex", fontSize: 24, color: "#e8c27a" }}>{fonts.length ? "Чемпион" : "Champion"}</div>
            <div style={{ display: "flex", alignItems: "center", marginTop: 10 }}>
              {champ.team.logo_url && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={champ.team.logo_url} alt="" width={96} height={96} style={{ borderRadius: 16, marginRight: 28, objectFit: "contain" }} />
              )}
              <div style={{ display: "flex", fontSize: 72, fontWeight: 700 }}>{champ.team.name}</div>
            </div>
            <div style={{ display: "flex", marginTop: 40, gap: 48, fontSize: 26, color: "#a8b2c2" }}>
              {others.map((p) => (
                <div key={p.team.id} style={{ display: "flex" }}>
                  <span style={{ color: "#d39a6a", marginRight: 12 }}>{p.place}</span>
                  {p.team.name}
                </div>
              ))}
              {mvp && (
                <div style={{ display: "flex" }}>
                  <span style={{ color: "#8ab8ff", marginRight: 12 }}>MVP</span>
                  {mvp.player?.nickname ?? mvp.name}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", marginTop: 48, fontSize: 32, color: "#a8b2c2" }}>{fonts.length ? "Итоги появятся после финала" : "Results after the final"}</div>
        )}
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
