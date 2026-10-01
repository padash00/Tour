import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsRead } from "@/app/actions/profile";
import { requirePlayer } from "@/lib/auth";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NotificationRow } from "@/components/competition/notification-row";
import { Container, EmptyState, PageHeader, Tabs, cn } from "@/components/ui";

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

  return (
    <Container size="narrow">
      <PageHeader
        title="Уведомления"
        actions={
          (unread ?? 0) > 0 ? (
            <ActionForm action={markNotificationsRead}>
              <SubmitButton variant="ghost" size="sm">
                Прочитать все
              </SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      <Tabs
        active={filter}
        items={[
          { key: "all", label: "Все", href: "/notifications" },
          { key: "unread", label: `Непрочитанные${unread ? ` · ${unread}` : ""}`, href: "/notifications?f=unread" },
        ]}
      />

      <div className="pt-4">
        {items.length === 0 ? (
          <EmptyState
            title={filter === "unread" ? "Всё прочитано" : "Уведомлений пока нет"}
            description="Здесь появятся приглашения, заявки, вето, готовность сервера и решения администраторов."
          />
        ) : (
          items.map((n) => <NotificationRow key={n.id} n={n} />)
        )}
      </div>

      {pages > 1 && (
        <div className="mt-8 flex justify-center gap-1 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/notifications?page=${p}${filter === "unread" ? "&f=unread" : ""}`}
              className={cn("size-9 grid place-items-center rounded-lg num", p === page ? "bg-white/[0.06] text-fg" : "text-fg-3 hover:text-fg")}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
