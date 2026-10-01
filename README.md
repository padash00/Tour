# F16 Arena — турнирная платформа CS2

Next.js (App Router) на Vercel, база — Supabase. Вход только через Steam.

## Деплой

`main` → GitHub → Vercel автоматически. Локальный запуск не обязателен.

Переменные окружения (Vercel → Project → Settings → Environment Variables) — см. `.env.example`.

## База данных

Миграции лежат в `supabase/migrations/`. Применяются по порядку
(Supabase → SQL Editor, либо `supabase db push`).

## Этапы

1. **Регистрация** — Steam, FACEIT, команды, инвайты, заявки, check-in, админка. ✅
2. **Турнир** — сетка Double Elimination, посев, вето, страницы матчей, ручной ввод результата.
3. **Сервер** — F16 Server Agent, MatchZy, выдача IP, автоматический результат.
4. **Статистика** — F16Stats, live, MVP.
5. **Трансляция** — HUD, Broadcast Controller.

## Устройство

- `src/lib/steam.ts` — Steam OpenID 2.0 (проверка `check_authentication`) и профиль.
- `src/lib/session.ts` — своя сессия: подписанный JWT в httpOnly cookie.
- `src/lib/supabase.ts` — серверный клиент с service role. Все записи идут только через сервер,
  RLS включён на всех таблицах, публично читаются только публичные данные.
- `src/app/actions/*` — серверные действия (команды, заявки, админка). Каждое ручное действие пишется в `audit_logs`.
- Администраторы: `ADMIN_STEAM_IDS` в env или флаг `is_admin` (выдаётся в админке).
