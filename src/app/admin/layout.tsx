import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getServerState } from "@/lib/server-control";
import { AlertTriangle, ChevronRight } from "lucide-react";
import { BrandLogo } from "@/components/brand";
import { Avatar } from "@/components/ui";
import { AdminCrumbs, AdminMobileNav, AdminRail, CommandPalette, VenueStatus, type PaletteItem } from "@/components/admin/shell";
import { serverNow } from "@/components/admin/kit";
import { recentSiteErrors } from "@/lib/site-errors";

// пульт организатора не индексируется
export const metadata: Metadata = { robots: { index: false, follow: false } };

/**
 * F16 Control — пульт организатора в стиле сайта: меню с подписями, шапка с поиском (Ctrl+K)
 * и состоянием площадки словами, сверху — «Требует внимания» на любой странице.
 */
export default async function AdminLayout({ children }: LayoutProps<"/admin">) {
  // перенаправление на вход делает сама страница (requireAdmin с точным адресом) — так ссылка не теряется
  const admin = await getCurrentPlayer();
  if (!admin || !isAdmin(admin)) return <>{children}</>;
  const [servers, matchesRes, tournamentsRes, siteErrors] = await Promise.all([
    getServerState(),
    db()
      .from("matches")
      .select(
        "id, number, status, server_instance, server_state, server_ready_at, team1:teams!matches_team1_id_fkey(tag), team2:teams!matches_team2_id_fkey(tag), tournament:tournaments(format)",
      )
      .order("number", { ascending: false })
      .limit(300),
    db().from("tournaments").select("id, name, status").order("created_at", { ascending: false }).limit(50),
    recentSiteErrors(15).catch(() => 0),
  ]);
  const now = serverNow();

  const matches = matchesRes.data ?? [];
  const tournaments = tournamentsRes.data ?? [];

  const live = matches.filter((m) => m.status === "live").length;
  const busy = servers.instances.filter((i) => i.running && i.match_id).length;
  const waiting = matches.filter(
    (m) => m.status === "ready" && m.server_state === "ready" && m.server_ready_at && now - new Date(m.server_ready_at).getTime() > 10 * 60_000,
  ).length;
  const errors = matches.filter((m) => m.status === "ready" && m.server_state === "error").length;
  // тревоги: то, что требует вмешательства прямо сейчас — видно на любой странице пульта
  const alarms: { key: string; text: string; href: string }[] = [];
  if (!servers.online) alarms.push({ key: "agent", text: "Агент на серверном ПК не на связи — серверы не управляются", href: "/admin/servers" });
  else {
    for (const m of matches) {
      if (!["ready", "live"].includes(m.status) || !m.server_instance) continue;
      const vs = `#${m.number} ${m.team1?.tag ?? "TBD"}–${m.team2?.tag ?? "TBD"}`;
      const inst = servers.instances.find((i) => i.name === m.server_instance);
      const href = `/admin/matches/${m.id}`;
      if (m.server_state === "error") alarms.push({ key: `err-${m.id}`, text: `Матч ${vs}: карта не загрузилась на ${m.server_instance}`, href });
      else if (inst && !inst.running) alarms.push({ key: `down-${m.id}`, text: `Матч ${vs}: сервер ${m.server_instance} выключен или упал`, href });
      else if (m.status === "live" && inst?.running && inst.match_id === m.id) {
        const size = m.tournament?.format === "1v1" ? 1 : m.tournament?.format === "2v2" ? 2 : 5;
        const humans = Math.max(0, (inst.players ?? 0) - 1);
        if (humans < size * 2) alarms.push({ key: `left-${m.id}`, text: `Матч ${vs}: на сервере ${humans} из ${size * 2} — кто-то вылетел`, href });
      } else if (m.status === "ready" && m.server_state === "ready" && m.server_ready_at && now - new Date(m.server_ready_at).getTime() > 15 * 60_000) {
        alarms.push({ key: `ns-${m.id}`, text: `Матч ${vs}: игроки не заходят больше 15 минут — неявка?`, href });
      }
    }
  }
  if (siteErrors > 0) alarms.push({ key: "site-errors", text: `Ошибки на сайте за 15 минут: ${siteErrors} — подробности в журнале`, href: "/admin/logs?f=site" });
  const lastSync = servers.host?.last_seen_at ? Math.max(0, Math.round((now - new Date(servers.host.last_seen_at).getTime()) / 1000)) : null;

  const palette: PaletteItem[] = [
    ...tournaments.map((t) => ({ href: `/admin/tournaments/${t.id}`, label: t.name, group: "Турнир" })),
    ...matches.map((m) => ({
      href: `/admin/matches/${m.id}`,
      label: `#${m.number} ${m.team1?.tag ?? "TBD"} vs ${m.team2?.tag ?? "TBD"}`,
      hint: m.status,
      group: "Матч",
    })),
    ...servers.instances.map((i) => ({ href: "/admin/servers", label: i.name, hint: `:${i.port}`, group: "Сервер" })),
  ];
  // имена для хлебных крошек по id
  const names: Record<string, string> = Object.fromEntries([
    ...tournaments.map((t) => [t.id, t.name] as const),
    ...matches.map((m) => [m.id, `Матч #${m.number}`] as const),
  ]);

  return (
    <div className="control-mode flex min-h-screen [&_:is(a,button,input,select,textarea,summary):focus-visible]:outline-2 [&_:is(a,button,input,select,textarea,summary):focus-visible]:outline-offset-2 [&_:is(a,button,input,select,textarea,summary):focus-visible]:outline-accent/80">
      <AdminRail
        logo={
          <Link href="/admin" aria-label="F16 Control — главная пульта" className="flex items-center gap-3">
            <BrandLogo height={28} />
            <span className="rounded-full bg-fg px-2.5 py-1 text-[12px] font-bold uppercase tracking-[0.06em] text-white">Пульт</span>
          </Link>
        }
        profile={
          <div className="flex items-center gap-3 rounded-surface bg-surface-2 p-2.5">
            <Avatar src={admin.avatar_url} name={admin.nickname} size={36} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[15px] font-bold text-fg">{admin.nickname}</span>
              <span className="block text-[12.5px] text-fg-3">Администратор</span>
            </span>
          </div>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* шапка: где я, поиск, состояние площадки */}
        <header className="sticky top-0 z-30 border-b border-line-subtle bg-shell/95 backdrop-blur-xl">
          <div className="flex h-16 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/admin" className="flex shrink-0 items-center gap-2 lg:hidden" aria-label="F16 Control">
              <BrandLogo height={24} />
            </Link>
            <div className="hidden min-w-0 flex-1 lg:block">
              <AdminCrumbs names={names} />
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <CommandPalette items={palette} />
              <VenueStatus online={servers.online} lastSync={lastSync} busy={busy} total={servers.instances.length} live={live} />
              {(waiting > 0 || errors > 0) && (
                <Link href="/admin" className="hidden h-10 items-center gap-2 rounded-full bg-warn-dim px-3.5 text-[13.5px] font-semibold text-warn sm:inline-flex">
                  <span className="size-2 animate-pulse rounded-full bg-current" />
                  {errors > 0 ? `Ошибка сервера: ${errors}` : `Ждут игроков: ${waiting}`}
                </Link>
              )}
            </div>
          </div>
          <AdminMobileNav />
        </header>

        <main className="flex-1">
          {alarms.length > 0 && (
            <div className="mx-auto max-w-[1560px] px-4 pt-6 sm:px-6 lg:px-8">
              <div className="rounded-surface bg-danger-dim p-4 shadow-[inset_0_0_0_1px_color-mix(in_srgb,var(--color-danger)_25%,transparent)]">
                <div className="mb-2 flex items-center gap-2 text-[15px] font-bold text-danger">
                  <AlertTriangle className="size-5" />
                  Требует внимания: {alarms.length}
                </div>
                <ul className="space-y-1">
                  {alarms.slice(0, 5).map((a) => (
                    <li key={a.key}>
                      <Link href={a.href} className="flex items-center gap-2 rounded-control px-2 py-1.5 text-[14.5px] font-medium text-fg transition-colors hover:bg-white/60">
                        <span className="size-2 shrink-0 animate-pulse rounded-full bg-danger" />
                        <span className="min-w-0 flex-1">{a.text}</span>
                        <span className="flex shrink-0 items-center gap-1 text-[13px] font-semibold text-danger">
                          Открыть <ChevronRight className="size-4" />
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <div className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
