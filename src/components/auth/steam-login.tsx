"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/client";
import { SteamMark } from "@/components/ds/icons";
import { Spinner, buttonClass, cn } from "@/components/ds";

/**
 * Кнопка входа через Steam. После нажатия — «Переходим в Steam…», кнопка занята (повторный клик не уходит).
 * Обычная ссылка: работает и без JavaScript.
 */
export function SteamLoginButton({ href }: { href: string }) {
  const t = useT();
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
      {busy ? t("Переходим в Steam…") : t("Войти через Steam")}
    </a>
  );
}
