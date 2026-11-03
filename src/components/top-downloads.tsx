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
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  if (gate && !player?.isAdmin) return null;

  // скачиваем через fetch: при ошибке (нет статистики, нет прав) браузер иначе сохранил бы текст ответа как image.txt
  const download = async (e: React.MouseEvent<HTMLAnchorElement>, url: string) => {
    e.preventDefault();
    if (busy) return;
    setBusy(url);
    setError("");
    try {
      const r = await fetch(url);
      if (!r.ok || !r.headers.get("content-type")?.startsWith("image/")) {
        const text = (await r.text().catch(() => "")).trim();
        setError(r.status === 404 && text.includes("Статистики") ? "Картинки появятся после первых сыгранных матчей турнира — пока статистики нет." : text || `Не удалось получить картинку (${r.status})`);
        return;
      }
      const name = /filename="([^"]+)"/.exec(r.headers.get("content-disposition") ?? "")?.[1] ?? "f16-top.png";
      const href = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = href;
      a.download = name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(href), 10_000);
    } catch {
      setError("Нет связи с сайтом — попробуйте ещё раз");
    } finally {
      setBusy("");
    }
  };
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
        {items.map((i) => {
          const url = `/tournaments/${slug}/top/image?f=${i.f}${day ? `&day=${day}` : ""}&download=1`;
          return (
            <a
              key={i.f}
              href={url}
              onClick={(e) => download(e, url)}
              aria-busy={busy === url}
              className={btnClass(i.primary ? "primary" : "secondary", "md")}
              title={`Скачать ${i.hint}`}
            >
              {busy === url ? "Готовим…" : i.label}
              <span className="ml-1.5 text-[11px] font-normal opacity-70">{i.hint}</span>
            </a>
          );
        })}
      </div>
      {error && <p className="w-full text-[13px] font-medium text-warn">{error}</p>}
    </Panel>
  );
}
