"use client";

import Link from "next/link";
import { useEffect } from "react";

/** Ошибка в F16 Control: операционное сообщение с кодом для журнала Vercel */
export default function AdminError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
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
    <div className="max-w-2xl rounded-surface border border-danger/30 bg-danger-dim/60 p-8">
      <div className="text-[14px] font-semibold text-danger">Ошибка раздела</div>
      <h1 className="mt-3 text-[26px] font-bold">Раздел не загрузился</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-fg-2">
        Скорее всего, временно недоступна база данных или в ней не применено обновление. Ваши данные и серверы это не затрагивает.
        Нажмите «Повторить». Если не помогло, сообщите разработчику код ниже.
      </p>
      {error.digest && <p className="mt-3 text-[13px] text-fg-3 num">Код ошибки: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-12 items-center rounded-control bg-accent px-6 text-[16px] font-semibold text-white hover:bg-accent-strong"
        >
          Повторить
        </button>
        <Link href="/admin" className="inline-flex h-12 items-center rounded-control bg-surface px-6 text-[16px] font-semibold text-fg shadow-[inset_0_0_0_1px_var(--color-line-strong)] hover:bg-surface-2">
          На главную панели
        </Link>
      </div>
    </div>
  );
}
