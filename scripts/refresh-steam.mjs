// Обновляет ник и аватар игрока из публичного Steam-профиля. Ключи — из .env.local.
// Запуск: node scripts/refresh-steam.mjs <SteamID64>
import { readFileSync } from "node:fs";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const steamId = process.argv[2];
if (!/^\d{17}$/.test(steamId ?? "")) {
  console.error("Укажите SteamID64");
  process.exit(1);
}

const xml = await (await fetch(`https://steamcommunity.com/profiles/${steamId}?xml=1`)).text();
const pick = (tag) => {
  const start = xml.indexOf(`<${tag}><![CDATA[`);
  if (start < 0) return null;
  const from = start + tag.length + 11;
  return xml.slice(from, xml.indexOf("]]>", from));
};
const body = { nickname: pick("steamID"), avatar_url: pick("avatarFull") };
if (!body.nickname) {
  console.error("Профиль не прочитан");
  process.exit(1);
}

const res = await fetch(`${env.SUPABASE_URL}/rest/v1/players?steam_id=eq.${steamId}`, {
  method: "PATCH",
  headers: {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
    Prefer: "return=representation",
  },
  body: JSON.stringify(body),
});
const [p] = await res.json();
console.log(`✓ ${p.nickname} · аватар: ${p.avatar_url ? "да" : "нет"} · админ: ${p.is_admin}`);
