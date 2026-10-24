import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { OG_FONT, ogFonts } from "@/lib/og-font";

/** Картинка для соцсетей и мессенджеров: логотип F16 Arena на чёрном, лаймовая полоса снизу */
export const alt = "F16 Arena — турниры по CS2";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/png/f16-arena-horizontal-3200.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
  const fonts = await ogFonts();
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "0 96px",
          background: "#000000",
          color: "#f5f5f5",
          borderBottom: "14px solid #d7ff00",
          ...(fonts.length ? { fontFamily: OG_FONT } : {}),
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={720} height={207} />
        <div style={{ marginTop: 48, fontSize: 32, letterSpacing: 2, color: "#bdbdbd" }}>Турниры по CS2 · Усть-Каменогорск</div>
      </div>
    ),
    { ...size, ...(fonts.length ? { fonts } : {}) },
  );
}
