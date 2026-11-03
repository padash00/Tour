import type { Metadata } from "next";
import { adminTelegramBroadcast, adminTelegramConnect, adminChatInviteEveryone, adminTelegramGroupLink, adminTelegramInviteAll } from "@/app/actions/admin-telegram";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { TG_ALLOWED_UPDATES, telegramConfig, telegramGroup, tgCall } from "@/lib/telegram";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AdminHeader, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Telegram — F16 Control" };
export const dynamic = "force-dynamic";

/** Telegram-бот: статус, подключение вебхука, рассылка */
export default async function AdminTelegramPage() {
  await requireAdmin("/admin/telegram");
  const cfg = await telegramConfig();
  const group = await telegramGroup();
  const [{ count: everyone }, { count: linked }, { count: profiles }, info, { data: tournaments }, members] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }).eq("is_banned", false),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }).not("telegram_chat_id", "is", null),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }),
    cfg.token ? tgCall<{ url: string; pending_update_count: number; last_error_message?: string; allowed_updates?: string[] }>(cfg.token, "getWebhookInfo", {}) : Promise.resolve(null),
    db().from("tournaments").select("id, name").not("status", "in", "(finished,cancelled,draft)").order("starts_at", { ascending: true }),
    cfg.token && group.id ? tgCall<number>(cfg.token, "getChatMemberCount", { chat_id: group.id }) : Promise.resolve(null),
  ]);
  const hooked = !!info?.ok && !!info.result?.url;
  // старое подключение получало только сообщения — без my_chat_member бот не узнает о группе
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
          {needsReconnect ? <p className="text-warn">Нажмите «Переподключить бота» — иначе он не увидит общий чат и заявки в него.</p> : null}
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

      <Panel title="Общий чат игроков" boxed>
        <div className="space-y-4 p-5 text-[15px]">
          {!group.id ? (
            <ol className="list-decimal space-y-1.5 pl-5">
              <li>Создайте группу в Telegram (например, «F16 Arena — игроки»).</li>
              <li>
                Добавьте туда бота {cfg.username ? <b>@{cfg.username}</b> : "турниров"} и сделайте администратором с правом «Приглашать по ссылке».
              </li>
              <li>Добавлять бота нужно с вашего Telegram, подтверждённого в анкете, — бот проверит, что вы администратор сайта, и пришлёт вам ответ.</li>
              <li>Обновите эту страницу.</li>
            </ol>
          ) : (
            <>
              <p>
                Группа: <b>{group.title || group.id}</b>
                {members?.ok ? <> · участников: <b>{members.result}</b></> : null}
                {members && !members.ok ? <span className="text-danger"> · бот не видит группу: {members.description}</span> : null}
              </p>
              {group.invite ? (
                <p className="break-all">
                  Ссылка: <a href={group.invite} target="_blank" rel="noreferrer" className="font-semibold text-accent underline">{group.invite}</a>
                  {" · "}
                  {group.closed ? "по заявке, бот принимает игроков сайта" : "открытая"}
                  <span className="block text-[13px] text-fg-3">На сайте она открывается по адресу /tg (пункт «Telegram-чат» в подвале).</span>
                </p>
              ) : (
                <p className="text-fg-3">Ссылки ещё нет — создайте её.</p>
              )}
              <ActionForm action={adminTelegramGroupLink} className="space-y-3">
                <label className="flex items-start gap-2.5 text-[14px]">
                  <input type="checkbox" name="closed" defaultChecked={group.closed} className="mt-1" />
                  <span>
                    Только для игроков сайта — вступление по заявке. Бот сам принимает тех, кто подтвердил Telegram в анкете; остальным пишет, как подтвердить. Защищает чат от спама.
                  </span>
                </label>
                <SubmitButton variant={group.invite ? "secondary" : "primary"} confirm={group.invite ? "Создать новую ссылку? Старая перестанет работать." : undefined}>
                  {group.invite ? "Новая ссылка" : "Создать ссылку"}
                </SubmitButton>
              </ActionForm>
              {group.invite ? (
                <ActionForm action={adminTelegramInviteAll} className="space-y-3 border-t border-line-subtle pt-4">
                  <label className="flex flex-col gap-1.5 text-[14px] font-semibold text-fg-2">
                    Текст приглашения (необязательно)
                    <textarea name="text" rows={3} maxLength={1500} className="field min-h-[90px] py-3" placeholder="Объявления турниров, поиск тиммейтов, лобби и общение — всё в одном чате. Заходите!" />
                  </label>
                  <SubmitButton confirm={`Отправить приглашение в чат всем, кто подтвердил Telegram (${linked ?? 0})?`}>Пригласить всех ({linked ?? 0})</SubmitButton>
                  <p className="text-[13px] text-fg-3">
                    Бот напишет в личку каждому, кто подтвердил Telegram, с кнопкой «Вступить в чат». Остальным дайте ссылку сами (WhatsApp, объявление в клубе) — и новые игроки получат её после подтверждения Telegram.
                  </p>
                </ActionForm>
              ) : null}
            </>
          )}
        </div>
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
    </div>
  );
}
