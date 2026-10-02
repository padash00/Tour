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
    <div className="max-w-2xl rounded-[12px] border border-danger/30 bg-danger/[0.05] p-8">
      <div className="text-[11px] font-medium uppercase tracking-[0.3em] text-danger">Ошибка раздела</div>
      <h1 className="mt-3 text-[22px] font-semibold">Раздел не загрузился</h1>
      <p className="mt-3 text-[14px] leading-relaxed text-fg-2">
        Чаще всего причина — недоступна база (Supabase) или в базе не применена новая миграция. Данные и сервера это не затрагивает.
        Повторите; если не помогло — проверьте журнал функций в Vercel по коду ниже.
      </p>
      {error.digest && <p className="mt-3 text-[12px] text-fg-3 num">digest: {error.digest}</p>}
      <div className="mt-6 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="inline-flex h-9 items-center rounded-[8px] bg-accent px-4 text-[13px] font-semibold text-[#07101b] hover:bg-accent-strong"
        >
          Повторить
        </button>
        <Link href="/admin" className="inline-flex h-9 items-center rounded-[8px] border border-white/20 px-4 text-[13px] text-fg hover:border-white/40">
          К обзору
        </Link>
      </div>
    </div>
  );
}
