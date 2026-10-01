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

## Архитектура

- `src/app/` — маршруты (App Router). Публичная часть: `/`, `/tournaments`, `/matches`, `/teams`, `/players`, `/stats`, `/rules`, `/about`; личное: `/me`, `/team`, `/notifications`, `/join`; F16 Control — `/admin/**` (своя оболочка с левым меню).
- `src/app/actions/` — серверные действия (формы). Бизнес-правила — только здесь и в `src/lib/`.
- `src/app/api/agent/*` — связь с F16 Server Agent: `sync` (состояние ⇄ команды), `bundle` (самообновление агента); `src/app/api/matchzy/*` и `src/app/api/cs2/*` — события MatchZy и HTTP-логи CS2; `src/app/api/auth/*` — вход через Steam.
- `src/lib/` — домен: турниры и форматы, сетки, вето, матчи, серверы и автопилот (`server-control.ts`), статистика и Swing, настройки, сессия, Steam.
- `src/components/` — отображение: `brand.tsx` (логотип — только файлы из `public/brand`), `ui.tsx` (примитивы), `public/` (главная и публичные страницы), `competition/` (матч, вето, сервер), `admin/` (F16 Control). Компоненты не обращаются к базе напрямую.
- `server/agent/` — агент серверного ПК (Node без зависимостей), доезжает до ПК сам через `/api/agent/bundle`.
- `supabase/migrations/` — схема базы по порядку.
- Ошибки: `app/error.tsx`, `app/global-error.tsx`, `app/admin/error.tsx`. SEO: `robots.ts`, `sitemap.ts`, `opengraph-image.tsx`, адрес сайта — `src/lib/site.ts` (`NEXT_PUBLIC_SITE_URL`).

**Порядок выкладки:** `npm run check` (типы + линтер) → `next build` → push в `main`.
Новая миграция в Vercel сама **не применяется** — её нужно применить вручную
(`SUPABASE_ACCESS_TOKEN=… node scripts/apply-migrations.mjs`) **до** пуша кода, который её использует.

## Устройство

- `src/lib/steam.ts` — Steam OpenID 2.0 (проверка `check_authentication`) и профиль.
- `src/lib/session.ts` — своя сессия: подписанный JWT в httpOnly cookie.
- `src/lib/supabase.ts` — серверный клиент с service role. Все записи идут только через сервер,
  RLS включён на всех таблицах, публично читаются только публичные данные.
- `src/app/actions/*` — серверные действия (команды, заявки, админка). Каждое ручное действие пишется в `audit_logs`.
- Администраторы: `ADMIN_STEAM_IDS` в env или флаг `is_admin` (выдаётся в админке).
