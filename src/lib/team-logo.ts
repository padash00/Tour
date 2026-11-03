import "server-only";
import { db } from "./supabase";
import { sniffImage } from "./data";
import type { T } from "./i18n/core";

/** Загрузка логотипа команды в хранилище team-logos. null — файла нет; { error } — не подошёл */
export async function uploadTeamLogo(teamId: string, file: File | null, t: T): Promise<string | null | { error: string }> {
  if (!file || file.size === 0) return null;
  if (file.size > 1024 * 1024) return { error: t("Логотип — не больше 1 МБ") };
  // тип определяем по содержимому файла, а не по заявленному браузером
  const bytes = Buffer.from(await file.arrayBuffer());
  const type = sniffImage(bytes);
  if (!type) return { error: t("Логотип — PNG, JPG или WEBP") };
  const ext = type === "image/png" ? "png" : type === "image/webp" ? "webp" : "jpg";
  const path = `${teamId}/${Date.now()}.${ext}`;
  const { error } = await db().storage.from("team-logos").upload(path, bytes, { contentType: type, upsert: true });
  if (error) return { error: t("Не удалось загрузить логотип") };
  return db().storage.from("team-logos").getPublicUrl(path).data.publicUrl;
}
