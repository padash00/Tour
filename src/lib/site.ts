/** Публичный адрес сайта: для metadataBase, sitemap, robots и OG-картинок */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://tournament.f16-arena.kz")
).replace(/\/$/, "");
