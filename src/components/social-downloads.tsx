import { CARD, btnClass } from "./primitives";
import { cn } from "./ui";

/** Кнопки скачивания картинки для соцсетей: пост Instagram, сторис, широкая для превью ссылки */
export function SocialDownloads({ base, title, text }: { base: string; title: string; text: string }) {
  const items = [
    { f: "post", label: "Пост", hint: "1080×1350", primary: true },
    { f: "story", label: "Сторис", hint: "1080×1920" },
    { f: "wide", label: "Широкая", hint: "1200×630" },
  ];
  return (
    <div className={cn(CARD, "flex flex-wrap items-center justify-between gap-4 p-5 lg:p-6")}>
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
    </div>
  );
}
