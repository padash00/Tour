import type { Metadata } from "next";
import { adminTelegramBroadcast, adminTelegramConnect, adminChatInviteEveryone, adminTelegramModeration, adminTelegramPardonAll, adminTelegramPardonUser } from "@/app/actions/admin-telegram";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { TG_ALLOWED_UPDATES, telegramConfig, telegramGroup, tgCall } from "@/lib/telegram";
import { formatShortDateTime } from "@/lib/format";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AdminHeader, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Telegram — F16 Control" };
export const dynamic = "force-dynamic";

/** Telegram-бот: статус, подключение вебхука, рассылка */
export default async function AdminTelegramPage() {
  await requireAdmin("/admin/telegram");
  const cfg = await telegramConfig();
  const group = await telegramGroup();
  const [{ count: everyone }, { count: linked }, { count: profiles }, info, { data: tournaments }, { data: modLog }] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }).eq("is_banned", false),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }).not("telegram_chat_id", "is", null),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }),
    cfg.token ? tgCall<{ url: string; pending_update_count: number; last_error_message?: string; allowed_updates?: string[] }>(cfg.token, "getWebhookInfo", {}) : Promise.resolve(null),
    db().from("tournaments").select("id, name").not("status", "in", "(finished,cancelled,draft)").order("starts_at", { ascending: true }),
    db().from("audit_logs").select("id, action, created_at, payload").like("action", "tg.%").order("created_at", { ascending: false }).limit(500),
  ]);
  const hooked = !!info?.ok && !!info.result?.url;
  const punished = punishedUsers(modLog ?? []);
  const violations = (modLog ?? []).filter((l) => l.action !== "tg.captcha").slice(0, 60);
  // новые события (кнопка «Я не бот», изменённые сообщения) приходят только после переподключения
  const needsReconnect = hooked && !TG_ALLOWED_UPDATES.every((u) => (info?.result?.allowed_updates ?? ["message"]).includes(u));

  return (
    <div className="space-y-8">
      <AdminHeader
        title="Telegram"
        description={cfg.username ? `Бот @${cfg.username}. Игроки подтверждают Telegram в анкете — бот дублирует им уведомления сайта.` : "Бот не настроен: впишите токен и имя бота в «Настройки»."}
      />

      <Panel title="Состояние" boxed>
        <div className="space-y-3 p-5 text-[15px]">
          <p>
            Подтвердили Telegram: <b>{linked ?? 0}</b> из {profiles ?? 0} игроков с анкетой
          </p>
          <p>
            Приём сообщений бота:{" "}
            {hooked ? <b className="text-ok">подключён</b> : <b className="text-danger">не подключён</b>}
            {info?.result?.last_error_message ? <span className="text-danger"> · последняя ошибка: {info.result.last_error_message}</span> : null}
          </p>
          {needsReconnect ? <p className="font-medium text-warn">Нажмите «Переподключить бота» — иначе модерация чата работает не полностью (кнопка «Я не бот», изменённые сообщения).</p> : null}
          {group.id ? (
            <div className="flex flex-wrap items-center gap-3">
              <p>
                Общий чат: <b>{group.title || group.id}</b> — модерация{" "}
                {group.moderation ? <b className="text-ok">включена</b> : <b className="text-fg-3">выключена</b>}
                <span className="text-fg-3"> (мат, оскорбления, реклама, флуд, проверка новичков)</span>
              </p>
              <ActionForm action={adminTelegramModeration}>
                <input type="hidden" name="on" value={group.moderation ? "0" : "1"} />
                <SubmitButton variant="secondary" size="sm">{group.moderation ? "Выключить модерацию" : "Включить модерацию"}</SubmitButton>
              </ActionForm>
            </div>
          ) : null}
          <ActionForm action={adminTelegramConnect}>
            <SubmitButton variant={hooked ? "secondary" : "primary"}>{hooked ? "Переподключить бота" : "Подключить бота"}</SubmitButton>
          </ActionForm>
        </div>
      </Panel>

      <Panel title="Пригласить всех в Telegram-чат" boxed>
        <ActionForm action={adminChatInviteEveryone} className="space-y-4 p-5 text-[15px]">
          <p>
            Чат: <a href={group.invite} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">{group.invite}</a>
          </p>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
            Текст (необязательно)
            <textarea name="text" rows={3} maxLength={1000} className="field min-h-[90px] py-3" placeholder="Турниры, лобби, поиск тиммейтов и новости клуба — всё в одном чате. Заходите!" />
          </label>
          <SubmitButton confirm={`Отправить приглашение в чат всем игрокам сайта (${everyone ?? 0})? Повторное нажатие пришлёт его ещё раз.`}>Пригласить всех ({everyone ?? 0})</SubmitButton>
          <p className="text-[13px] text-fg-3">
            Каждому игроку — уведомление на сайте (колокольчик, ведёт в чат). Кто подтвердил Telegram ({linked ?? 0}) — ещё и сообщение от бота с кнопкой «Вступить в чат».
          </p>
        </ActionForm>
      </Panel>

      <Panel title="Рассылка" boxed>
        <ActionForm action={adminTelegramBroadcast} className="space-y-4 p-5">
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
            Кому
            <select name="audience" className="field max-w-md" defaultValue="all">
              <option value="all">Всем, кто подтвердил Telegram</option>
              {(tournaments ?? []).map((t) => (
                <option key={t.id} value={`t:${t.id}`}>
                  Участникам «{t.name}» (команды с заявкой)
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
            Сообщение
            <textarea name="text" required rows={5} maxLength={3500} className="field min-h-[120px] py-3" placeholder="Например: регистрация у судей 14 ноября с 9:30, начало игр в 10:30. Возьмите удостоверение личности." />
          </label>
          <SubmitButton confirm="Отправить сообщение выбранным игрокам в Telegram?">Отправить</SubmitButton>
          <p className="text-[13px] text-fg-3">Получат только те, кто подтвердил Telegram через бота. Остальным пишите в WhatsApp — номера в анкетах.</p>
        </ActionForm>
      </Panel>

      <Panel title="Наказанные участники чата" boxed>
        {punished.length === 0 ? (
          <p className="p-5 text-[14px] text-fg-3">Сейчас никто не наказан.</p>
        ) : (
          <div className="divide-y divide-line-subtle">
            {punished.map((u) => (
              <div key={u.user} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3 text-[14px]">
                <span className="min-w-[180px] flex-1 font-semibold">
                  {u.name}
                  {u.username ? <span className="font-normal text-fg-3"> @{u.username}</span> : null}
                </span>
                <span className="flex flex-wrap gap-2">
                  {u.warns > 0 && <span className="rounded-full bg-warn-dim px-2.5 py-0.5 text-[13px] font-semibold text-warn">предупреждений {u.warns}/5</span>}
                  {u.mutedUntil && <span className="rounded-full bg-warn-dim px-2.5 py-0.5 text-[13px] font-semibold text-warn">мут до {formatShortDateTime(u.mutedUntil)}</span>}
                  {u.banned && <span className="rounded-full bg-danger-dim px-2.5 py-0.5 text-[13px] font-semibold text-danger">бан</span>}
                  {u.captcha && <span className="rounded-full bg-surface-3 px-2.5 py-0.5 text-[13px] font-semibold text-fg-2">новичок, ждёт «Я не бот»</span>}
                </span>
                <span className="flex flex-wrap gap-2">
                  {u.warns > 0 && <PardonButton user={u.user} name={u.name} op="unwarn" label="−1 предупреждение" />}
                  {(u.mutedUntil || u.captcha) && <PardonButton user={u.user} name={u.name} op="unmute" label="Снять мут" />}
                  {u.banned && <PardonButton user={u.user} name={u.name} op="unban" label="Разбанить" />}
                  <PardonButton user={u.user} name={u.name} op="all" label="Снять всё" />
                </span>
              </div>
            ))}
          </div>
        )}
      </Panel>

      <Panel title="Нарушения в чате" boxed>
        <ActionForm action={adminTelegramPardonAll} className="border-b border-line-subtle p-5">
          <SubmitButton variant="secondary" confirm="Снять все наказания бота: разбанить, снять муты и обнулить предупреждения у всех?">Снять все наказания</SubmitButton>
        </ActionForm>
        {violations.length === 0 ? (
          <p className="p-5 text-[14px] text-fg-3">Пока нарушений нет. Команды ответом на сообщение в группе: /warn [причина], /unwarn, /warns, /mute 1h, /unmute, /ban, /unban.</p>
        ) : (
          <div className="divide-y divide-line-subtle">
            {violations.map((l) => {
              const p = (l.payload ?? {}) as { name?: string; username?: string | null; reason?: string; match?: string | null; text?: string; seconds?: number | null; by?: string };
              return (
                <div key={l.id} className="grid gap-1 px-5 py-3 text-[14px] sm:grid-cols-[110px_200px_minmax(0,1fr)] sm:gap-4">
                  <span className="num text-fg-3">{formatShortDateTime(l.created_at)}</span>
                  <span className="min-w-0 truncate font-semibold">
                    {p.name ?? "?"}
                    {p.username ? <span className="font-normal text-fg-3"> @{p.username}</span> : null}
                  </span>
                  <span className="min-w-0">
                    <b className={l.action === "tg.ban" ? "text-danger" : l.action === "tg.mute" || l.action === "tg.warn" ? "text-warn" : "text-ok"}>{MOD_LABEL[l.action] ?? l.action}</b>
                    {p.seconds ? ` ${Math.round(p.seconds / 60)} мин` : ""}
                    {p.reason ? ` — ${p.reason}` : ""}
                    {p.match ? <span className="text-fg-3"> (слово: «{p.match}»)</span> : null}
                    {p.by ? <span className="text-fg-3"> · {p.by}</span> : null}
                    {p.text ? (
                      <details className="mt-0.5 text-[13px] text-fg-3">
                        <summary className="cursor-pointer truncate">«{p.text.slice(0, 120)}{p.text.length > 120 ? "…" : ""}»</summary>
                        <p className="mt-1 whitespace-pre-wrap break-words rounded-control bg-surface-2 p-3 text-fg-2">{p.text}</p>
                      </details>
                    ) : null}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </Panel>
    </div>
  );
}

const MOD_LABEL: Record<string, string> = {
  "tg.warn": "предупреждение",
  "tg.unwarn": "снято предупреждение",
  "tg.mute": "мут",
  "tg.unmute": "снят мут",
  "tg.ban": "бан",
  "tg.unban": "разбан",
  "tg.captcha": "новичок: ждёт «Я не бот»",
};

function PardonButton({ user, name, op, label }: { user: string; name: string; op: string; label: string }) {
  return (
    <ActionForm action={adminTelegramPardonUser} inline>
      <input type="hidden" name="user" value={user} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="op" value={op} />
      <SubmitButton variant="secondary" size="sm">
        {label}
      </SubmitButton>
    </ActionForm>
  );
}

type ModRow = { action: string; created_at: string; payload: unknown };
type Punished = { user: string; name: string; username: string | null; warns: number; mutedUntil: string | null; banned: boolean; captcha: boolean };

/** Кто сейчас наказан: предупреждения за 30 дней, активный мут, бан, ожидание «Я не бот» (журнал приходит новыми сверху) */
function punishedUsers(rows: ModRow[]): Punished[] {
  const since = Date.now() - 30 * 86_400_000;
  const map = new Map<string, Punished>();
  // от старых к новым — последнее событие перекрывает прежние
  for (const r of [...rows].reverse()) {
    const p = (r.payload ?? {}) as { user?: string; name?: string | null; username?: string | null; seconds?: number | null };
    if (!p.user) continue;
    const u = map.get(p.user) ?? { user: p.user, name: p.name || p.user, username: p.username ?? null, warns: 0, mutedUntil: null, banned: false, captcha: false };
    if (p.name) u.name = p.name;
    if (p.username) u.username = p.username;
    const at = new Date(r.created_at).getTime();
    if (r.action === "tg.warn" && at >= since) u.warns++;
    if (r.action === "tg.unwarn" && at >= since) u.warns = Math.max(0, u.warns - 1);
    if (r.action === "tg.mute") u.mutedUntil = new Date(at + (p.seconds ?? 3600) * 1000).toISOString();
    if (r.action === "tg.ban") u.banned = true;
    if (r.action === "tg.captcha") u.captcha = true;
    if (r.action === "tg.unmute" || r.action === "tg.unban") {
      u.mutedUntil = null;
      u.captcha = false;
    }
    if (r.action === "tg.unban") u.banned = false;
    map.set(p.user, u);
  }
  const now = Date.now();
  return [...map.values()]
    .map((u) => ({ ...u, mutedUntil: u.mutedUntil && new Date(u.mutedUntil).getTime() > now ? u.mutedUntil : null }))
    .filter((u) => u.warns > 0 || u.mutedUntil || u.banned || u.captcha);
}

