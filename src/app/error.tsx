"use client";

import { useEffect } from "react";
import { Button, Container, Eyebrow } from "@/components/ds";

/** признаки «вкладка открыта на старой версии сайта» после выкладки */
const STALE_BUILD = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Minified React error #306|Failed to find Server Action|reading 'call'/i;

/** Ошибка на странице: спокойное сообщение без технических деталей */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    // сайт обновился, а вкладка держит старую версию (ChunkLoadError, React #306 — модуль не найден):
    // один раз перезагружаем страницу — она подхватит новую версию; повтор в течение минуты не зацикливает
    if (STALE_BUILD.test(String(error.message ?? error))) {
      try {
        const last = Number(sessionStorage.getItem("f16-stale-reload") ?? 0);
        if (Date.now() - last > 60_000) {
          sessionStorage.setItem("f16-stale-reload", String(Date.now()));
          location.reload();
          return;
        }
      } catch {}
    }
    console.error(error);
    // ошибки сервера (с digest) уже записаны в журнал на сервере — шлём только браузерные
    if (!error.digest) {
      fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: String(error.message ?? error), path: location.pathname + location.search }),
        keepalive: true,
      }).catch(() => {});
    }
  }, [error]);

  return (
    <Container className="py-24 sm:py-32 lg:py-40">
      <Eyebrow>Ошибка</Eyebrow>
      <h1 className="mt-5 text-[36px] font-semibold tracking-[-0.025em] text-fg sm:text-[48px]">Что-то пошло не так</h1>
      <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-fg-2">
        Страница не загрузилась. Попробуйте ещё раз — если ошибка повторится, сообщите администратору турнира.
      </p>
      {error.digest && <p className="mt-3 text-[13px] text-fg-3 num">Код: {error.digest}</p>}
      <div className="mt-10 flex flex-wrap gap-4">
        <Button onClick={() => retry()} size="lg" className="min-w-[220px]">
          Попробовать снова
        </Button>
        <Button href="/" variant="secondary" size="lg" className="min-w-[180px]">
          На главную
        </Button>
      </div>
    </Container>
  );
}
