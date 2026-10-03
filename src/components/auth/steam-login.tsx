"use client";

import { useState } from "react";
import { SteamMark } from "@/components/ds/icons";
import { Spinner, buttonClass, cn } from "@/components/ds";

/**
 * Кнопка входа через Steam. После нажатия — «Переходим в Steam…», кнопка занята (повторный клик не уходит).
 * Обычная ссылка: работает и без JavaScript.
 */
export function SteamLoginButton({ href }: { href: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <a
      href={href}
      onClick={(e) => {
        if (busy) e.preventDefault();
        setBusy(true);
      }}
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      className={cn(buttonClass("primary", "lg", "w-full"), busy && "pointer-events-none opacity-80")}
    >
      {busy ? <Spinner className="size-5" /> : <SteamMark className="size-5" />}
      {busy ? "Переходим в Steam…" : "Войти через Steam"}
    </a>
  );
}
