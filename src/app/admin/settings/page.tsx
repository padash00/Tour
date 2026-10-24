import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { editWorkshopMaps, saveSetting, setProfileRequired, setServerOpenJoin, setServerSkins } from "@/app/actions/admin-settings";
import { ActionToggle } from "@/components/admin/action-toggle";
import { isProfileRequired } from "@/lib/profiles";
import { getServerState, workshopInfo } from "@/lib/server-control";
import { getAgentBundle } from "@/lib/agent-bundle";
import { env } from "@/lib/env";
import { formatShortDateTime } from "@/lib/format";
import { getDisabledMaps, getMapImages, getSettingsStatus, getWorkshopMaps, isServerOpenJoin, isServerSkins, type SettingKey } from "@/lib/settings";
import { CS2_MAPS } from "@/lib/maps";
import { MapCard } from "@/components/admin/map-card";
import { ActionForm, SubmitButton } from "@/components/forms";
import { ADMIN_CARD, AdminHeader, Dot, Panel } from "@/components/admin/control";
import { requireAdmin } from "@/lib/auth";

export const metadata: Metadata = { title: "Настройки — F16 Control" };

const TABS = [
  { key: "general", label: "Общие" },
  { key: "maps", label: "Карты" },
  { key: "steam", label: "Steam" },
  { key: "faceit", label: "FACEIT" },
  { key: "workshop", label: "Карты из Workshop" },
  { key: "servers", label: "Серверы" },
  { key: "broadcast", label: "Трансляция" },
  { key: "security", label: "Безопасность" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const TAB_SETTING: Partial<Record<TabKey, SettingKey>> = {
  steam: "STEAM_API_KEY",
  faceit: "FACEIT_API_KEY",
  broadcast: "OBSERVER_STEAM_IDS",
  servers: "PLAYER_IP",
};

type SettingRow = Awaited<ReturnType<typeof getSettingsStatus>>[number];

function SettingForm({ s }: { s: SettingRow }) {
  return (
    <div className={`${ADMIN_CARD} p-6 max-w-2xl`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="text-[17px] font-bold">{s.label}</div>
          <div className="mt-0.5 text-[13px] text-fg-3">{s.hint}</div>
        </div>
        <span className="flex items-center gap-2 text-[13px]">
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
    <div className="flex items-center justify-between gap-4 px-5 min-h-12 py-2 text-[15px]">
      <span className="text-fg-3">{label}</span>
      <span className="text-fg text-right">{children}</span>
    </div>
  );
}

export default async function SettingsPage(props: PageProps<"/admin/settings">) {
  await requireAdmin("/admin/settings"); // права проверяются в каждой странице, не только в layout
  const sp = await props.searchParams;
  const tab: TabKey = (TABS.find((t) => t.key === sp.tab)?.key ?? "general") as TabKey;
  const [settings, workshop, info, mapImages, disabledMaps, profileRequired, openJoin, skins] = await Promise.all([
    getSettingsStatus(),
    getWorkshopMaps(),
    workshopInfo(),
    getMapImages(),
    getDisabledMaps(),
    isProfileRequired(),
    isServerOpenJoin(),
    isServerSkins(),
  ]);
  const byKey = new Map(settings.map((s) => [s.key, s]));
  const href = (k: string) => (k === "general" ? "/admin/settings" : `/admin/settings?tab=${k}`);
  const settingTab = TAB_SETTING[tab];
  const unchecked = workshop.filter((w) => !info[w.split("@")[1]]).length;
  const broken = workshop.filter((w) => info[w.split("@")[1]] && !info[w.split("@")[1]].ok).length;

  return (
    <div className="space-y-6">
      <AdminHeader
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
                className={`relative flex h-11 items-center justify-between gap-3 rounded-control px-4 text-[15px] font-semibold whitespace-nowrap transition ${tab === t.key ? "bg-accent text-white" : "text-fg-2 hover:bg-surface-2"}`}
              >
                                {t.label}
                {warn && <span className={`size-1.5 rounded-full ${t.key === "workshop" && broken ? "bg-danger" : "bg-warn"}`} />}
              </Link>
            );
          })}
        </nav>

        <div className="min-w-0 space-y-6">
          <div>
            <h2 className="text-[24px] font-bold tracking-[-0.01em]">{TABS.find((t) => t.key === tab)?.label}</h2>
          </div>

      {tab === "general" && (
        <Panel title="Анкета игрока">
          <div className={`${ADMIN_CARD} flex max-w-2xl flex-wrap items-start justify-between gap-4 p-6`}>
            <div className="max-w-md">
              <div className="text-[17px] font-bold text-fg">Анкета обязательна</div>
              <p className="mt-1 text-[14px] leading-relaxed text-fg-3">
                Без заполненной анкеты (ФИО, дата рождения, телефон, место учёбы или работы) игрок не может создать команду, вступить в
                неё и подать заявку на турнир. Выключено — только напоминание. Смотреть сайт, лобби и матчи можно всегда; для
                официальных турниров анкеты игроков обязательны в любом случае.
              </p>
            </div>
            <ActionToggle action={setProfileRequired} fields={{}} on={profileRequired} label="Анкета обязательна" onLabel="Обязательна" offLabel="Напоминание" />
          </div>
        </Panel>
      )}

      {tab === "general" && (
        <Panel title="Игровые серверы">
          <div className={`${ADMIN_CARD} flex max-w-2xl flex-wrap items-start justify-between gap-4 p-6`}>
            <div className="max-w-md">
              <div className="text-[17px] font-bold text-fg">Пускать на серверы всех</div>
              <p className="mt-1 text-[14px] leading-relaxed text-fg-3">
                Включено — зайти на сервер может любой: наблюдатели, оператор трансляции, тренировка с ботами. Во время матча
                играют только составы с сайта, остальные смотрят. Выключено — без загруженного матча сервер никого не пускает.
                GOTV (порт игры + 5) открыт всегда.
              </p>
            </div>
            <ActionToggle action={setServerOpenJoin} fields={{}} on={openJoin} label="Пускать на серверы всех" onLabel="Всех" offLabel="Только матч" />
          </div>
          <div className={`${ADMIN_CARD} mt-4 flex max-w-2xl flex-wrap items-start justify-between gap-4 p-6`}>
            <div className="max-w-md">
              <div className="text-[17px] font-bold text-fg">Скины F16 на серверах</div>
              <p className="mt-1 text-[14px] leading-relaxed text-fg-3">
                Игроки выбирают в игре скины оружия, ножи, перчатки, агентов, музыку и значки: команды <b>!skins</b>, <b>!knife</b>,{" "}
                <b>!gloves</b>, <b>!agents</b>. Выбор сохраняется за игроком. Включение и выключение перезапускает свободные серверы;
                серверы с матчем — после окончания матча.
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-warn">
                Выдача предметов, которых нет в инвентаре, нарушает правила серверов Valve — есть риск блокировки токена сервера.
              </p>
            </div>
            <ActionToggle action={setServerSkins} fields={{}} on={skins} label="Скины F16 на серверах" onLabel="Включены" offLabel="Выключены" />
          </div>
        </Panel>
      )}

      {tab === "general" && (
        <Panel title="Состояние">
          <div className={`${ADMIN_CARD} divide-y divide-ink/[0.06] max-w-2xl`}>
            {settings.map((s) => (
              <Link
                key={s.key}
                href={href(Object.entries(TAB_SETTING).find(([, v]) => v === s.key)?.[0] ?? "general")}
                className="flex items-center gap-3 px-5 min-h-12 py-2 text-[15px] hover:bg-surface-2"
              >
                <Dot tone={s.source ? "ok" : "warn"} />
                <span className="flex-1">{s.label}</span>
                <span className={s.source ? "text-fg-3" : "text-warn"}>{s.source ? (s.source === "site" ? "задан" : "в Vercel") : "не задан"}</span>
              </Link>
            ))}
            <Link href={href("workshop")} className="flex items-center gap-3 px-5 min-h-12 py-2 text-[15px] hover:bg-surface-2">
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
      {tab === "servers" && byKey.get("BACKUP_RETENTION_DAYS") && <SettingForm s={byKey.get("BACKUP_RETENTION_DAYS")!} />}
      {tab === "servers" && byKey.get("DEMO_RETENTION_DAYS") && <SettingForm s={byKey.get("DEMO_RETENTION_DAYS")!} />}

      {tab === "maps" && (
        <div className="space-y-8">
          <p className="text-[14px] text-fg-3 max-w-3xl">
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
          <p className="text-[14px] text-fg-3">
            Например aim_map для дуэлей. Добавьте один раз — карта появится в форме любого турнира. Сервер сам скачивает её по ID и
            проверяет, грузится ли она в CS2.
          </p>
          {workshop.length > 0 && (
            <div className={`${ADMIN_CARD} divide-y divide-ink/[0.06]`}>
              {workshop.map((w) => {
                const [name, id] = w.split("@");
                const i = info[id];
                return (
                  <ActionForm key={w} action={editWorkshopMaps}>
                    <input type="hidden" name="remove" value={w} />
                    <div className="flex items-center gap-3 px-5 min-h-14 py-2 text-[15px]">
                      <span className="font-medium w-40 truncate">{name}</span>
                      <a
                        href={`https://steamcommunity.com/sharedfiles/filedetails/?id=${id}`}
                        target="_blank"
                        rel="noreferrer"
                        className="num text-[13px] text-fg-3 hover:text-accent"
                      >
                        {id} ↗
                      </a>
                      <span className="flex-1 text-right">
                        {!i ? (
                          <span className="text-[13px] text-warn">проверяется…</span>
                        ) : i.ok ? (
                          <span className="text-[13px] text-ok" title={`загрузилась за ${i.seconds} с`}>
                            ✓ {i.map}
                          </span>
                        ) : (
                          <span className="text-[13px] text-danger" title={i.note}>
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
        <p className="text-[14px] text-fg-3 max-w-2xl">
          Аккаунты наблюдателей заходят на сервер любого матча как зрители — для трансляции с ПК 801–805.
        </p>
      )}

      {tab === "security" && (
        <div className="space-y-6 max-w-2xl">
          <div className={`${ADMIN_CARD} divide-y divide-ink/[0.06]`}>
            <InfoRow label="Вход">Только через Steam OpenID</InfoRow>
            <InfoRow label="Администраторы из Vercel (ADMIN_STEAM_IDS)">
              <span className="num">{env.adminSteamIds.length}</span>
            </InfoRow>
            <InfoRow label="Ключи API">хранятся в базе, только на сервере</InfoRow>
            <InfoRow label="Агент серверов">токен AGENT_TOKEN, только исходящие запросы</InfoRow>
          </div>
          <p className="text-[14px] text-fg-3">
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
      <div className={`${ADMIN_CARD} divide-y divide-ink/[0.06]`}>
        <InfoRow label="Программа на серверном ПК (агент)">
          <span className="flex items-center gap-2">
            <Dot tone={online ? "ok" : "danger"} />
            {online ? "на связи" : `не на связи${host?.last_seen_at ? ` с ${formatShortDateTime(host.last_seen_at)}` : ""}`}
          </span>
        </InfoRow>
        <InfoRow label="Версия агента">
          <span className={`num ${info.agent_version === bundle ? "text-ok" : "text-warn"}`}>{info.agent_version ?? "—"}</span>
          <span className="num text-fg-3"> / сайт {bundle}</span>
        </InfoRow>
        <InfoRow label="Адрес в локальной сети"><span className="num">{host?.lan_ip ?? "—"}</span></InfoRow>
        <InfoRow label="Версия CS2"><span className="num">{info.cs2_build ?? "—"}</span></InfoRow>
        <InfoRow label="Metamod"><span className="num">{versions.metamod ?? "—"}</span></InfoRow>
        <InfoRow label="CounterStrikeSharp"><span className="num">{versions.counterstrikesharp ?? "—"}</span></InfoRow>
        <InfoRow label="MatchZy"><span className="num">{versions.matchzy ?? "—"}</span></InfoRow>
      </div>
      <p className="text-[14px] text-fg-3">
        Конфиги MatchZy и инстансов берутся из репозитория и доезжают до серверного ПК автоматически. Обновления и перезапуск —{" "}
        <Link href="/admin/servers" className="text-accent hover:underline">
          Серверы
        </Link>
        .
      </p>
    </div>
  );
}
