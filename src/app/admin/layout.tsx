import Link from "next/link";
import { getCurrentPlayer, isAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { getServerState } from "@/lib/server-control";
import { BrandSymbol, ControlLogo } from "@/components/brand";
import { Avatar, cn } from "@/components/ui";
import { AdminCrumbs, AdminMobileNav, AdminRail, CommandPalette, type PaletteItem } from "@/components/admin/shell";
import { serverNow } from "@/components/admin/kit";
import { recentSiteErrors } from "@/lib/site-errors";

/**
 * F16 Control — отдельный «режим пульта»: иконочная панель, командная строка с поиском (Ctrl+K)
 * и глобальным статусом площадки на каждой странице.
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

  type M = {
    id: string;
    number: number;
    status: string;
    server_instance: string | null;
    server_state: string | null;
    server_ready_at: string | null;
    team1: { tag: string } | null;
    team2: { tag: string } | null;
    tournament: { format: string } | null;
  };
  const matches = (matchesRes.data ?? []) as unknown as M[];
  const tournaments = (tournamentsRes.data ?? []) as { id: string; name: string; status: string }[];

  const live = matches.filter((m) => m.status === "live").length;
  const busy = servers.instances.filter((i) => i.running && i.match_id).length;
  const running = servers.instances.filter((i) => i.running).length;
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
          <Link href="/admin" aria-label="F16 Control" className="flex shrink-0 items-center gap-3">
            <BrandSymbol height={24} />
            <span className="flex flex-col leading-none opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-data-[pinned=true]/rail:opacity-100">
              <span className="text-[13px] font-bold tracking-[0.04em] text-fg">F16</span>
              <span className="mt-1 font-mono text-[9px] tracking-[0.32em] text-fg-3">CONTROL</span>
            </span>
          </Link>
        }
        profile={
          <Link
            href="/"
            title="На сайт"
            className="flex h-11 items-center gap-3 overflow-hidden rounded-[8px] px-[9px] text-[13px] text-fg-2 transition-colors hover:bg-white/[0.04] hover:text-fg"
          >
            <span className="shrink-0">
              <Avatar src={admin.avatar_url} name={admin.nickname} size={30} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block truncate font-medium text-fg">{admin.nickname}</span>
              <span className="block text-[11px] text-fg-3">← на сайт</span>
            </span>
          </Link>
        }
      />

      <div className="flex min-w-0 flex-1 flex-col">
        {/* командная строка */}
        <header className="sticky top-0 z-30 border-b border-[#16222f] bg-[#060a11]/90 backdrop-blur-xl">
          <div className="flex h-14 items-center gap-4 px-4 sm:px-6 lg:px-8">
            <Link href="/admin" className="lg:hidden shrink-0" aria-label="F16 Control">
              <ControlLogo />
            </Link>
            <div className="hidden min-w-0 lg:block">
              <AdminCrumbs names={names} />
            </div>
            <div className="ml-auto flex items-center gap-2 sm:gap-3">
              <CommandPalette items={palette} />
              {/* глобальный статус площадки */}
              <Link
                href="/admin/servers"
                className="flex h-9 items-center gap-3 rounded-[8px] border border-[#1a2838] bg-[#0a111b] px-3 font-mono text-[11px] text-fg-2 transition-colors hover:border-[#2a3b52]"
                title="Агент и серверы"
              >
                <span className="flex items-center gap-1.5">
                  <span className={cn("size-2 rounded-full", servers.online ? "bg-ok" : "bg-danger animate-pulse")} />
                  <span className={servers.online ? "text-fg-2" : "text-danger"}>
                    {servers.online ? "агент" : "офлайн"}
                    {lastSync != null && (
                      <span className="hidden sm:inline text-fg-3"> · {lastSync < 120 ? `${lastSync}с` : `${Math.round(lastSync / 60)}м`}</span>
                    )}
                  </span>
                </span>
                <span className="hidden sm:flex items-center gap-1.5 border-l border-[#1a2838] pl-3">
                  <span className="text-fg-3">SRV</span>
                  <span className="text-fg">
                    {busy}/{servers.instances.length}
                  </span>
                  <span className="text-fg-3">· {running} вкл</span>
                </span>
                <span className="flex items-center gap-1.5 border-l border-[#1a2838] pl-3">
                  <span className={cn("size-1.5 rounded-full", live ? "bg-danger animate-pulse" : "bg-fg-3/50")} />
                  <span className={live ? "text-danger" : "text-fg-3"}>LIVE {live}</span>
                </span>
              </Link>
              {(waiting > 0 || errors > 0) && (
                <Link
                  href="/admin"
                  className="hidden sm:flex h-9 items-center gap-2 rounded-[8px] border border-warn/40 bg-warn/[0.08] px-3 text-[12px] font-medium text-warn"
                >
                  <span className="size-1.5 rounded-full bg-current animate-pulse" />
                  {errors > 0 ? `Ошибка сервера: ${errors}` : `Ждут игроков: ${waiting}`}
                </Link>
              )}
            </div>
          </div>
          <AdminMobileNav />
        </header>

        <main className="flex-1">
          {alarms.length > 0 && (
            <div className="border-b border-danger/30 bg-danger/[0.08]">
              <ul className="mx-auto max-w-[1560px] space-y-1 px-4 py-2.5 sm:px-6 lg:px-8">
                {alarms.slice(0, 5).map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-2.5 text-[13px] font-medium text-danger hover:underline">
                      <span className="size-1.5 shrink-0 rounded-full bg-current animate-pulse" />
                      {a.text}
                      <span className="text-danger/70">→</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="mx-auto max-w-[1560px] px-4 py-7 sm:px-6 lg:px-8 lg:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
