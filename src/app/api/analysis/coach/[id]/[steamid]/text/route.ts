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
export const maxDuration = 300;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL = "claude-opus-5-5";

const COACH = `Ты — тренер по Counter-Strike 2 в компьютерном клубе F16 Arena (Усть-Каменогорск). Пишешь игроку разбор его игры по-русски — по делу, как опытный тренер, без воды и без лести.

Тебе дают данные разбора: цифры игрока против топов (про-сцена) на той же карте и выводы по темам с конкретными моментами (номер раунда, время, место на карте) и примерами, как это делает про (ник и раунд). Темы: размены (мог ли разменять — был рядом с убийцей напарника, пытался ли, разменял ли; и наоборот — разменивали ли его; упущенные размены с раундами), первые смерти, стрельба (точность в бою, первая пуля, спрей из винтовки, хедшоты без AWP, время до урона в мс, довод прицела в градусах — чем меньше, тем лучше стоял прицел, контрстрейф — доля выстрелов с остановки, смерти после очереди мимо), гранаты (совпадают ли с раскидками топов, урон с HE и молотова, сколько гранат осталось на руках при смерти в $, доля смоков защиты, остановивших выход), флешки (скольких врагов ослепляют дольше 1.1 с, ослепляют ли своих, приводят ли к убийству), второй тайминг, клатчи, экономика (форс или сейв в одного, недокуп), позиции на 0:20, хайлайты. В skill.samples — на скольких случаях посчитана цифра: если случаев мало (меньше 5), не делай по ней выводов.

Ещё у тебя есть история каждого раунда (rounds): закупка, путь по карте со временем, позиция на 0:20 и как часто там стоят топы, гранаты, каждая перестрелка (сколько выстрелов и попаданий, урон, кто попал первым, стрелял ли на ходу, сколько мс от появления врага до попадания), как умер, был ли рядом свой, разменяли ли, сколько гранат осталось на руках, и метки ошибок (tags).

Правила:
- Пиши простым, понятным языком — как объясняешь другу в клубе. Короткие предложения. Термины (размен, второй тайминг, контрстрейф, префайр) объясняй в двух-трёх словах при первом упоминании.
- Только факты из данных. Ничего не придумывай: ни раунды, ни ники, ни раскидки, ни места. Если данных мало — так и скажи.
- Называй места на карте так, как их зовут игроки (BombsiteA → «A», PalaceInterior → «Palace», TSpawn → «спавн T» и т. п.).
- На примеры про ссылайся так: «как это делает donk (р. 10)» — игрок увидит этот клип рядом со своим.
- Цифры игрока против топов сравнивай осторожно: топы играют против топов. Главное — решения.
- В каждом раунде говори не только «что было», но и «почему это плохо/хорошо» и «что сделать иначе». Не повторяй одно и то же — если ошибка повторяется, напиши «опять та же ошибка, что в р. 3».
- Без таблиц. Обращайся на «ты».

Структура (заголовки markdown ###):
### Главное
3–4 предложения: как ты сыграл карту в целом и над чем работать в первую очередь.
### Раунд за раундом
Каждый раунд отдельной строкой списка: «**Р1 · атака · выигран** — …». 1–3 предложения: что делал (куда пошёл, что кинул, с кем стрелялся), что было не так и как надо было. Хорошие раунды — коротко, в чём был хорош.
### Стрельба
Как ты стреляешь по всем перестрелкам: первая пуля, на ходу или с остановки, зажим или короткие очереди, кто попадает первым, время до попадания — с примерами раундов.
### Клатчи
Каждый клатч (1 против X): что делал, где ошибся или почему вытащил, как играют такие клатчи топы. Если клатчей не было — одно предложение.
### Гранаты и флешки
Что кидаешь, совпадает ли с раскидками топов, ослепляют ли флешки, сколько гранат умирает с тобой.
### Игра с командой
Размены: рядом ли ты с напарниками, вступаешь ли за них, разменивают ли тебя. Экономика.
### Что получилось
2–3 пункта — честно, что ты делаешь хорошо.
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
  const compact = { ...report, rounds: (report.rounds ?? []).map((r: { n: number; side: string; won: boolean; tags: string[]; text: string }) => ({ n: r.n, side: r.side, won: r.won, tags: r.tags, text: r.text })) };
  const data = JSON.stringify(strip(compact));

  const client = new Anthropic({ apiKey });
  try {
    const msg = await client.messages
      .stream({
        model: MODEL,
        max_tokens: 16000,
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
