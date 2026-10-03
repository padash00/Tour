import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentPlayer } from "@/lib/auth";
import { listOpenLobbies, playerLobby } from "@/lib/lobby";
import { getMapImages } from "@/lib/settings";
import { mapLabel } from "@/lib/maps";
import { MODES } from "@/lib/modes";
import { LiveRefresh } from "@/components/live-refresh";
import { CreateLobbyButton } from "@/components/lobby/create-lobby";
import { MapThumb } from "@/components/lobby/settings";
import { Icon } from "@/components/lobby/icons";
import { EmptyCard, PageHero, SectionHead, WRAP, btnClass } from "@/components/primitives";
import { Avatar, cn } from "@/components/ui";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Лобби" };

export default async function LobbiesPage() {
  const [player, lobbies, images] = await Promise.all([getCurrentPlayer(), listOpenLobbies(), getMapImages()]);
  const mine = player ? await playerLobby(player.id) : null;

  return (
    <>
      <LiveRefresh intervalMs={5000} />
      <PageHero
        eyebrow="Игры на серверах клуба"
        title="Лобби"
        description="Соберите матч с друзьями: свои настройки, карты, боты. Неофициальные игры — в общую статистику турниров не идут."
        actions={
          mine ? (
            <Link href={`/lobby/${mine.code}`} className={btnClass("primary", "md")}>
              Вернуться в своё лобби
            </Link>
          ) : (
            <CreateLobbyButton loggedIn={!!player} />
          )
        }
      />
      <div className={`${WRAP} pt-12`}>
        <SectionHead>Открытые лобби · {lobbies.length}</SectionHead>
        {lobbies.length === 0 ? (
          <EmptyCard dashed title="Открытых лобби нет" text="Создайте своё — друзья зайдут по ссылке." action={mine ? undefined : <CreateLobbyButton loggedIn={!!player} />} />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {lobbies.map((l) => {
              const map = l.game?.map ?? l.settings.maps[0] ?? "de_mirage";
              const total = l.settings.team_size * 2;
              return (
                <Link key={l.code} href={`/lobby/${l.code}`} className="group overflow-hidden rounded-[14px] border border-white/[0.08] bg-surface transition-colors hover:border-accent/40">
                  <MapThumb map={map} image={images[map]} className="h-28">
                    <div className="absolute inset-x-3 top-3 flex items-center justify-between">
                      <span className="num rounded-[6px] bg-black/60 px-2 py-1 text-[12px] font-semibold tracking-wider">#{l.code}</span>
                      {l.game ? (
                        <span className="inline-flex items-center gap-1.5 rounded-[6px] bg-black/60 px-2 py-1 text-[12px] text-live">
                          <span className="size-1.5 animate-pulse rounded-full bg-live" />
                          {l.game.status === "live" ? `LIVE ${l.game.team1_score}:${l.game.team2_score}` : l.game.status === "veto" ? "вето" : "запуск"}
                        </span>
                      ) : (
                        l.visibility === "closed" && <span className="rounded-[6px] bg-black/60 p-1 text-fg-2">{Icon.lock("size-4")}</span>
                      )}
                    </div>
                    <span className="absolute bottom-3 left-3 text-[15px] font-semibold">{l.settings.map_choice === "host" ? mapLabel(map) : l.settings.map_choice === "veto" ? "Вето карт" : "Случайная карта"}</span>
                  </MapThumb>
                  <div className="space-y-3 p-4">
                    <div className="flex items-center gap-2.5">
                      <Avatar src={l.host.avatar_url} name={l.host.nickname} size={28} />
                      <span className="min-w-0 flex-1 truncate text-[14px] font-medium">{l.host.nickname}</span>
                      <span className={cn("num text-[14px] font-semibold", l.players >= total ? "text-fg-3" : "text-ok")}>
                        {l.players}/{total}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-[12px] text-fg-2">
                      <span className="rounded-[5px] bg-white/[0.05] px-2 py-0.5">{MODES[l.settings.mode].label.replace(" на ", "×")}</span>
                      <span className="rounded-[5px] bg-white/[0.05] px-2 py-0.5">BO{l.settings.best_of}</span>
                      <span className="rounded-[5px] bg-white/[0.05] px-2 py-0.5">{l.settings.network === "lan" ? "LAN" : "Интернет"}</span>
                      {l.settings.headshot_only && <span className="rounded-[5px] bg-white/[0.05] px-2 py-0.5">только в голову</span>}
                      {l.settings.filter && <span className="rounded-[5px] bg-warn/10 px-2 py-0.5 text-warn">фильтр</span>}
                    </div>
                    <div className="flex -space-x-2">
                      {l.members.map((m, i) => (
                        <span key={i} className="rounded-full ring-2 ring-surface">
                          <Avatar src={m.avatar_url} name={m.nickname} size={24} />
                        </span>
                      ))}
                    </div>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
