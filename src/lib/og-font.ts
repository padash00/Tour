import "server-only";

/**
 * Шрифт сайта (JetBrains Mono, F16 DS) для картинок next/og (встроенный шрифт — только латиница).
 * Берём статические файлы по начертаниям с Fontsource (jsDelivr): satori читает woff, а Google Fonts
 * отдаёт вариативный шрифт кусками — жирное начертание из него не применялось.
 * Если сеть недоступна — пустой список: вызывающий код рисует без своего шрифта.
 */
const BASE = "https://cdn.jsdelivr.net/fontsource/fonts/jetbrains-mono@latest";
/** имя семейства для fontFamily в картинках */
export const OG_FONT = "JetBrains Mono";

export type OgFont = { name: string; data: ArrayBuffer; weight: 400 | 700; style: "normal" };

async function file(subset: "latin" | "cyrillic", weight: 400 | 700): Promise<OgFont | null> {
  try {
    const res = await fetch(`${BASE}/${subset}-${weight}-normal.woff`, { next: { revalidate: 86400 } });
    if (!res.ok) return null;
    return { name: OG_FONT, data: await res.arrayBuffer(), weight, style: "normal" };
  } catch {
    return null;
  }
}

/** JetBrains Mono 400 и 700 (латиница + кириллица) */
export async function ogFonts(): Promise<OgFont[]> {
  const all = await Promise.all([file("latin", 400), file("cyrillic", 400), file("latin", 700), file("cyrillic", 700)]);
  return all.filter((f): f is OgFont => !!f);
}
