import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import { env } from "./env";

export type Db = SupabaseClient<Database>;

let client: Db | null = null;

/** Серверный клиент с service role. Никогда не импортировать в клиентские компоненты. */
export function db(): Db {
  if (!client) {
    client = createClient<Database>(env.supabaseUrl, env.supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
