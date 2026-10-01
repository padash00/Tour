import "server-only";
import { env } from "./env";

const OPENID_ENDPOINT = "https://steamcommunity.com/openid/login";
const CLAIMED_ID_RE = /^https:\/\/steamcommunity\.com\/openid\/id\/(\d{17})$/;

export function steamLoginUrl(origin: string, next: string) {
  const returnTo = new URL("/api/auth/steam/callback", origin);
  if (next) returnTo.searchParams.set("next", next);
  const params = new URLSearchParams({
    "openid.ns": "http://specs.openid.net/auth/2.0",
    "openid.mode": "checkid_setup",
    "openid.return_to": returnTo.toString(),
    "openid.realm": origin,
    "openid.identity": "http://specs.openid.net/auth/2.0/identifier_select",
    "openid.claimed_id": "http://specs.openid.net/auth/2.0/identifier_select",
  });
  return `${OPENID_ENDPOINT}?${params}`;
}

/** Проверяет ответ Steam OpenID и возвращает SteamID64 или null. */
export async function verifySteamCallback(url: URL): Promise<string | null> {
  const q = url.searchParams;
  if (q.get("openid.mode") !== "id_res") return null;
  if (q.get("openid.op_endpoint") !== OPENID_ENDPOINT) return null;

  // return_to должен указывать на наш callback, иначе ответ мог быть выписан для другого сайта
  const returnTo = q.get("openid.return_to");
  if (!returnTo) return null;
  const rt = new URL(returnTo);
  if (rt.origin !== url.origin || rt.pathname !== url.pathname) return null;

  const match = CLAIMED_ID_RE.exec(q.get("openid.claimed_id") ?? "");
  if (!match) return null;

  const body = new URLSearchParams();
  for (const [k, v] of q) if (k.startsWith("openid.")) body.set(k, v);
  body.set("openid.mode", "check_authentication");

  const res = await fetch(OPENID_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    cache: "no-store",
  });
  const text = await res.text();
  return /is_valid\s*:\s*true/.test(text) ? match[1] : null;
}

export type SteamProfile = {
  /** false — Steam не ответил, данные заглушечные */
  ok: boolean;
  nickname: string;
  avatarUrl: string | null;
  profileUrl: string;
  country: string | null;
};

export async function fetchSteamProfile(steamId: string): Promise<SteamProfile> {
  const fallback: SteamProfile = {
    ok: false,
    nickname: steamId,
    avatarUrl: null,
    profileUrl: `https://steamcommunity.com/profiles/${steamId}`,
    country: null,
  };

  const key = env.steamApiKey;
  try {
    if (key) {
      const res = await fetch(
        `https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/?key=${key}&steamids=${steamId}`,
        { cache: "no-store" },
      );
      const data = await res.json();
      const p = data?.response?.players?.[0];
      if (p) {
        return {
          ok: true,
          nickname: p.personaname ?? steamId,
          avatarUrl: p.avatarfull ?? null,
          profileUrl: p.profileurl ?? fallback.profileUrl,
          country: p.loccountrycode ?? null,
        };
      }
    }
    // без ключа — публичный XML профиля
    const res = await fetch(`${fallback.profileUrl}?xml=1`, { cache: "no-store" });
    const xml = await res.text();
    const pick = (tag: string) =>
      new RegExp(`<${tag}><!\[CDATA\[([\s\S]*?)\]\]></${tag}>`).exec(xml)?.[1] ?? null;
    const nickname = pick("steamID");
    if (!nickname) return fallback;
    return { ...fallback, ok: true, nickname, avatarUrl: pick("avatarFull") };
  } catch {
    return fallback;
  }
}
