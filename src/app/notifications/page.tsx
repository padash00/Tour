import type { Metadata } from "next";
import Link from "next/link";
import { Bell } from "lucide-react";
import { requirePlayer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { MarkAllReadButton } from "@/components/notifications/actions";
import { NotificationFeed } from "@/components/public/notification-feed";
import { Container, EmptyState, Meta, PageTitle, cn } from "@/components/ds";

export const metadata: Metadata = { title: "Уведомления" };

const PAGE = 30;

export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const player = await requirePlayer("/notifications");
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const { count: unread } = await db().from("notifications").select("id", { count: "exact", head: true }).eq("player_id", player.id).is("read_at", null);
  // есть непрочитанные — по умолчанию открываем их; ?f=all — все
  const filter = sp.f === "all" ? "all" : sp.f === "unread" || (unread ?? 0) > 0 ? "unread" : "all";

  let q = db()
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (filter === "unread") q = q.is("read_at", null);
  const { data, count } = await q;
  const items = (data ?? []) as Notification[];
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const pageHref = (p: number) => `/notifications?f=${filter}${p > 1 ? `&page=${p}` : ""}`;
  const tabs = [
    { key: "unread", label: "Непрочитанные", n: unread ?? 0 },
    { key: "all", label: "Все", n: null },
  ];

  return (
    <Container className="pt-8 sm:pt-10">
      <div className="max-w-[820px]">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <PageTitle>Уведомления</PageTitle>
            <Meta className="mt-1 block">{unread ? `Непрочитанных: ${unread}` : "Всё прочитано"}</Meta>
          </div>
          {(unread ?? 0) > 0 && <MarkAllReadButton />}
        </header>

        <nav aria-label="Фильтр уведомлений" className="mt-6 flex gap-1 border-b border-line-subtle">
          {tabs.map((t) => (
            <Link
              key={t.key}
              href={`/notifications?f=${t.key}`}
              aria-current={filter === t.key ? "page" : undefined}
              className={cn(
                "-mb-px inline-flex h-11 items-center gap-2 border-b-2 px-3 text-[14px] font-medium transition-colors",
                filter === t.key ? "border-accent text-fg" : "border-transparent text-fg-3 hover:text-fg",
              )}
            >
              {t.label}
              {t.n ? <span className="num rounded-chip bg-accent-dim px-1.5 text-micro text-accent">{t.n}</span> : null}
            </Link>
          ))}
        </nav>

        <div className="mt-8">
          {items.length === 0 ? (
            <EmptyState
              icon={<Bell />}
              title={filter === "unread" ? "Всё прочитано" : "Уведомлений пока нет"}
              text={
                filter === "unread"
                  ? "Новые уведомления появятся здесь и на колокольчике в шапке."
                  : "Здесь появятся приглашения в команду, решения по заявкам, вето и готовность сервера."
              }
              action={
                filter === "unread" ? (
                  <Link href="/notifications?f=all" className="text-[14px] font-medium text-accent hover:text-accent-strong">
                    Показать все →
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <NotificationFeed items={items} now={new Date()} />
          )}

          {pages > 1 && (
            <nav aria-label="Страницы" className="mt-10 flex flex-wrap items-center justify-center gap-1.5">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="grid h-10 place-items-center rounded-control px-3 text-[14px] text-fg-3 hover:bg-white/[0.04] hover:text-fg">
                  ← Назад
                </Link>
              )}
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn("num grid size-10 place-items-center rounded-control text-[14px]", p === page ? "border border-line-strong bg-white/[0.06] text-fg" : "text-fg-3 hover:bg-white/[0.04] hover:text-fg")}
                >
                  {p}
                </Link>
              ))}
              {page < pages && (
                <Link href={pageHref(page + 1)} className="grid h-10 place-items-center rounded-control px-3 text-[14px] text-fg-3 hover:bg-white/[0.04] hover:text-fg">
                  Дальше →
                </Link>
              )}
            </nav>
          )}
        </div>
      </div>
    </Container>
  );
}
