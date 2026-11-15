import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { checkBearer } from "@/lib/server-control";
import { exchangeWithAgent } from "@/lib/skins";
import { logSiteError } from "@/lib/site-errors";

const schema = z.object({
  state: z.array(z.object({ steam_id: z.string().regex(/^\d{17}$/), data: z.unknown() })).max(2000).default([]),
  acks: z.array(z.object({ id: z.number().int().positive(), error: z.string().max(500).nullable().optional() })).max(500).default([]),
});

/**
 * Скины: агент присылает наборы игроков, изменившиеся в базе плагина (в игре через !skins или после правки с сайта),
 * и подтверждения применённых правок; в ответ — правки с сайта, которые ещё надо перенести в базу плагина.
 */
export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2_000_000) return NextResponse.json({ error: "too large" }, { status: 413 });
    body = JSON.parse(raw);
  } catch { return NextResponse.json({ error: "bad json" }, { status: 400 }); }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  try {
    const ops = await exchangeWithAgent(parsed.data.state, parsed.data.acks);
    return NextResponse.json({ ops });
  } catch (e) {
    console.error("agent skins failed", e);
    await logSiteError({ source: "server", message: "Agent skins exchange", path: "/api/agent/skins", kind: "background_job" }).catch(() => {});
    return NextResponse.json({ error: "failed" }, { status: 500 });
  }
}
