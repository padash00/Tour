-- Контакт для связи с игроком: Telegram (ник) и/или отметка «на телефон из анкеты можно писать в WhatsApp».
-- Нужен хотя бы один — проверяет сайт при сохранении анкеты. Только добавление.
alter table public.player_profiles add column if not exists telegram text;
alter table public.player_profiles add column if not exists whatsapp boolean not null default false;
