"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ds";
import { useToast } from "./toast";
import { useT } from "@/lib/i18n/client";

/** Как на FACEIT: кнопка копирует «connect адрес; password …» — игрок вставляет в консоль CS2 (~) */
export function CopyConnect({ address, password, label, size = "lg", block }: { address: string; password?: string | null; label?: string; size?: "md" | "lg"; block?: boolean }) {
  const toast = useToast();
  const t = useT();
  const [copied, setCopied] = useState(false);
  const command = `connect ${address}${password ? `; password ${password}` : ""}`;
  return (
    <Button
      size={size}
      block={block}
      onClick={() =>
        navigator.clipboard.writeText(command).then(
          () => {
            setCopied(true);
            toast.success(t("Скопировано — вставьте в консоль CS2 (~)"));
            setTimeout(() => setCopied(false), 1600);
          },
          () => toast.error(t("Не удалось скопировать: {cmd}", { cmd: command })),
        )
      }
    >
      <Copy className="size-4" aria-hidden />
      {copied ? t("Скопировано") : (label ?? t("Скопировать IP"))}
    </Button>
  );
}
