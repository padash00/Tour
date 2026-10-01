// Выдаёт права администратора игроку. Ключи берёт из .env.local.
// Запуск: node scripts/make-admin.mjs <SteamID64 | ник>   (без аргумента — последний вошедший игрок)
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const headers = {
  apikey: env.SUPABASE_SERVICE_ROLE_KEY,
  Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
  "Content-Type": "application/json",
  Prefer: "return=representation",
};
const rest = `${env.SUPABASE_URL}/rest/v1/players`;

const who = process.argv[2];
const filter = !who
  ? "order=last_login_at.desc.nullslast&limit=1"
  : /^\d{17}$/.test(who)
    ? `steam_id=eq.${who}`
    : `nickname=ilike.${encodeURIComponent(who)}`;

const players = await (await fetch(`${rest}?select=id,nickname,steam_id,is_admin&${filter}`, { headers })).json();
if (!Array.isArray(players) || players.length !== 1) {
  console.error("Игрок не найден или найдено несколько:", players);
  process.exit(1);
}
const [p] = players;
await fetch(`${rest}?id=eq.${p.id}`, { method: "PATCH", headers, body: JSON.stringify({ is_admin: true }) });
console.log(`✓ ${p.nickname} (${p.steam_id}) — администратор`);
