import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

/** Картинка для соцсетей и мессенджеров: логотип F16 Arena на фирменном фоне */
export const alt = "F16 Arena — турниры по CS2";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpengraphImage() {
  const logo = await readFile(join(process.cwd(), "public/brand/png/f16-arena-horizontal-3200.png"));
  const src = `data:image/png;base64,${logo.toString("base64")}`;
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
          background: "radial-gradient(900px 500px at 85% 0%, #14233b 0%, #070b12 70%)",
          color: "#f4f7fb",
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={640} height={242} />
        {/* встроенный шрифт ImageResponse без кириллицы — подпись латиницей */}
        <div style={{ marginTop: 40, fontSize: 30, letterSpacing: 10, color: "#7f93b0" }}>CS2 · TEAMS · TOURNAMENTS · LAN</div>
      </div>
    ),
    size,
  );
}
