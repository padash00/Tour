"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition, type ReactNode } from "react";
import { markNotificationRead, markNotificationsRead } from "@/app/actions/profile";
import { Button } from "@/components/ds";
import { useToast } from "@/components/toast";
import { refreshViewer } from "@/components/viewer";

/** «Прочитать все» — массовая операция; после неё колокольчик в шапке обновляется сразу */
export function MarkAllReadButton({ size = "md" }: { size?: "sm" | "md" }) {
  const router = useRouter();
  const toast = useToast();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={size === "sm" ? "ghost" : "secondary"}
      size={size}
      loading={pending}
      onClick={() =>
        start(async () => {
          const r = await markNotificationsRead();
          if (r?.error) return void toast.error(r.error);
          await refreshViewer();
          router.refresh();
        })
      }
    >
      {pending ? "Отмечаем…" : "Прочитать все"}
    </Button>
  );
}

/** Ссылка непрочитанного уведомления: сначала отмечаем его прочитанным (и обновляем шапку), потом переходим */
export function UnreadNotificationLink({ id, href, className, children }: { id: string; href: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={href}
      className={className}
      onClick={async (e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) {
          void markNotificationRead(id).then(() => refreshViewer());
          return;
        }
        e.preventDefault();
        await markNotificationRead(id).catch(() => null);
        void refreshViewer();
        router.push(href);
      }}
    >
      {children}
    </Link>
  );
}
