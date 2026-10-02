"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "../ui";

/**
 * Поиск по списку прямо в браузере: страница отдаётся из кэша CDN целиком,
 * фильтр скрывает строки с атрибутом data-filter внутри [data-filter-scope={scope}].
 * ?q= в адресе поддерживается (ссылки на поиск продолжают работать).
 */
export function ClientFilter({ scope, placeholder, className }: { scope: string; placeholder: string; className?: string }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<number | null>(null);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const initial = new URLSearchParams(window.location.search).get("q") ?? "";
    if (!initial) return;
    const id = setTimeout(() => setQ(initial), 0);
    return () => clearTimeout(id);
  }, []);

  useEffect(() => {
    const root = document.querySelector(`[data-filter-scope="${scope}"]`);
    if (!root) return;
    const needle = q.trim().toLowerCase();
    let n = 0;
    root.querySelectorAll<HTMLElement>("[data-filter]").forEach((el) => {
      const hit = !needle || (el.dataset.filter ?? "").includes(needle);
      el.hidden = !hit;
      if (hit) n++;
    });
    root.querySelectorAll<HTMLElement>("[data-filter-empty]").forEach((el) => {
      el.hidden = n > 0;
    });
    const id = setTimeout(() => setFound(needle ? n : null), 0);
    const url = new URL(window.location.href);
    if (needle) url.searchParams.set("q", q.trim());
    else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url);
    return () => clearTimeout(id);
  }, [q, scope]);

  return (
    <div className={cn("flex flex-wrap items-center gap-4", className)}>
      <label className="relative block w-full max-w-[360px]">
        <span className="sr-only">{placeholder}</span>
        <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3.5 top-1/2 size-[18px] -translate-y-1/2 text-fg-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <circle cx="11" cy="11" r="6.5" />
          <path d="m20 20-4.2-4.2" strokeLinecap="round" />
        </svg>
        <input
          ref={ref}
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="field !h-11 w-full !pl-10"
          autoComplete="off"
        />
      </label>
      {found !== null && (
        <span className="t-meta">
          Найдено: <span className="num text-fg-2">{found}</span>
        </span>
      )}
    </div>
  );
}
