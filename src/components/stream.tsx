"use client";

import { useState } from "react";
import { btnClass } from "./primitives";

/** Twitch / YouTube → адрес для встраивания; null — ссылку встроить нельзя */
export function streamEmbed(url: string, host: string): string | null {
  try {
    const u = new URL(url);
    if (/twitch\.tv$/.test(u.hostname)) {
      const channel = u.pathname.split("/").filter(Boolean)[0];
      if (!channel) return null;
      const parents = [host, "tournament.f16-arena.kz", "tour-tau-five.vercel.app"].map((p) => `parent=${p}`).join("&");
      return `https://player.twitch.tv/?channel=${channel}&${parents}&muted=true`;
    }
    if (/youtu\.?be/.test(u.hostname)) {
      const id =
        u.searchParams.get("v") ??
        (u.hostname === "youtu.be" ? u.pathname.slice(1) : u.pathname.match(/\/(?:live|embed|shorts)\/([\w-]+)/)?.[1]);
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {}
  return null;
}

export function StreamEmbed({ url }: { url: string }) {
  const host = typeof window !== "undefined" ? window.location.hostname : "tournament.f16-arena.kz";
  const src = streamEmbed(url, host);
  if (!src) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className={btnClass("secondary", "md")}>
        Смотреть трансляцию ↗
      </a>
    );
  }
  return (
    <div className="overflow-hidden rounded-2xl">
      <div className="relative aspect-video bg-bg-2">
        <iframe src={src} allowFullScreen className="absolute inset-0 h-full w-full" title="Трансляция" />
      </div>
    </div>
  );
}

export function ShareButton({ title }: { title: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={btnClass("ghost", "sm", "-ml-3")}
      onClick={async () => {
        const url = window.location.href.split("?")[0];
        if (navigator.share) {
          try {
            await navigator.share({ title, url });
            return;
          } catch {}
        }
        await navigator.clipboard.writeText(url);
        setDone(true);
        setTimeout(() => setDone(false), 1800);
      }}
    >
      {done ? "Ссылка скопирована" : "Поделиться ↗"}
    </button>
  );
}
