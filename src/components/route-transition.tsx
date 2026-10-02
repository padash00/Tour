"use client";

import { usePathname } from "next/navigation";
import { ViewTransition, type ReactNode } from "react";

/**
 * Плавная смена страниц сайта (View Transitions API через React <ViewTransition>).
 * Ключ — путь: при переходе на другую страницу старая быстро гаснет, новая мягко поднимается.
 * router.refresh() (живое обновление) путь не меняет — анимации нет; default="none" глушит
 * анимацию при обычных обновлениях содержимого. Браузер без поддержки просто меняет страницу.
 * В пульте F16 Control переходов нет — там важна скорость.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname.startsWith("/admin")) return <>{children}</>;
  return (
    <ViewTransition key={pathname} enter="page-in" exit="page-out" default="none">
      {children}
    </ViewTransition>
  );
}
