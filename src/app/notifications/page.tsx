import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsRead } from "@/app/actions/profile";
import { requirePlayer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NotificationFeed } from "@/components/public/notification-feed";
import { Tabs, cn } from "@/components/ui";
import { EmptyCard, PageHero, Wrap } from "@/components/primitives";

export const metadata: Metadata = { title: "Уведомления" };

const PAGE = 30;

export default async function NotificationsPage(props: PageProps<"/notifications">) {
  const player = await requirePlayer("/notifications");
  const sp = await props.searchParams;
  const page = Math.max(1, Number(sp.page) || 1);
  const filter = sp.f === "unread" ? "unread" : "all";

  let q = db()
    .from("notifications")
    .select("*", { count: "exact" })
    .eq("player_id", player.id)
    .order("created_at", { ascending: false })
    .range((page - 1) * PAGE, page * PAGE - 1);
  if (filter === "unread") q = q.is("read_at", null);
  const { data, count } = await q;
  const items = (data ?? []) as Notification[];
  const { count: unread } = await db()
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("player_id", player.id)
    .is("read_at", null);
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE));
  const pageHref = (p: number) => `/notifications?page=${p}${filter === "unread" ? "&f=unread" : ""}`;

  return (
    <>
      <PageHero
        compact
        eyebrow={unread ? `Непрочитанных: ${unread}` : "Всё прочитано"}
        title="Уведомления"
        lead="Приглашения, заявки, вето, готовность сервера и решения администраторов."
        aside={
          (unread ?? 0) > 0 ? (
            <ActionForm action={markNotificationsRead}>
              <SubmitButton variant="secondary" size="md" pendingText="Отмечаем…">
                Прочитать все
              </SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      <Wrap className="pt-10">
        <Tabs
          active={filter}
          items={[
            { key: "all", label: "Все", href: "/notifications" },
            { key: "unread", label: `Непрочитанные${unread ? ` · ${unread}` : ""}`, href: "/notifications?f=unread" },
          ]}
        />

        <div className="mt-8 max-w-[880px]">
          {items.length === 0 ? (
            <EmptyCard
              dashed
              title={filter === "unread" ? "Всё прочитано" : "Уведомлений пока нет"}
              text={
                filter === "unread"
                  ? "Новые уведомления появятся здесь и на колокольчике в шапке."
                  : "Здесь появятся приглашения в команду, решения по заявкам, вето и готовность сервера."
              }
            />
          ) : (
            <NotificationFeed items={items} now={new Date()} />
          )}

          {pages > 1 && (
            <nav aria-label="Страницы" className="mt-10 flex items-center justify-center gap-1.5">
              {page > 1 && (
                <Link href={pageHref(page - 1)} className="grid h-10 place-items-center rounded-[8px] px-3 text-[14px] text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg">
                  ← Назад
                </Link>
              )}
              {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
                <Link
                  key={p}
                  href={pageHref(p)}
                  aria-current={p === page ? "page" : undefined}
                  className={cn(
                    "num grid size-10 place-items-center rounded-[8px] text-[14px] transition-colors",
                    p === page ? "border border-white/[0.14] bg-white/[0.06] text-fg" : "text-fg-3 hover:bg-white/[0.04] hover:text-fg",
                  )}
                >
                  {p}
                </Link>
              ))}
              {page < pages && (
                <Link href={pageHref(page + 1)} className="grid h-10 place-items-center rounded-[8px] px-3 text-[14px] text-fg-3 transition-colors hover:bg-white/[0.04] hover:text-fg">
                  Дальше →
                </Link>
              )}
            </nav>
          )}
        </div>
      </Wrap>
    </>
  );
}
