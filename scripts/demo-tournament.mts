// Демо-турнир «DEMO · CS Uka-2026» на сайте: создать участников и заявки, отыграть сетку событиями MatchZy
// и логом CS2 (как настоящий сервер), посмотреть состояние, удалить всё.
//
//   npm run demo -- seed               16 команд × 5 игроков, анкеты, заявки, документы, одобрение, check-in
//   npm run demo -- play [--fast]      жеребьёвка, сетка, вето и матчи (по умолчанию — вживую, ~10–12 минут)
//   npm run demo -- status             статус турнира, матчи и счёт
//   npm run demo -- cleanup            удалить все демо-данные и проверить, что ничего не осталось
//
// Читает .env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, MATCHZY_TOKEN). Боевая база — только с
// E2E_ALLOW_PROD=1. События уходят на DEMO_SITE_URL (по умолчанию https://tournament.f16-arena.kz).
import { existsSync, readFileSync } from "node:fs";
import { assertTestDatabase } from "./lib/prod-guard.mjs";

if (!existsSync(".env.local")) {
  console.error("Нет .env.local в текущей папке — запускайте из корня проекта, где лежит .env.local");
  process.exit(1);
}
for (const l of readFileSync(".env.local", "utf8").split(/\r?\n/).filter((x) => x && !x.startsWith("#") && x.includes("="))) {
  const i = l.indexOf("=");
  process.env[l.slice(0, i).trim()] ??= l.slice(i + 1).trim().replace(/^"(.*)"$/, "$1");
}
assertTestDatabase(process.env.SUPABASE_URL);

const { cleanupDemo, httpTransport, playDemo, seedDemo, statusDemo } = await import("./lib/demo-tournament");
const { signedLogQuery } = await import("../src/lib/server/ingest-signature");

const command = process.argv[2];
const fast = process.argv.includes("--fast");
const site = (process.env.DEMO_SITE_URL ?? "https://tournament.f16-arena.kz").replace(/\/$/, "");
const token = process.env.MATCHZY_TOKEN ?? "";

const options = { transport: httpTransport(site, token, signedLogQuery), fast, site };
try {
  if (command === "seed") await seedDemo(options);
  else if (command === "play") {
    if (!token) throw new Error("Нет MATCHZY_TOKEN в .env.local — без него сайт не примет события матчей");
    console.log(`События → ${site} (${fast ? "быстро" : "вживую"})`);
    await playDemo(options);
  } else if (command === "status") await statusDemo(options);
  else if (command === "cleanup") {
    const { total } = await cleanupDemo(options);
    if (total) process.exitCode = 1;
  } else {
    console.log("Команды: seed | play [--fast] | status | cleanup");
    process.exitCode = 2;
  }
} catch (e) {
  console.error(`\n✕ ${(e as Error).message}`);
  process.exitCode = 1;
}
