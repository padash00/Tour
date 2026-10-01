import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // логотип команды до 1 МБ + поля формы
      bodySizeLimit: "2mb",
    },
  },
  // файлы серверного ПК (агент, скрипты, конфиги CS2) раздаются агенту с сайта
  outputFileTracingIncludes: {
    "/api/agent/bundle": ["./server/**/*"],
    "/api/agent/sync": ["./server/**/*"],
  },
};

export default nextConfig;
