"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Eyebrow, WRAP, btnClass } from "@/components/primitives";

/** Ошибка на странице: спокойное сообщение без технических деталей */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className={`${WRAP} py-28 lg:py-40`}>
      <Eyebrow>Ошибка</Eyebrow>
      <h1 className="t-h1 mt-6">Что-то пошло не так</h1>
      <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-fg-2">
        Страница не загрузилась. Попробуйте ещё раз — если ошибка повторится, сообщите администратору турнира.
      </p>
      {error.digest && <p className="mt-3 text-[13px] text-fg-3 num">Код: {error.digest}</p>}
      <div className="mt-10 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className={btnClass("primary", "lg", "min-w-[220px]")}
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className={btnClass("outline", "lg", "min-w-[180px]")}
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
