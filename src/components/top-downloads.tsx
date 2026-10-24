"use client";

import { useState } from "react";
import { Panel, buttonClass as btnClass } from "@/components/ds";
import { useViewer } from "./viewer";

type Day = { day: string; label: string };

/**
 * Скачивание картинки «ТОП-5 лучших игроков»: за весь турнир или за выбранный игровой день, в трёх форматах.
 * gate — показывать только администратору (публичная страница; сами картинки сервер без прав админа не отдаёт).
 */
export function TopDownloads({ slug, days, gate = false }: { slug: string; days: Day[]; gate?: boolean }) {
  const { player } = useViewer();
  const [day, setDay] = useState("");
  if (gate && !player?.isAdmin) return null;
  const items = [
    { f: "post", label: "Пост", hint: "2160×2700", primary: true },
    { f: "story", label: "Сторис", hint: "2160×3840" },
    { f: "square", label: "Квадрат", hint: "2400×2400" },
  ];
  return (
    <Panel className="flex flex-wrap items-center justify-between gap-4 lg:p-6">
      <div className="min-w-0">
        <div className="text-[15px] font-semibold">ТОП-5 игроков</div>
        <div className="mt-0.5 text-[13px] text-fg-3">Лучшие по F16 Rating — за весь турнир или за один игровой день.</div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={day} onChange={(e) => setDay(e.target.value)} className="field w-auto" aria-label="Период">
          <option value="">Весь турнир</option>
          {days.map((d) => (
            <option key={d.day} value={d.day}>
              {d.label}
            </option>
          ))}
        </select>
        {items.map((i) => (
          <a
            key={i.f}
            href={`/tournaments/${slug}/top/image?f=${i.f}${day ? `&day=${day}` : ""}&download=1`}
            className={btnClass(i.primary ? "primary" : "secondary", "md")}
            download
            title={`Скачать ${i.hint}`}
          >
            {i.label}
            <span className="ml-1.5 text-[11px] font-normal opacity-70">{i.hint}</span>
          </a>
        ))}
      </div>
    </Panel>
  );
}
