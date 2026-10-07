"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { IdCard } from "lucide-react";
import { useViewer } from "@/components/viewer";
import { noChrome } from "@/components/shell/nav";

/**
 * Напоминание под шапкой, пока анкета игрока не заполнена. Ничего не блокирует — только ведёт к анкете.
 * Страница из кэша CDN одинакова для всех, поэтому флаг приходит с /api/me на клиенте.
 */
export function ProfileNudge() {
  const { player, profileIncomplete } = useViewer();
  const pathname = usePathname();
  if (!player || !profileIncomplete || noChrome(pathname) || pathname.startsWith("/me/profile") || pathname === "/privacy") return null;
  return (
    <div className="border-b border-accent/20 bg-accent-dim/40">
      <div className="mx-auto flex w-full max-w-product flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6 lg:px-8">
        <IdCard className="size-4 shrink-0 text-accent" aria-hidden />
        <p className="min-w-0 flex-1 text-meta text-fg-2">
          <span className="font-medium text-fg">Заполните анкету игрока.</span> Она нужна, чтобы создать команду, вступить в неё и подать заявку на турнир.
        </p>
        <Link
          href={`/me/profile?next=${encodeURIComponent(pathname)}`}
          className="inline-flex h-8 items-center rounded-control bg-accent px-3 text-meta font-semibold text-accent-ink hover:bg-accent-strong"
        >
          Заполнить
        </Link>
      </div>
    </div>
  );
}
