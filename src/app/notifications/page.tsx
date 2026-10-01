import type { Metadata } from "next";
import Link from "next/link";
import { markNotificationsRead } from "@/app/actions/profile";
import { requirePlayer } from "@/lib/auth";
import { formatDateTime } from "@/lib/format";
import { db } from "@/lib/supabase";
import type { Notification } from "@/lib/types";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Container, EmptyState, IconBell, PageHeader, cn } from "@/components/ui";

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
    <Container className="max-w-3xl">
      <PageHeader
        eyebrow="Аккаунт"
        title="Уведомления"
        actions={
          (unread ?? 0) > 0 ? (
            <ActionForm action={markNotificationsRead}>
              <SubmitButton variant="secondary" size="sm">
                Прочитать все ({unread})
              </SubmitButton>
            </ActionForm>
          ) : null
        }
      />
      <div className="flex gap-2 mb-5">
        {[
          { key: "all", label: "Все", href: "/notifications" },
          { key: "unread", label: `Непрочитанные${unread ? ` · ${unread}` : ""}`, href: "/notifications?f=unread" },
        ].map((t) => (
          <Link
            key={t.key}
            href={t.href}
            className={cn(
              "h-8 px-3.5 inline-flex items-center rounded-full border text-[13px] transition",
              filter === t.key ? "border-[#8bb8ff55] bg-accent-dim text-accent" : "border-line text-fg-3 hover:text-fg-2",
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState icon={<IconBell />} title={filter === "unread" ? "Всё прочитано" : "Уведомлений пока нет"} description="Здесь появятся заявки, check-in, матчи, вето и решения администраторов." />
      ) : (
        <div className="card divide-y divide-line">
          {items.map((n) => {
            const inner = (
              <div className="flex items-start gap-3">
                <span className={cn("mt-2 size-2 rounded-full shrink-0", n.read_at ? "bg-transparent" : "bg-accent")} />
                <div className="min-w-0 flex-1">
                  <div className={cn("text-[15px]", n.read_at ? "text-fg-2" : "text-fg font-medium")}>{n.title}</div>
                  {n.body && <div className="text-sm text-fg-3 mt-1">{n.body}</div>}
                </div>
                <div className="text-xs text-fg-3 whitespace-nowrap">{formatDateTime(n.created_at)}</div>
              </div>
            );
            return n.link ? (
              <Link key={n.id} href={n.link} className="block p-5 hover:bg-white/[0.02]">
                {inner}
              </Link>
            ) : (
              <div key={n.id} className="p-5">
                {inner}
              </div>
            );
          })}
        </div>
      )}

      {pages > 1 && (
        <div className="mt-6 flex justify-center gap-2 text-sm">
          {Array.from({ length: pages }, (_, i) => i + 1).map((p) => (
            <Link
              key={p}
              href={`/notifications?page=${p}${filter === "unread" ? "&f=unread" : ""}`}
              className={cn("size-9 grid place-items-center rounded-lg border", p === page ? "border-accent text-accent" : "border-line text-fg-3 hover:text-fg")}
            >
              {p}
            </Link>
          ))}
        </div>
      )}
    </Container>
  );
}
