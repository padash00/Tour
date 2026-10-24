"use client";

import { Panel, buttonClass as btnClass } from "@/components/ds";
import { useViewer } from "./viewer";

/**
 * Кнопки скачивания картинки для соцсетей: пост Instagram, сторис, широкая — только администратору.
 * maps — сыгранные карты матча: для каждой ещё «Статистика карты» (составы и история раундов).
 * Страницы отдаются из кэша одинаковыми для всех, поэтому прав проверяем на клиенте; сами картинки
 * без прав админа сервер тоже не отдаёт.
 */
export function SocialDownloads({ base, title, text, maps = [] }: { base: string; title: string; text: string; maps?: { n: number; label: string }[] }) {
  const { player } = useViewer();
  if (!player?.isAdmin) return null;
  const items = [
    { f: "post", label: "Пост", hint: "2160×2700", primary: true },
    { f: "story", label: "Сторис", hint: "2160×3840" },
    { f: "wide", label: "Широкая", hint: "2400×1260" },
  ];
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 lg:p-6">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">{title}</div>
        <div className="mt-0.5 text-[13px] text-fg-3">{text}</div>
      </div>
      <div className="flex flex-wrap gap-2">
        {items.map((i) => (
          <a
            key={i.f}
            href={`${base}?f=${i.f}&download=1`}
            className={btnClass(i.primary ? "primary" : "secondary", "md")}
            download
            title={`Скачать ${i.hint}`}
          >
            {i.label}
            <span className="ml-1.5 text-[11px] font-normal opacity-70">{i.hint}</span>
          </a>
        ))}
      </div>
      {maps.length > 0 && (
        <div className="flex w-full flex-wrap items-center gap-2 border-t border-line-subtle pt-4">
          <span className="mr-2 text-[13px] text-fg-3">Статистика карты</span>
          {maps.map((m) => (
            <a key={m.n} href={`${base}?f=stats&map=${m.n}&download=1`} className={btnClass("secondary", "md")} download title="Скачать 2400 px по ширине">
              {m.label}
            </a>
          ))}
        </div>
      )}
    </Panel>
  );
}
