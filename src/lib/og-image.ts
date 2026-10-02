import "server-only";

/**
 * Картинка для next/og (satori понимает только PNG/JPEG/GIF/SVG — обложки карт у нас бывают webp).
 * Скачиваем и перекодируем в JPEG нужной ширины через sharp (идёт вместе с Next.js), отдаём data URL.
 * Не получилось — null: вызывающий рисует фон-оттенок вместо обложки.
 */
const cache = new Map<string, Promise<string | null>>();

export function ogImage(url: string | null | undefined, width = 1080): Promise<string | null> {
  if (!url) return Promise.resolve(null);
  const key = `${width}:${url}`;
  if (!cache.has(key)) {
    cache.set(
      key,
      (async () => {
        try {
          const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 86400 } });
          if (!res.ok) return null;
          const input = Buffer.from(await res.arrayBuffer());
          const sharp = (await import("sharp")).default;
          const out = await sharp(input).resize({ width, withoutEnlargement: true }).jpeg({ quality: 78 }).toBuffer();
          return `data:image/jpeg;base64,${out.toString("base64")}`;
        } catch {
          return null;
        }
      })(),
    );
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
  }
  return cache.get(key)!;
}

/** Размеры картинок для соцсетей: пост Instagram 4:5, сторис 9:16, широкая — превью ссылки */
export const OG_FORMATS = {
  post: { width: 1080, height: 1350 },
  story: { width: 1080, height: 1920 },
  wide: { width: 1200, height: 630 },
} as const;
export type OgFormat = keyof typeof OG_FORMATS;
export const ogFormat = (f: string | null): OgFormat => (f === "story" || f === "wide" ? f : "post");
