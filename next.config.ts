import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  // Скрипты и стили не ограничиваем (инлайн-скрипты Next, встраивание трансляций): только то, что ничего не ломает —
  // запрет встраивания сайта, плагинов, подмены <base> и отправки форм на чужие адреса (вход Steam — переход, не форма)
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self' https://steamcommunity.com",
  },
];

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // картинки до 3 МБ (обложка турнира, карты, логотип) + поля формы; у Vercel предел тела запроса 4,5 МБ
      bodySizeLimit: "4mb",
    },
  },
  // файлы серверного ПК (агент, скрипты, конфиги CS2) раздаются агенту с сайта
  outputFileTracingIncludes: {
    "/api/agent/bundle": ["./server/**/*"],
    "/api/agent/sync": ["./server/**/*"],
    // логотип для OG-картинки читается с диска
    "/opengraph-image": ["./public/brand/png/f16-arena-horizontal-3200.png"],
  },
  images: {
    remotePatterns: [
      // аватары Steam
      { protocol: "https", hostname: "avatars.steamstatic.com" },
      { protocol: "https", hostname: "avatars.akamai.steamstatic.com" },
      { protocol: "https", hostname: "avatars.cloudflare.steamstatic.com" },
      { protocol: "https", hostname: "steamcdn-a.akamaihd.net" },
      // обложки турниров, логотипы команд, картинки карт (Supabase Storage)
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
