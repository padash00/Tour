"use client";

/* eslint-disable @next/next/no-img-element -- превью локального файла */
import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";

/** Загрузка логотипа: превью, имя файла, понятная кнопка вместо системного поля */
export function LogoInput({ name = "logo", current, tag }: { name?: string; current?: string | null; tag?: string }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<string | null>(null);

  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const src = preview ?? current ?? null;
  return (
    <div className="flex items-center gap-5">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cn(
          "grid size-20 shrink-0 place-items-center overflow-hidden rounded-[12px] border border-dashed transition-colors duration-150",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60",
          src ? "border-white/[0.12] bg-[#09111b]" : "border-white/[0.2] bg-[#09111b] hover:border-accent/60",
        )}
        aria-label="Выбрать логотип"
      >
        {src ? (
          <img src={src} alt="" className="size-full object-contain" />
        ) : (
          <span className="text-[13px] font-bold uppercase tracking-tight text-fg-3">{tag?.slice(0, 4) || "LOGO"}</span>
        )}
      </button>
      <div className="min-w-0">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="rounded-[6px] text-[15px] font-semibold text-accent transition-colors hover:text-accent-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
        >
          {src ? "Заменить логотип" : "Загрузить логотип"}
        </button>
        <div className="mt-1 truncate text-[12px] text-fg-3">{file ?? "PNG, JPG или WEBP до 1 МБ, лучше квадратный"}</div>
      </div>
      <input
        ref={input}
        name={name}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="sr-only"
        onChange={(e) => {
          const f = e.currentTarget.files?.[0];
          if (!f) return;
          setFile(`${f.name} · ${Math.max(1, Math.round(f.size / 1024))} КБ`);
          setPreview(URL.createObjectURL(f));
        }}
      />
    </div>
  );
}
