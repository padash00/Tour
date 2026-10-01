import "server-only";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Не задана переменная окружения ${name}`);
  return value;
}

export const env = {
  get supabaseUrl() {
    return required("SUPABASE_URL");
  },
  get supabaseServiceKey() {
    return required("SUPABASE_SERVICE_ROLE_KEY");
  },
  get sessionSecret() {
    return new TextEncoder().encode(required("SESSION_SECRET"));
  },
  get steamApiKey() {
    return process.env.STEAM_API_KEY ?? null;
  },
  get faceitApiKey() {
    return process.env.FACEIT_API_KEY ?? null;
  },
  /** SteamID64 администраторов через запятую */
  get adminSteamIds() {
    return (process.env.ADMIN_STEAM_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  },
};
