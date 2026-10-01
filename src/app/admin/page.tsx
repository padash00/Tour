import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";
import { formatShortDateTime, tournamentStatusLabel } from "@/lib/format";
import type { AuditLog, Player, Tournament } from "@/lib/types";
import { TournamentStatusPill } from "@/components/tournament-bits";
import { ButtonLink, Card, EmptyState, Pill, SectionTitle } from "@/components/ui";
import { SERVER_PLAN } from "./servers/plan";

export const metadata: Metadata = { title: "Админ-панель" };

export default async function AdminOverview() {
  const [players, teams, pendingRes, tournamentsRes, logsRes] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }),
    db().from("teams").select("id", { count: "exact", head: true }).is("disbanded_at", null),
    db()
      .from("tournament_registrations")
      .select("id, tournament:tournaments(id, name)")
      .eq("status", "pending"),
    db().from("tournaments").select("*").not("status", "in", "(finished,cancelled)").order("starts_at"),
    db().from("audit_logs").select("*, actor:players(nickname)").order("created_at", { ascending: false }).limit(8),
  ]);
  const pending = (pendingRes.data ?? []) as unknown as { id: string; tournament: { id: string; name: string } }[];
  const tournaments = (tournamentsRes.data ?? []) as Tournament[];
  const logs = (logsRes.data ?? []) as (AuditLog & { actor: Pick<Player, "nickname"> | null })[];

  const stats = [
    { label: "Игроков", value: players.count ?? 0 },
    { label: "Команд", value: teams.count ?? 0 },
    { label: "Активных турниров", value: tournaments.length },
    { label: "Заявок ждут", value: pending.length, alert: pending.length > 0 },
  ];

  return (
    <div className="space-y-10">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="label">F16 Control</div>
          <h1 className="mt-2 text-3xl font-bold tracking-[-0.03em]">Обзор</h1>
        </div>
        <ButtonLink href="/admin/tournaments/new">Новый турнир</ButtonLink>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {stats.map((s) => (
          <Card key={s.label} className="p-5">
            <div className="label">{s.label}</div>
            <div className={`mt-2 text-3xl font-bold num ${s.alert ? "text-warn" : ""}`}>{s.value}</div>
          </Card>
        ))}
      </div>

      {pending.length > 0 && (
        <Card className="p-5 border-[#e3b46544]">
          <div className="flex flex-wrap items-center gap-3">
            <Pill tone="warn" dot>Требует внимания</Pill>
            <span className="text-sm text-fg-2">
              {pending.length} заявок на рассмотрении:{" "}
              {[...new Map(pending.map((p) => [p.tournament.id, p.tournament])).values()].map((t, i) => (
                <span key={t.id}>
                  {i > 0 && ", "}
                  <Link href={`/admin/tournaments/${t.id}`} className="text-accent hover:underline">
                    {t.name}
                  </Link>
                </span>
              ))}
            </span>
          </div>
        </Card>
      )}

      <section>
        <SectionTitle title="Турниры" action={<Link href="/admin/tournaments" className="text-sm text-fg-3 hover:text-fg">Все →</Link>} />
        {tournaments.length === 0 ? (
          <EmptyState compact title="Активных турниров нет" action={<ButtonLink href="/admin/tournaments/new" variant="secondary">Создать турнир</ButtonLink>} />
        ) : (
          <div className="card divide-y divide-line">
            {tournaments.map((t) => (
              <Link key={t.id} href={`/admin/tournaments/${t.id}`} className="flex items-center gap-4 p-4 hover:bg-white/[0.02]">
                <span className="flex-1 font-medium">{t.name}</span>
                <span className="text-xs text-fg-3 hidden sm:block">{tournamentStatusLabel[t.status]}</span>
                <TournamentStatusPill status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle title="Серверы" action={<Link href="/admin/servers" className="text-sm text-fg-3 hover:text-fg">Подробнее →</Link>} />
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          {SERVER_PLAN.map((s) => (
            <Card key={s.name} className="p-4">
              <div className="flex items-center justify-between">
                <span className="font-semibold num text-sm">{s.name}</span>
                <span className="size-2 rounded-full bg-fg-3" />
              </div>
              <div className="mt-3 text-xs text-fg-3">{s.reserve ? "STANDBY" : "OFFLINE"}</div>
            </Card>
          ))}
        </div>
        <p className="mt-3 text-xs text-fg-3">Server Agent ещё не подключён — статусы появятся на этапе 3.</p>
      </section>

      <section>
        <SectionTitle title="Последние действия" action={<Link href="/admin/logs" className="text-sm text-fg-3 hover:text-fg">Журнал →</Link>} />
        {logs.length === 0 ? (
          <EmptyState compact title="Журнал пуст" />
        ) : (
          <div className="card divide-y divide-line">
            {logs.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 text-sm">
                <span className="num text-xs text-fg-3 w-32">{formatShortDateTime(l.created_at)}</span>
                <span className="text-fg-2 w-32 truncate">{l.actor?.nickname ?? "system"}</span>
                <span className="num text-[13px] text-fg">{l.action}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
