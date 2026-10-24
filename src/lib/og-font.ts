import "server-only";

/**
 * Шрифт сайта (Inter Tight, F16 DS) для картинок next/og (встроенный шрифт — только латиница).
 * Берём статические файлы по начертаниям с Fontsource (jsDelivr): satori читает woff, а Google Fonts
 * отдаёт вариативный шрифт кусками — жирное начертание из него не применялось.
 * Если сеть недоступна — пустой список: вызывающий код рисует без своего шрифта.
 */
const BASE = "https://cdn.jsdelivr.net/fontsource/fonts/inter-tight@latest";
const NAME = "Inter Tight";
/**
 * fontFamily для картинок. Кириллица — отдельным семейством: с одним именем на два файла одного веса
 * satori брал недостающие глифы из кириллицы 400, и жирный русский текст выходил обычным.
 */
export const OG_FONT = `"${NAME}", "${NAME} Cyrillic"`;

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

async function file(subset: "latin" | "cyrillic", weight: 400 | 700): Promise<OgFont | null> {
  try {
    const res = await fetch(`${BASE}/${subset}-${weight}-normal.woff`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return { name: subset === "latin" ? NAME : `${NAME} Cyrillic`, data: await res.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

/** Inter Tight 400 и 700 (латиница + кириллица) */
export async function ogFonts(): Promise<OgFont[]> {
  const all = await Promise.all([file("latin", 400), file("cyrillic", 400), file("latin", 700), file("cyrillic", 700)]);
  return all.filter((f): f is OgFont => !!f);
}
