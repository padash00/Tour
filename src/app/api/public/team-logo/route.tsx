import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

/*
 * Логотип команды в PNG 256×256 — для интерфейса трансляции (cs-hud принимает только PNG).
 * Источник — только публичное хранилище Supabase (логотипы команд), чужие адреса не проксируем.
 *   /api/public/team-logo?src=<https://….supabase.co/storage/v1/object/public/…>
 */

const ALLOWED = /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i;
// Своё хранилище (база на своём сервере): тот же путь на хосте SUPABASE_URL.
const OWN_STORAGE = process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL.replace(/\/$/, "")}/storage/v1/object/public/` : null;

export async function GET(request: NextRequest) {
  const src = request.nextUrl.searchParams.get("src") ?? "";
  if (!ALLOWED.test(src) && !(OWN_STORAGE && src.startsWith(OWN_STORAGE))) return new Response("bad src", { status: 400 });
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: "transparent" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" width={256} height={256} style={{ objectFit: "contain" }} />
      </div>
    ),
    { width: 256, height: 256, headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" } },
  );
}
