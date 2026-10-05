/** Only known domain errors may be shown to players; SQL details stay on the server. */
export function registrationError(error: { code?: string; message: string }): string {
  if (error.code === "23505") return "Кто-то из игроков уже заявлен на этот турнир в другой команде. Прежний состав сохранён.";
  const messages: Record<string, string> = {
    registration_closed: "Регистрация на турнир закрыта или ещё не открылась",
    captain_required: "Действие недоступно: проверьте права капитана",
    player_banned: "В составе есть заблокированный игрок",
    invalid_player: "Проверьте блокировки и SteamID игроков состава",
    invalid_roster: "Состав не соответствует формату турнира. Обновите заявку.",
    membership_changed: "Состав команды изменился. Обновите страницу и выберите игроков заново.",
    tournament_full: "Все места в турнире уже заняты",
    registration_missing: "Одобренная заявка не найдена. Обновите страницу.",
    checkin_closed: "Check-in сейчас закрыт",
  };
  if (messages[error.message]) return messages[error.message];
  console.error("registration transaction failed", error.code, error.message);
  return "Не удалось сохранить изменения. Попробуйте ещё раз.";
}
