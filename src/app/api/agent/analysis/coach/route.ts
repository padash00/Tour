import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_BUCKET } from "@/lib/analysis";
import { notify } from "@/lib/audit";
import { checkBearer } from "@/lib/server/state";
import { db } from "@/lib/supabase";

/*
 * Разбор игрока (server/analyzer/coach.mjs): gzip-JSON → закрытое хранилище coach/<разбор>-<steamid>.json.gz.
 * Первый раз для этой карты и игрока — игроку уведомление на сайте и в Telegram: 2–3 главные вещи и ссылка на разбор.
 * Повторная загрузка (пересборка) — без уведомления; ?notify=0 — тоже без.
 */
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pair = [number | null, number | null];
type Report = {
  map?: string;
  stats?: { kpr?: Pair; adr?: Pair };
  skill?: { firstBullet?: Pair; tradeAttempt?: Pair };
  rounds?: { n: number; won: boolean; tags: string[] }[];
  highlights?: { title: string }[];
};

/** Короткий итог карты простыми словами — для уведомления */
function summary(r: Report) {
  const lines: string[] = [];
  const rounds = r.rounds ?? [];
  const won = rounds.filter((x) => x.won).length;
  const adr = r.stats?.adr?.[0];
  if (rounds.length) lines.push(`Раундов ${rounds.length}, твоя команда выиграла ${won}${adr != null ? ` · урон за раунд ${adr}` : ""}.`);
  // самая частая ошибка — с номерами раундов
  const BAD = ["смерть без размена", "умер первым", "упустил размен", "умер после очереди мимо", "флешка по своим", "форс в одного"];
  const counts = BAD.map((tag) => ({ tag, list: rounds.filter((x) => x.tags.includes(tag)).map((x) => x.n) })).filter((x) => x.list.length).sort((a, b) => b.list.length - a.list.length);
  if (counts[0]) lines.push(`Главное исправить: ${counts[0].tag} — раунды ${counts[0].list.slice(0, 5).join(", ")}.`);
  const fb = r.skill?.firstBullet;
  if (fb?.[0] != null && fb[1] != null) lines.push(`Первая пуля попадает в ${fb[0]}% (у топов ${fb[1]}%).`);
  const hl = r.highlights?.[0];
  if (hl) lines.push(`Лучший момент: ${hl.title}.`);
  return lines.join("\n");
}

export async function PUT(request: NextRequest) {
  if (!checkBearer(request, "AGENT_TOKEN")) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const analysis = request.nextUrl.searchParams.get("analysis") ?? "";
  const steamid = request.nextUrl.searchParams.get("steamid") ?? "";
  if (!UUID.test(analysis) || !/^\d{17}$/.test(steamid)) return NextResponse.json({ error: "params" }, { status: 400 });
  const body = new Uint8Array(await request.arrayBuffer());
  if (!body.length || body.length > 4_000_000 || body[0] !== 0x1f || body[1] !== 0x8b) return NextResponse.json({ error: "body" }, { status: 400 });
  const name = `${analysis}-${steamid}.json.gz`;
  const store = db().storage.from(ANALYSIS_BUCKET);
  const { data: before } = await store.list("coach", { search: name, limit: 1 });
  const first = !(before ?? []).some((f) => f.name === name);
  const { error } = await store.upload(`coach/${name}`, body, { contentType: "application/gzip", upsert: true });
  if (error) return NextResponse.json({ error: "storage", detail: error.message }, { status: 500 });

  let notified = false;
  if (first && request.nextUrl.searchParams.get("notify") !== "0") {
    try {
      const { data: player } = await db().from("players").select("id").eq("steam_id", steamid).maybeSingle();
      if (player) {
        const report = JSON.parse(new TextDecoder().decode(await new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer())) as Report;
        const map = String(report.map ?? "").replace(/^de_/, "");
        await notify([player.id], `Разбор твоей игры на ${map || "карте"} готов`, summary(report), `/analysis/${analysis}/player/${steamid}`);
        notified = true;
      }
    } catch (e) {
      console.error("coach notify", e);
    }
  }
  return NextResponse.json({ ok: true, notified });
}
