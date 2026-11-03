import { makeT, tr, type T } from "./i18n/core";

/** Only known domain errors may be shown to players; SQL details stay on the server. tx — язык ответа (по умолчанию русский: пульт). */
export function registrationError(error: { code?: string; message: string }, tx: T = makeT("ru")): string {
  if (error.code === "23505") return tx("Кто-то из игроков уже заявлен на этот турнир в другой команде. Прежний состав сохранён.");
  const messages: Record<string, string> = {
    registration_closed: tr("Регистрация на турнир закрыта или ещё не открылась"),
    captain_required: tr("Действие недоступно: проверьте права капитана"),
    player_banned: tr("В составе есть заблокированный игрок"),
    invalid_player: tr("Проверьте блокировки и SteamID игроков состава"),
    invalid_roster: tr("Состав не соответствует формату турнира. Обновите заявку."),
    membership_changed: tr("Состав команды изменился. Обновите страницу и выберите игроков заново."),
    tournament_full: tr("Все места в турнире уже заняты"),
    registration_missing: tr("Одобренная заявка не найдена. Обновите страницу."),
    checkin_closed: tr("Check-in сейчас закрыт"),
    not_official: tr("Условия турнира изменились. Обновите страницу."),
    profile_incomplete: tr("У кого-то из игроков не заполнена анкета. Обновите страницу и проверьте заявку."),
    age_out_of_range: tr("Кто-то из игроков не проходит по возрасту. Обновите страницу и проверьте заявку."),
    application_incomplete: tr("Заполните данные организации, ответственного лица и тренера."),
  };
  if (messages[error.message]) return tx(messages[error.message]);
  console.error("registration transaction failed", error.code, error.message);
  return tx("Не удалось сохранить изменения. Попробуйте ещё раз.");
}
