import type { Metadata } from "next";
import { Suspense } from "react";
import { OverlayView } from "@/components/overlay/overlay-view";

export const metadata: Metadata = { title: "Оверлей трансляции", robots: { index: false, follow: false } };

/**
 * Оверлей для OBS (Источник → Браузер, 1920×1080): счёт матча поверх картинки GOTV.
 * Страница статичная — параметры (?server= / ?match= / ?tournament=, theme, scale, idle, lower) читает клиент,
 * данные — /api/public/overlay раз в 2 секунды. Шапки и подвала сайта нет (noChrome), фон прозрачный только здесь.
 */
export default function OverlayPage() {
  return (
    <Suspense fallback={null}>
      <OverlayView />
    </Suspense>
  );
}
