"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/components/ds";
import { LANG_COOKIE, type Lang } from "@/lib/i18n/core";
import { useLang } from "@/lib/i18n/client";

const OPTIONS: { lang: Lang; label: string; title: string }[] = [
  { lang: "kk", label: "ҚАЗ", title: "Қазақ тілі" },
  { lang: "ru", label: "РУС", title: "Русский язык" },
];

function saveLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
}

/** Переключатель ҚАЗ / РУС: запоминается в cookie на год, страница перерисовывается на сервере */
export function LangSwitch({ className }: { className?: string }) {
  const lang = useLang();
  const router = useRouter();
  const [pending, start] = useTransition();
  const pick = (l: Lang) => {
    if (l === lang) return;
    saveLang(l);
    start(() => router.refresh());
  };
  return (
    <div role="group" aria-label="Тіл / Язык" className={cn("inline-flex h-9 shrink-0 items-center rounded-full bg-ink/[0.05] p-0.5", pending && "opacity-60", className)}>
      {OPTIONS.map((o) => (
        <button
          key={o.lang}
          type="button"
          title={o.title}
          aria-pressed={o.lang === lang}
          onClick={() => pick(o.lang)}
          className={cn(
            "h-8 rounded-full px-2.5 text-[12.5px] font-bold tracking-wide transition-colors",
            o.lang === lang ? "bg-surface text-fg shadow-[0_1px_2px_rgba(0,0,0,0.08)]" : "text-fg-3 hover:text-fg",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
