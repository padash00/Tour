"use client";

import { useState } from "react";

/**
 * Поле выбора логотипа: большую картинку браузер сам уменьшает до 512 px (WEBP), чтобы она влезла в лимит 1 МБ.
 * Маленькие PNG/JPG/WEBP отправляются как есть.
 */
export async function shrinkLogo(file: File, max = 512): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const okType = ["image/png", "image/jpeg", "image/webp"].includes(file.type);
  if (okType && file.size <= 900 * 1024) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.max(1, Math.round(bitmap.width * scale));
    const h = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/webp", 0.9));
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", { type: "image/webp" });
  } catch {
    return file;
  }
}

export function LogoFileInput({ name = "logo", className, required }: { name?: string; className?: string; required?: boolean }) {
  const [note, setNote] = useState("");
  return (
    <span className="flex flex-col gap-1">
      <input
        type="file"
        name={name}
        accept="image/png,image/jpeg,image/webp,image/gif,image/avif"
        required={required}
        className={className}
        onChange={async (e) => {
          const input = e.currentTarget;
          const file = input.files?.[0];
          setNote("");
          if (!file) return;
          const small = await shrinkLogo(file);
          if (small !== file) {
            const dt = new DataTransfer();
            dt.items.add(small);
            input.files = dt.files;
            setNote(`Уменьшено: ${Math.round(file.size / 1024)} КБ → ${Math.round(small.size / 1024)} КБ`);
          }
        }}
      />
      {note && <span className="text-[12px] text-fg-3">{note}</span>}
    </span>
  );
}
