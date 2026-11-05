import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_BUCKET } from "@/lib/analysis";
import { checkBearer } from "@/lib/server/state";
import { db } from "@/lib/supabase";

/*
 * Программа разбора демок (server/analyzer) регистрирует новый разбор: POST — карточка (получает id),
 * затем PUT ?id=… — сам файл (gzip, до 4 МБ); сайт кладёт его в закрытое хранилище своим ключом.
 * Тот же исходный файл (source) разбирается заново — карточка обновляется, файл перезаписывается.
 */
export const dynamic = "force-dynamic";

type Meta = {
  kind?: string;
  match_id?: string | null;
  map_number?: number | null;
  map?: string;
  title?: string;
  team_a?: string | null;
  team_b?: string | null;
  score_a?: number | null;
  score_b?: number | null;
  rounds?: number;
  players?: unknown;
  source?: string | null;
  size_bytes?: number | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const str = (v: unknown, max = 120) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);
const int = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null);

export async function POST(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let m: Meta;
  try {
    m = (await request.json()) as Meta;
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }
  const map = str(m.map, 40);
  if (!map || !/^[a-z0-9_]+$/.test(map)) return NextResponse.json({ error: "map" }, { status: 400 });
  const row = {
    kind: m.kind === "match" ? "match" : "pro",
    match_id: typeof m.match_id === "string" && UUID.test(m.match_id) ? m.match_id : null,
    map_number: int(m.map_number),
    map,
    title: str(m.title, 200) ?? map,
    team_a: str(m.team_a),
    team_b: str(m.team_b),
    score_a: int(m.score_a),
    score_b: int(m.score_b),
    rounds: int(m.rounds) ?? 0,
    players: Array.isArray(m.players) ? m.players.slice(0, 20) : [],
    source: str(m.source, 300),
    size_bytes: int(m.size_bytes),
  };

  const existing = row.source ? (await db().from("demo_analyses").select("id, storage_path").eq("source", row.source).maybeSingle()).data : null;
  let id: string;
  let storagePath: string;
  if (existing) {
    id = existing.id;
    storagePath = existing.storage_path;
    const { error } = await db().from("demo_analyses").update(row).eq("id", id);
    if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  } else {
    id = crypto.randomUUID();
    storagePath = `${row.kind}/${id}.json.gz`;
    const { error } = await db().from("demo_analyses").insert({ ...row, id, storage_path: storagePath });
    if (error) return NextResponse.json({ error: "save failed" }, { status: 500 });
  }
  // файл разбора приходит вторым запросом (PUT ?id=…): свой сервер Supabase не пускает в хранилище по одноразовой ссылке без ключа
  return NextResponse.json({ id, path: storagePath });
}

const MAX_BYTES = 4_000_000; // предел тела запроса Vercel — 4.5 МБ; разбор карты в gzip ~0.5–1.5 МБ

/** Файл разбора (gzip-JSON) → закрытое хранилище */
export async function PUT(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id") ?? "";
  if (!UUID.test(id)) return NextResponse.json({ error: "id" }, { status: 400 });
  const { data: row } = await db().from("demo_analyses").select("storage_path").eq("id", id).maybeSingle();
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > MAX_BYTES) return NextResponse.json({ error: "size" }, { status: 413 });
  if (body[0] !== 0x1f || body[1] !== 0x8b) return NextResponse.json({ error: "not gzip" }, { status: 400 });
  const { error } = await db().storage.from(ANALYSIS_BUCKET).upload(row.storage_path, body, { contentType: "application/gzip", upsert: true });
  if (error) return NextResponse.json({ error: "storage", detail: error.message }, { status: 500 });
  await db().from("demo_analyses").update({ size_bytes: body.length }).eq("id", id);
  return NextResponse.json({ ok: true });
}
