import type { Metadata } from "next";
import Link from "next/link";
import { resolveDmReport } from "@/app/actions/dm";
import { setChatMuted } from "@/app/actions/chat";
import { requireAdmin } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { listThread } from "@/lib/dm";
import { db } from "@/lib/supabase";
import { AdminHeader, Panel } from "@/components/admin/control";
import { cn } from "@/components/ui";

export const metadata: Metadata = { title: "Жалобы — F16 Control" };
export const dynamic = "force-dynamic";

type P = { id: string; nickname: string; steam_id: string; chat_muted: boolean };

/**
 * Жалобы на личные сообщения. Переписку админ видит только по жалобе: последние сообщения этой пары игроков,
 * каждый просмотр пишется в журнал.
 */
export default async function AdminMessagesPage() {
  const admin = await requireAdmin("/admin/messages");
  const { data } = await db()
    .from("dm_reports")
    .select("id, reason, created_at, resolved_at, message_id, reporter:players!dm_reports_reporter_id_fkey(id, nickname, steam_id, chat_muted), reported:players!dm_reports_reported_id_fkey(id, nickname, steam_id, chat_muted)")
    .order("resolved_at", { ascending: true, nullsFirst: true })
    .order("created_at", { ascending: false })
    .limit(30);
  type Row = { id: number; reason: string | null; created_at: string; resolved_at: string | null; message_id: number | null; reporter: P; reported: P };
  const rows = (data ?? []) as unknown as Row[];
  const open = rows.filter((r) => !r.resolved_at);
  const threads = await Promise.all(open.map((r) => listThread(r.reporter.id, r.reported.id)));
  if (open.length) await audit(admin.id, "dm.report_view", undefined, { reports: open.map((r) => r.id) });
  const time = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Asia/Almaty" });

  return (
    <div className="space-y-8">
      <AdminHeader title="Жалобы на сообщения" description="Игроки жалуются на личные сообщения. Переписка видна только по жалобе, каждый просмотр — в журнале." />
      {rows.length === 0 && <p className="text-[15px] text-fg-3">Жалоб нет.</p>}
      {rows.map((r) => {
        const i = open.indexOf(r);
        const thread = i >= 0 ? threads[i].slice(-20) : [];
        return (
          <Panel key={r.id} title={`${r.reporter.nickname} → жалоба на ${r.reported.nickname}`} boxed>
            <div className="space-y-4 p-5">
              <p className="text-[14px] text-fg-2">
                {time.format(new Date(r.created_at))}
                {r.reason ? ` · «${r.reason}»` : ""}
                {r.resolved_at ? " · закрыта" : ""}
              </p>
              {thread.length > 0 && (
                <div className="max-h-80 space-y-1.5 overflow-y-auto rounded-control border border-line-subtle bg-surface-2 p-3 text-[14px]">
                  {thread.map((m) => (
                    <p key={m.id} className={cn(m.id === r.message_id && "rounded bg-danger/10 px-1")}>
                      <span className="font-semibold">{m.sender_id === r.reported.id ? r.reported.nickname : r.reporter.nickname}:</span> <span className="whitespace-pre-wrap">{m.body}</span>
                      <span className="ml-2 text-[11px] text-fg-4">{time.format(new Date(m.created_at))}</span>
                    </p>
                  ))}
                </div>
              )}
              {!r.resolved_at && (
                <div className="flex flex-wrap items-center gap-3">
                  <form
                    action={async () => {
                      "use server";
                      await resolveDmReport(r.id);
                    }}
                  >
                    <button className="h-9 rounded-control border border-line px-3.5 text-[14px] font-semibold hover:bg-surface-2">Закрыть жалобу</button>
                  </form>
                  {!r.reported.chat_muted && (
                    <form
                      action={async () => {
                        "use server";
                        await setChatMuted(r.reported.id, true);
                        await resolveDmReport(r.id);
                      }}
                    >
                      <button className="h-9 rounded-control bg-danger px-3.5 text-[14px] font-semibold text-white">Запретить писать (чат и сообщения)</button>
                    </form>
                  )}
                  <Link href={`/admin/players?q=${encodeURIComponent(r.reported.steam_id)}`} className="text-[14px] font-semibold text-accent hover:underline">
                    Игрок в пульте →
                  </Link>
                </div>
              )}
            </div>
          </Panel>
        );
      })}
    </div>
  );
}
