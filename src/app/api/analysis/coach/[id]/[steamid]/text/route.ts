import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { ANALYSIS_BUCKET, canViewCoach, coachFile } from "@/lib/analysis";
import { getSetting } from "@/lib/settings";
import { db } from "@/lib/supabase";

/*
 * ИИ-тренер: по разбору игрока против топов (coach.mjs) Claude пишет разбор по-русски — главное, ошибки с раундами
 * и примером про, что хорошо, план на следующую игру. Только факты из разбора. Текст кэшируется в хранилище.
 * GET — готовый текст (или null), POST — написать. Видят сам игрок и админы; игрок пишет один раз, переписывает админ.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = "claude-opus-5-5";

const COACH = `Ты — тренер по Counter-Strike 2 в компьютерном клубе F16 Arena (Усть-Каменогорск). Пишешь игроку разбор его игры по-русски — по делу, как опытный тренер, без воды и без лести.

Тебе дают данные разбора: цифры игрока против топов (про-сцена) на той же карте и выводы по темам с конкретными моментами (номер раунда, время, место на карте) и примерами, как это делает про (ник и раунд).

Правила:
- Только факты из данных. Ничего не придумывай: ни раунды, ни ники, ни раскидки, ни места. Если данных мало — так и скажи.
- Называй места на карте так, как их зовут игроки (Bombsite A → «A», Palace Interior → «Palace» и т. п.).
- Ссылайся на моменты: «р. 7, 0:22». На примеры про: «как это делает donk (р. 10)» — игрок увидит этот клип рядом со своим.
- Цифры игрока против топов сравнивай осторожно: топы играют против топов, а игрок — против своих соперников. Главное — как он принимает решения.
- Пиши коротко: 350–550 слов. Без таблиц. Обращайся на «ты».

Структура (заголовки markdown ###):
### Главное
2–3 предложения: что в этой игре решало и над чем работать в первую очередь.
### Ошибки
3–5 пунктов по важности. В каждом: что произошло (раунды), почему это плохо, как делают топы, что делать в следующий раз.
### Что получилось
1–3 пункта — честно, что игрок делает хорошо.
### План на следующую игру
3 конкретных пункта, которые можно проверить в следующем матче.`;

async function auth(ctx: RouteContext<"/api/analysis/coach/[id]/[steamid]/text">) {
  const me = await getCurrentPlayer();
  const { id, steamid } = await ctx.params;
  if (!UUID.test(id) || !/^\d{17}$/.test(steamid) || !canViewCoach(steamid, me)) return null;
  return { id, steamid, path: `coach/${id}-${steamid}.text.json`, admin: isAdmin(me) };
}

export async function GET(_req: NextRequest, ctx: RouteContext<"/api/analysis/coach/[id]/[steamid]/text">) {
  const a = await auth(ctx);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  const { data } = await db().storage.from(ANALYSIS_BUCKET).download(a.path);
  if (!data) return NextResponse.json({ text: null });
  return NextResponse.json(JSON.parse(await data.text()), { headers: { "Cache-Control": "private, no-store" } });
}

export async function POST(_req: NextRequest, ctx: RouteContext<"/api/analysis/coach/[id]/[steamid]/text">) {
  const a = await auth(ctx);
  if (!a) return NextResponse.json({ error: "not found" }, { status: 404 });
  // игрок пишет разбор один раз (ИИ платный); переписать может только админ
  if (!a.admin) {
    const { data: existing } = await db().storage.from(ANALYSIS_BUCKET).download(a.path);
    if (existing) return NextResponse.json(JSON.parse(await existing.text()));
  }
  const apiKey = await getSetting("ANTHROPIC_API_KEY");
  if (!apiKey) return NextResponse.json({ error: "Нет ключа ANTHROPIC_API_KEY в настройках" }, { status: 400 });
  const file = await coachFile(a.id, a.steamid);
  if (!file) return NextResponse.json({ error: "Разбор игрока не найден" }, { status: 404 });
  const report = JSON.parse(new TextDecoder().decode(await new Response(file.stream().pipeThrough(new DecompressionStream("gzip"))).arrayBuffer()));

  // компактные данные для модели: без служебных id разборов
  const strip = (o: unknown): unknown =>
    Array.isArray(o) ? o.map(strip) : o && typeof o === "object" ? Object.fromEntries(Object.entries(o).filter(([k]) => !["analysis", "t", "t1", "end", "steamid", "index", "lineup"].includes(k)).map(([k, v]) => [k, strip(v)])) : o;
  const data = JSON.stringify(strip(report));

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 6000,
        output_config: { effort: "medium" },
        system: [{ type: "text", text: COACH, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: `Разбор игры игрока ${report.player?.name} на ${String(report.map).replace(/^de_/, "")}. Данные:\n${data}` }],
      })
      .finalMessage();
    if (msg.stop_reason === "refusal") return NextResponse.json({ error: "Модель отказалась отвечать" }, { status: 502 });
    const text = msg.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    if (!text) return NextResponse.json({ error: "Пустой ответ модели" }, { status: 502 });
    const out = { text, model: MODEL, at: new Date().toISOString() };
    await db().storage.from(ANALYSIS_BUCKET).upload(a.path, new Blob([JSON.stringify(out)], { type: "application/json" }), { contentType: "application/json", upsert: true });
    return NextResponse.json(out);
  } catch (e) {
    console.error("coach text", e);
    return NextResponse.json({ error: e instanceof Error ? e.message.slice(0, 200) : "Ошибка ИИ" }, { status: 502 });
  }
}
