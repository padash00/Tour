"use client";

import { buttonClass } from "@/components/ui";

/** Печать страницы (в диалоге печати браузера — «Сохранить как PDF») */
export function PrintButton({ children = "Печать / сохранить PDF" }: { children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "md")}>
      {children}
    </button>
  );
}
