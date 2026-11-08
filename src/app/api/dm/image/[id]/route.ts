import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { DM_IMAGE_BUCKET } from "@/lib/dm";
import { db } from "@/lib/supabase";

/** Картинка из личного сообщения: только участникам переписки и админам (хранилище закрытое) */
export const dynamic = "force-dynamic";

const notFound = () => NextResponse.json({ error: "not found" }, { status: 404, headers: { "Cache-Control": "private, no-store" } });

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/dm/image/[id]">) {
  const me = await getCurrentPlayer();
  if (!me) return notFound();
  const id = Number((await ctx.params).id);
  if (!Number.isSafeInteger(id) || id <= 0) return notFound();
  const { data: msg } = await db().from("direct_messages").select("sender_id, recipient_id, image_path").eq("id", id).maybeSingle();
  if (!msg?.image_path || (msg.sender_id !== me.id && msg.recipient_id !== me.id && !isAdmin(me))) return notFound();
  const { data: file, error } = await db().storage.from(DM_IMAGE_BUCKET).download(msg.image_path);
  if (error || !file) return notFound();
  const ext = msg.image_path.split(".").pop();
  const type = ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : "image/jpeg";
  // nosniff + CSP sandbox: файл показывается только как картинка
  return new NextResponse(file, {
    headers: { "Content-Type": type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "sandbox; default-src 'none'" },
  });
}
