// Прописывает переменные окружения в Vercel-проект, добавляет домен и перезапускает прод-деплой.
// Значения берёт из .env.local. SESSION_SECRET генерирует, если его ещё нет.
// Запуск: VERCEL_TOKEN=... node scripts/setup-vercel.mjs [SteamID64 админа]
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";

const REPO = "padash00/Tour";
const DOMAIN = "tournament.f16-arena.kz";
const token = process.env.VERCEL_TOKEN;
if (!token) {
  console.error("Нет VERCEL_TOKEN");
  process.exit(1);
}

const api = async (path, init = {}) => {
  const r = await fetch(`https://api.vercel.com${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
  });
  const body = await r.json().catch(() => ({}));
  return { ok: r.ok, status: r.status, body };
};

// ── .env.local
const env = {};
const lines = existsSync(".env.local") ? readFileSync(".env.local", "utf8").split(/\r?\n/).filter(Boolean) : [];
for (const l of lines) {
  const i = l.indexOf("=");
  env[l.slice(0, i)] = l.slice(i + 1);
}
if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("В .env.local нет ключей Supabase — сначала scripts/apply-migrations.mjs");
  process.exit(1);
}
if (!env.SESSION_SECRET) {
  env.SESSION_SECRET = randomBytes(48).toString("base64url");
  writeFileSync(".env.local", [...lines, `SESSION_SECRET=${env.SESSION_SECRET}`].join("\n") + "\n");
}
const adminArg = process.argv[2];
if (adminArg) env.ADMIN_STEAM_IDS = adminArg;

// ── ищем проект, подключённый к репозиторию, во всех доступных командах
const teams = (await api("/v2/teams")).body.teams ?? [];
const scopes = [null, ...teams.map((t) => t.id)];
let project = null;
let teamId = null;
for (const scope of scopes) {
  const q = scope ? `&teamId=${scope}` : "";
  const res = await api(`/v9/projects?limit=100${q}`);
  const found = (res.body.projects ?? []).find(
    (p) => `${p.link?.org}/${p.link?.repo}`.toLowerCase() === REPO.toLowerCase(),
  );
  if (found) {
    project = found;
    teamId = scope;
    break;
  }
}
if (!project) {
  console.error(`Не нашёл Vercel-проект, подключённый к ${REPO}. Команды токена:`, teams.map((t) => t.slug).join(", ") || "личный аккаунт");
  process.exit(1);
}
const tq = teamId ? `?teamId=${teamId}` : "";
const tqa = teamId ? `&teamId=${teamId}` : "";
console.log(`✓ проект: ${project.name}${teamId ? ` (команда ${teams.find((t) => t.id === teamId)?.slug})` : ""}`);

// ── переменные окружения
const keys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SESSION_SECRET", "STEAM_API_KEY", "FACEIT_API_KEY", "ADMIN_STEAM_IDS"];
const payload = keys
  .filter((k) => env[k])
  .map((k) => ({ key: k, value: env[k], type: "encrypted", target: ["production", "preview", "development"] }));
const envRes = await api(`/v10/projects/${project.id}/env?upsert=true${tqa}`, {
  method: "POST",
  body: JSON.stringify(payload),
});
if (!envRes.ok) {
  console.error("Ошибка записи переменных:", envRes.status, JSON.stringify(envRes.body));
  process.exit(1);
}
console.log("✓ переменные:", payload.map((p) => p.key).join(", "));

// ── домен
const dom = await api(`/v10/projects/${project.id}/domains${tq}`, { method: "POST", body: JSON.stringify({ name: DOMAIN }) });
if (dom.ok) console.log(`✓ домен ${DOMAIN} добавлен${dom.body.verified === false ? " (нужна проверка DNS)" : ""}`);
else console.log(`домен: ${dom.body.error?.code ?? dom.status} ${dom.body.error?.message ?? ""}`);

// ── редеплой последнего прод-деплоя
const deps = await api(`/v6/deployments?projectId=${project.id}&target=production&limit=1${tqa}`);
const last = deps.body.deployments?.[0];
if (!last) {
  console.log("Прод-деплоев нет — следующий push в main задеплоит с новыми переменными");
} else {
  const re = await api(`/v13/deployments?forceNew=1${tqa}`, {
    method: "POST",
    body: JSON.stringify({ name: project.name, deploymentId: last.uid, target: "production" }),
  });
  if (re.ok) console.log(`✓ редеплой запущен: https://${re.body.url}`);
  else console.log("Редеплой не запустился:", re.status, JSON.stringify(re.body.error ?? re.body));
}
