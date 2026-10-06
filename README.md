# F16 Arena — турнирная платформа CS2

Next.js (App Router) на Vercel, база — Supabase. Вход только через Steam.

## Деплой

`main` → GitHub → Vercel автоматически. Локальный запуск не обязателен.

Переменные окружения (Vercel → Project → Settings → Environment Variables) — см. `.env.example`.

## База данных

Миграции лежат в `supabase/migrations/`. Применяются по порядку через `npm run db:migrate`.
История этого проекта хранится в `public._migrations`; не смешивайте её с отдельной историей `supabase db push`.
Для применения задайте `SUPABASE_PROJECT_REF` и `SUPABASE_ACCESS_TOKEN` нужного проекта.
`npm run db:check` проверяет историю без изменения базы. Ключи приложение получает из настроек окружения.

## Этапы

1. **Регистрация** — Steam, FACEIT, команды, инвайты, заявки, check-in, админка. ✅
2. **Турнир** — сетка Double Elimination, посев, вето, страницы матчей, ручной ввод результата.
3. **Сервер** — F16 Server Agent, MatchZy, выдача IP, автоматический результат.
4. **Статистика** — F16Stats, live, MVP.
5. **Трансляция** — HUD, Broadcast Controller.

## Архитектура

- `src/app/` — маршруты (App Router). Публичная часть: `/`, `/tournaments`, `/matches`, `/teams`, `/players`, `/stats`, `/rules`, `/about`; личное: `/me`, `/team`, `/notifications`, `/join`; F16 Control — `/admin/**` (своя оболочка с левым меню).
- `src/app/actions/` — серверные действия (формы). Бизнес-правила — только здесь и в `src/lib/`.
- `src/app/api/agent/*` — связь с F16 Server Agent: `sync` (состояние ⇄ команды), `jobs` (игровые таймеры и обслуживание отдельно от выдачи команд), `bundle` (самообновление агента); `src/app/api/matchzy/*` и `src/app/api/cs2/*` — события MatchZy и HTTP-логи CS2; `src/app/api/auth/*` — вход через Steam.
- `src/lib/` — домен: турниры и форматы, сетки, вето, матчи, серверы и автопилот (`server-control.ts`), статистика и Swing, настройки, сессия, Steam.
- `src/components/` — отображение: `brand.tsx` (логотип — только файлы из `public/brand`), `ui.tsx` (примитивы), `public/` (главная и публичные страницы), `competition/` (матч, вето, сервер), `admin/` (F16 Control). Компоненты не обращаются к базе напрямую.
- `server/agent/` — агент серверного ПК (Node без зависимостей), доезжает до ПК сам через `/api/agent/bundle`.
- `supabase/migrations/` — схема базы по порядку.
- Ошибки: `app/error.tsx`, `app/global-error.tsx`, `app/admin/error.tsx`. SEO: `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, адрес сайта — `src/lib/site.ts` (`NEXT_PUBLIC_SITE_URL`).

**Порядок выкладки:** `npm run check` → `npm test` → `npm run build` → `npm run db:migrate` → `npm run db:check` → push в `main`.
Сборка никогда не применяет миграции. Production-сборка Vercel только читает `_migrations`
и останавливается, если нужная миграция отсутствует. Preview и локальная сборка эту проверку пропускают.
Каждая миграция применяется вместе с записью истории в одной транзакции, повторный запуск безопасен.
Контрольные суммы защищают новые миграции от редактирования после применения; старые записи без суммы сохраняются.

`npm test` работает без рабочей базы и секретов: сетки, форматы, лобби, буфер агента,
заявки, счёт, доставка команд и миграции проверяются на временных данных.
SQL выполняется в PostgreSQL через PGlite. Эти проверки не моделируют несколько независимых подключений
и не заменяют проверку запуска реального CS2.

Эксплуатация, восстановление и ограничения: [docs/operations.md](docs/operations.md).

## Устройство

- `src/lib/steam.ts` — Steam OpenID 2.0 (проверка `check_authentication`) и профиль.
- `src/lib/session.ts` — своя сессия: подписанный JWT в httpOnly cookie.
- `src/lib/supabase.ts` — серверный клиент с service role. Все записи идут только через сервер,
  RLS включён на всех таблицах, публично читаются только публичные данные.
- `src/app/actions/*` — серверные действия (команды, заявки, админка). Каждое ручное действие пишется в `audit_logs`.
- Администраторы: `ADMIN_STEAM_IDS` в env или флаг `is_admin` (выдаётся в админке).
