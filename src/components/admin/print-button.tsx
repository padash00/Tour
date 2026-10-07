"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Печать страницы (в диалоге печати браузера — «Сохранить как PDF») */
export function PrintButton({ label, children }: { label?: string; children?: React.ReactNode }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "sm")}>
      <Printer className="mr-1.5 size-4" aria-hidden />
      {children ?? label ?? "Печать / сохранить PDF"}
    </button>
  );
}
