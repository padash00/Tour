import type { Metadata } from "next";
import { adminTelegramBroadcast, adminTelegramConnect, adminChatInviteEveryone } from "@/app/actions/admin-telegram";
import { requireAdmin } from "@/lib/auth";
import { db } from "@/lib/supabase";
import { telegramConfig, telegramGroup, tgCall } from "@/lib/telegram";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AdminHeader, Panel } from "@/components/admin/control";

export const metadata: Metadata = { title: "Telegram — F16 Control" };
export const dynamic = "force-dynamic";

/** Telegram-бот: статус, подключение вебхука, рассылка */
export default async function AdminTelegramPage() {
  await requireAdmin("/admin/telegram");
  const cfg = await telegramConfig();
  const group = await telegramGroup();
  const [{ count: everyone }, { count: linked }, { count: profiles }, info, { data: tournaments }] = await Promise.all([
    db().from("players").select("id", { count: "exact", head: true }).eq("is_banned", false),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }).not("telegram_chat_id", "is", null),
    db().from("player_profiles").select("player_id", { count: "exact", head: true }),
    cfg.token ? tgCall<{ url: string; pending_update_count: number; last_error_message?: string; allowed_updates?: string[] }>(cfg.token, "getWebhookInfo", {}) : Promise.resolve(null),
    db().from("tournaments").select("id, name").not("status", "in", "(finished,cancelled,draft)").order("starts_at", { ascending: true }),
  ]);
  const hooked = !!info?.ok && !!info.result?.url;

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
    </div>
  );
}
