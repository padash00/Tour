"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Ошибка на странице: спокойное сообщение без технических деталей */
export default function ErrorPage({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto w-full max-w-[1440px] px-5 sm:px-8 lg:px-16 py-28 lg:py-40">
      <div className="text-[12px] font-medium uppercase tracking-[0.34em] text-[#7f93b0]">Ошибка</div>
      <h1 className="mt-6 text-[40px] lg:text-[56px] font-semibold leading-[1.05] tracking-[-0.015em]">Что-то пошло не так</h1>
      <p className="mt-6 max-w-[560px] text-[17px] leading-relaxed text-fg-2">
        Страница не загрузилась. Попробуйте ещё раз — если ошибка повторится, сообщите администратору турнира.
      </p>
      {error.digest && <p className="mt-3 text-[13px] text-fg-3 num">Код: {error.digest}</p>}
      <div className="mt-10 flex flex-wrap gap-4">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-[52px] min-w-[220px] items-center justify-center rounded-[8px] bg-accent px-8 text-[15px] font-semibold text-[#07101b] transition-colors hover:bg-accent-strong"
        >
          Попробовать снова
        </button>
        <Link
          href="/"
          className="inline-flex h-[52px] min-w-[180px] items-center justify-center rounded-[8px] border border-white/25 px-8 text-[15px] font-semibold text-fg transition-colors hover:border-white/45"
        >
          На главную
        </Link>
      </div>
    </div>
  );
}
