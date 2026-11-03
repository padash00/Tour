-- Язык сайта, выбранный игроком (переключатель ҚАЗ/РУС): держится на всех его устройствах.
-- null — не выбирал, сайт открывается по-казахски. Пригодится и для уведомлений на языке игрока. Только добавление.
alter table public.players add column if not exists lang text;
alter table public.players drop constraint if exists players_lang_known;
alter table public.players add constraint players_lang_known check (lang is null or lang in ('ru', 'kk'));
