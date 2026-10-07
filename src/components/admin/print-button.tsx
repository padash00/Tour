"use client";

import { Printer } from "lucide-react";
import { buttonClass } from "@/components/ui";

/** Печать страницы (в диалоге печати можно выбрать «Сохранить как PDF») */
export function PrintButton({ label = "Печать / сохранить PDF" }: { label?: string }) {
  return (
    <button type="button" onClick={() => window.print()} className={buttonClass("primary", "sm")}>
      <Printer className="mr-1.5 size-4" aria-hidden />
      {label}
    </button>
  );
}
