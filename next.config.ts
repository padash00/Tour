import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      // логотип команды до 1 МБ + поля формы
      bodySizeLimit: "2mb",
    },
  },
};

export default nextConfig;
