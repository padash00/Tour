import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { editWorkshopMaps, saveSetting } from "@/app/actions/admin-settings";
import { getServerState, workshopInfo } from "@/lib/server-control";
import { getAgentBundle } from "@/lib/agent-bundle";
import { env } from "@/lib/env";
import { formatShortDateTime } from "@/lib/format";
import { getDisabledMaps, getMapImages, getSettingsStatus, getWorkshopMaps, type SettingKey } from "@/lib/settings";
import { CS2_MAPS } from "@/lib/maps";
import { MapCard } from "@/components/admin/map-card";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ADMIN_CARD, AdminHeader, AdminLabel, Dot, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Настройки — F16 Control" };

const TABS = [
  { key: "general", label: "Общие" },
  { key: "maps", label: "Карты" },
  { key: "steam", label: "Steam" },
  { key: "faceit", label: "FACEIT" },
  { key: "workshop", label: "Workshop-карты" },
  { key: "servers", label: "Серверы и MatchZy" },
  { key: "broadcast", label: "Трансляция" },
  { key: "security", label: "Безопасность" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAB_SETTING: Partial<Record<TabKey, SettingKey>> = {
  steam: "STEAM_API_KEY",
  faceit: "FACEIT_API_KEY",
  broadcast: "OBSERVER_STEAM_IDS",
};

type SettingRow = Awaited<ReturnType<typeof getSettingsStatus>>[number];

function SettingForm({ s }: { s: SettingRow }) {
  return (
    <div className="rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 p-5 max-w-2xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[14px] font-semibold">{s.label}</div>
          <div className="mt-0.5 text-[12px] text-fg-3">{s.hint}</div>
        </div>
        <span className="flex items-center gap-2 text-[12px]">
          <Dot tone={s.source ? "ok" : "warn"} />
          {s.source ? (
            <span className="text-fg-2">
              {s.source === "site" ? "задан" : "задан в Vercel"} {s.preview && <span className="num text-fg-3">{s.preview}</span>}
            </span>
          ) : (
            <span className="text-warn">не задан</span>
          )}
        </span>
      </div>
      <ActionForm action={saveSetting} className="mt-4">
        <input type="hidden" name="key" value={s.key} />
        <div className="flex flex-wrap gap-2">
          <input
            name="value"
            type={s.secret ? "password" : "text"}
            autoComplete="off"
            placeholder={s.source ? "Новое значение" : "Значение"}
            className="field num flex-1 min-w-[240px]"
          />
          <SubmitButton variant="secondary">Сохранить</SubmitButton>
          {s.source === "site" && (
            <SubmitButton variant="ghost" name="clear" value="1" confirm="Удалить значение?">
              Удалить
            </SubmitButton>
          )}
        </div>
      </ActionForm>
    </div>
  );
}

function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 h-11 text-[13px]">
      <span className="text-fg-3">{label}</span>
      <span className="text-fg text-right">{children}</span>
    </div>
  );
}

export default async function SettingsPage(props: PageProps<"/admin/settings">) {
  const sp = await props.searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "general") as TabKey;
  const [settings, workshop, info, mapImages, disabledMaps] = await Promise.all([
    getSettingsStatus(),
    getWorkshopMaps(),
    workshopInfo(),
    getMapImages(),
    getDisabledMaps(),
  ]);
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const href = (k: string) => (k === "general" ? "/admin/settings" : `/admin/settings?tab=${k}`);
  const settingTab = TAB_SETTING[tab];
  const unchecked = workshop.filter((w) => !info[w.split("@")[1]]).length;
  const broken = workshop.filter((w) => info[w.split("@")[1]] && !info[w.split("@")[1]].ok).length;

  return (
    <div className="space-y-6">
      <AdminHeader
        eyebrow="F16 Control"
        title="Настройки"
        description="Ключи хранятся в базе и читаются только сервером сайта. Значения не показываются целиком и не пишутся в журнал."
      />
      <div className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-8 items-start">
        {/* категории */}
        <nav aria-label="Разделы настроек" className={`${ADMIN_CARD} p-2 lg:sticky lg:top-6 flex lg:flex-col gap-0.5 overflow-x-auto`}>
          {TABS.map((t) => {
            const warn =
              (t.key === "workshop" && (broken > 0 || unchecked > 0)) ||
              (TAB_SETTING[t.key] && !byKey.get(TAB_SETTING[t.key]!)?.source);
            return (
              <Link
                key={t.key}
                href={href(t.key)}
                aria-current={tab === t.key ? "page" : undefined}
                className={`relative flex h-10 items-center justify-between gap-3 rounded-[8px] px-3 text-[13px] whitespace-nowrap transition ${tab === t.key ? "bg-accent/[0.08] text-fg" : "text-fg-3 hover:text-fg-2 hover:bg-white/[0.03]"}`}
              >
                {tab === t.key && <span className="hidden lg:block absolute left-0 top-2.5 bottom-2.5 w-[2px] rounded-full bg-accent" />}
                {t.label}
                {warn && <span className={`size-1.5 rounded-full ${t.key === "workshop" && broken ? "bg-danger" : "bg-warn"}`} />}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          <div>
            <AdminLabel>Раздел</AdminLabel>
            <h2 className="mt-2 text-[22px] font-semibold tracking-[-0.01em]">{TABS.find((t) => t.key === tab)?.label}</h2>
          </div>

      {tab === "general" && (
        <Panel title="Состояние">
          <div className="rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 divide-y divide-white/[0.06] max-w-2xl">
            {settings.map((s) => (
              <Link
                key={s.key}
                href={href(Object.entries(TAB_SETTING).find(([, v]) => v === s.key)?.[0] ?? "general")}
                className="flex items-center gap-3 px-4 h-11 text-[13px] hover:bg-white/[0.03]"
              >
                <Dot tone={s.source ? "ok" : "warn"} />
                <span className="flex-1">{s.label}</span>
                <span className={s.source ? "text-fg-3" : "text-warn"}>{s.source ? (s.source === "site" ? "задан" : "в Vercel") : "не задан"}</span>
              </Link>
            ))}
            <Link href={href("workshop")} className="flex items-center gap-3 px-4 h-11 text-[13px] hover:bg-white/[0.03]">
              <Dot tone={broken ? "danger" : unchecked ? "warn" : "ok"} />
              <span className="flex-1">Workshop-карты</span>
              <span className="text-fg-3">
                {workshop.length} в библиотеке{broken ? ` · ${broken} не грузятся` : ""}
                {unchecked ? ` · ${unchecked} проверяются` : ""}
              </span>
            </Link>
          </div>
        </Panel>
      )}

      {settingTab && byKey.get(settingTab) && <SettingForm s={byKey.get(settingTab)!} />}

      {tab === "maps" && (
        <div className="space-y-8">
          <p className="text-[13px] text-fg-3 max-w-3xl">
            Все официальные карты CS2, которые есть на серверах. «Доступна» — карта предлагается в форме турнира, «Скрыта» — нет.
            Нажмите на карту, чтобы загрузить картинку (PNG, JPG или WEBP до 3 МБ, лучше широкую) — она появится на странице
            турнира и в вето, сайт сам её затемнит.
          </p>
          <Panel title="Официальные карты">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
              {CS2_MAPS.map((m) => (
                <MapCard key={m.id} map={m.id} image={mapImages[m.id] ?? null} enabled={!disabledMaps.includes(m.id)} />
              ))}
            </div>
          </Panel>
          {workshop.length > 0 && (
            <Panel title="Карты из Workshop">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                {workshop.map((w) => (
                  <MapCard key={w} map={w} image={mapImages[w] ?? null} enabled toggleable={false} />
                ))}
              </div>
            </Panel>
          )}
        </div>
      )}

      {tab === "workshop" && (
        <div className="space-y-6 max-w-3xl">
          <p className="text-[13px] text-fg-3">
            Например aim_map для дуэлей. Добавьте один раз — карта появится в форме любого турнира. Сервер сам скачивает её по ID и
            проверяет, грузится ли она в CS2.
          </p>
          {workshop.length > 0 && (
            <div className="rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 divide-y divide-white/[0.06]">
              {workshop.map((w) => {
                const [name, id] = w.split("@");
                const i = info[id];
                return (
                  <ActionForm key={w} action={editWorkshopMaps}>
                    <input type="hidden" name="remove" value={w} />
                    <div className="flex items-center gap-3 px-4 h-12 text-[13px]">
                      <span className="font-medium w-40 truncate">{name}</span>
                      <a
                        href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="num text-[12px] text-fg-3 hover:text-accent"
                      >
                        {id} ↗
                      </a>
                      <span className="flex-1 text-right">
                        {!i ? (
                          <span className="text-[12px] text-warn">проверяется…</span>
                        ) : i.ok ? (
                          <span className="text-[12px] text-ok" title={`загрузилась за ${i.seconds} с`}>
                            ✓ {i.map}
                          </span>
                        ) : (
                          <span className="text-[12px] text-danger" title={i.note}>
                            ✕ не грузится в CS2
                          </span>
                        )}
                      </span>
                      <SubmitButton variant="ghost" size="sm" confirm={`Убрать ${name} из библиотеки?`}>
                        ✕
                      </SubmitButton>
                    </div>
                  </ActionForm>
                );
              })}
            </div>
          )}
          <ActionForm action={editWorkshopMaps}>
            <div className="flex flex-wrap gap-2">
              <input name="name" placeholder="aim_map" className="field w-40" />
              <input name="link" placeholder="https://steamcommunity.com/sharedfiles/filedetails/?id=…" className="field flex-1 min-w-[240px] num" />
              <SubmitButton variant="secondary">Добавить карту</SubmitButton>
            </div>
          </ActionForm>
        </div>
      )}

      {tab === "servers" && <ServersInfo />}

      {tab === "broadcast" && (
        <p className="text-[13px] text-fg-3 max-w-2xl">
          Observer-аккаунты пускаются на сервер любого матча зрителями — для трансляции с ПК 801–805.
        </p>
      )}

      {tab === "security" && (
        <div className="space-y-6 max-w-2xl">
          <div className="rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 divide-y divide-white/[0.06]">
            <InfoRow label="Вход">Только через Steam OpenID</InfoRow>
            <InfoRow label="Администраторы из Vercel (ADMIN_STEAM_IDS)">
              <span className="num">{env.adminSteamIds.length}</span>
            </InfoRow>
            <InfoRow label="Ключи API">хранятся в базе, только на сервере</InfoRow>
            <InfoRow label="Агент серверов">токен AGENT_TOKEN, только исходящие запросы</InfoRow>
          </div>
          <p className="text-[13px] text-fg-3">
            Права администратора выдаются на странице{" "}
            <Link href="/admin/players" className="text-accent hover:underline">
              Игроки
            </Link>
            . Все действия пишутся в{" "}
            <Link href="/admin/logs" className="text-accent hover:underline">
              Журнал
            </Link>
            .
          </p>
        </div>
      )}
        </div>
      </div>
    </div>
  );
}

async function ServersInfo() {
  const { host, online } = await getServerState();
  const info = (host?.info ?? {}) as Record<string, string | number>;
  const versions = ((host?.info as { versions?: Record<string, string> } | undefined)?.versions ?? {}) as Record<string, string>;
  const bundle = getAgentBundle().version;
  return (
    <div className="space-y-4 max-w-2xl">
      <div className="rounded-[12px] border border-[#17243a] bg-[#0a111b]/90 divide-y divide-white/[0.06]">
        <InfoRow label="F16 Server Agent">
          <span className="flex items-center gap-2">
            <Dot tone={online ? "ok" : "danger"} />
            {online ? "на связи" : `не на связи${host?.last_seen_at ? ` с ${formatShortDateTime(host.last_seen_at)}` : ""}`}
          </span>
        </InfoRow>
        <InfoRow label="Версия агента">
          <span className={`num ${info.agent_version === bundle ? "text-ok" : "text-warn"}`}>{info.agent_version ?? "—"}</span>
          <span className="num text-fg-3"> / сайт {bundle}</span>
        </InfoRow>
        <InfoRow label="LAN IP"><span className="num">{host?.lan_ip ?? "—"}</span></InfoRow>
        <InfoRow label="CS2 build"><span className="num">{info.cs2_build ?? "—"}</span></InfoRow>
        <InfoRow label="Metamod"><span className="num">{versions.metamod ?? "—"}</span></InfoRow>
        <InfoRow label="CounterStrikeSharp"><span className="num">{versions.counterstrikesharp ?? "—"}</span></InfoRow>
        <InfoRow label="MatchZy"><span className="num">{versions.matchzy ?? "—"}</span></InfoRow>
      </div>
      <p className="text-[13px] text-fg-3">
        Конфиги MatchZy и инстансов берутся из репозитория и доезжают до серверного ПК автоматически. Обновления и перезапуск —{" "}
        <Link href="/admin/servers" className="text-accent hover:underline">
          Серверы
        </Link>
        .
      </p>
    </div>
  );
}
