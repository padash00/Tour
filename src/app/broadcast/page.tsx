import type { Metadata } from "next";
import { Suspense } from "react";
import { BroadcastView } from "@/components/broadcast/broadcast-view";

export const metadata: Metadata = { title: "Экран перерыва", robots: { index: false, follow: false } };

/**
 * Экран перерыва для OBS (Источник → Браузер, 1920×1080): сетка, расписание, идущие матчи и лидеры турнира
 * на фирменном фоне — между картами и матчами. Страница статичная — параметры
 * (?tournament= / scene / interval / lower / footer) читает клиент, данные — /api/public/broadcast.
 * Шапки и подвала сайта нет (noChrome).
 */
export default function BroadcastPage() {
  return (
    <Suspense fallback={null}>
      <BroadcastView />
    </Suspense>
  );
}
