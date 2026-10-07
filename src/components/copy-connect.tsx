"use client";

import { Copy } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ds";
import { useToast } from "./toast";

/** Как на FACEIT: кнопка копирует «connect адрес; password …» — игрок вставляет в консоль CS2 (~) */
export function CopyConnect({ address, password, label = "Скопировать IP", size = "lg", block }: { address: string; password?: string | null; label?: string; size?: "md" | "lg"; block?: boolean }) {
  const toast = useToast();
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
            toast.success("Скопировано — вставьте в консоль CS2 (~)");
            setTimeout(() => setCopied(false), 1600);
          },
          () => toast.error(`Не удалось скопировать: ${command}`),
        )
      }
    >
      <Copy className="size-4" aria-hidden />
      {copied ? "Скопировано" : label}
    </Button>
  );
}
