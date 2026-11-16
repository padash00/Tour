"use client";

import Link from "next/link";
import { Copy, Headphones } from "lucide-react";
import { useEffect, useState } from "react";
import { Button, buttonClass, cn } from "@/components/ds";
import { useT } from "@/lib/i18n/client";
import { useToast } from "./toast";

/*
 * Голосовая связь: сервер TeamSpeak клуба. Адрес — настройка TEAMSPEAK_ADDRESS в пульте.
 * «Войти» открывает программу TeamSpeak сразу на нашем сервере (ссылка ts3server://), рядом — копирование адреса.
 */

/** Сколько человек сейчас на сервере — отдаёт сам сервер TeamSpeak клуба (обновляется раз в полминуты) */
const STATUS_URL = "https://ts.f16-arena.kz/status.json";

export const teamspeakLink = (address: string) => `ts3server://${address}`;

export function VoiceCard({ address, wide, className }: { address: string; wide?: boolean; className?: string }) {
  const t = useT();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetch(STATUS_URL, { cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null))
        .then((s: { online?: unknown } | null) => alive && typeof s?.online === "number" && setOnline(s.online))
        .catch(() => {});
    load();
    const id = setInterval(load, 30000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);
  const copy = () =>
    navigator.clipboard.writeText(address).then(
      () => {
        setCopied(true);
        toast.success(t("Адрес скопирован — вставьте его в TeamSpeak"));
        setTimeout(() => setCopied(false), 1600);
      },
      () => toast.error(t("Не удалось скопировать: {cmd}", { cmd: address })),
    );
  return (
    <section aria-label={t("Голосовая связь")} className={cn("rounded-surface border border-line-subtle bg-surface p-5", wide && "sm:flex sm:items-center sm:justify-between sm:gap-6", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-control bg-accent-dim text-accent">
          <Headphones className="size-5" aria-hidden />
        </span>
        <div className="min-w-0">
          <div className="text-[15px] font-semibold text-fg">{t("Голосовая связь — TeamSpeak")}</div>
          <div className="mt-0.5 text-meta text-fg-2">
            {t("Сервер клуба для команд:")} <span className="num font-semibold text-fg">{address}</span>
            {online !== null && online > 0 && <span className="num text-ok"> · {t("сейчас в сети: {n}", { n: online })}</span>}
          </div>
        </div>
      </div>
      <div className={cn("mt-4 flex flex-wrap items-center gap-2", wide && "sm:mt-0 sm:shrink-0")}>
        <a href={teamspeakLink(address)} className={buttonClass("primary", "md")}>
          {t("Войти в TeamSpeak")}
        </a>
        <Button variant="secondary" size="md" icon={<Copy />} onClick={copy}>
          {copied ? t("Скопировано") : t("Скопировать адрес")}
        </Button>
        <Link href="/teamspeak" className="inline-flex min-h-9 items-center px-1 text-meta text-fg-2 underline-offset-4 hover:text-fg hover:underline">
          {t("Как подключиться")}
        </Link>
      </div>
    </section>
  );
}
