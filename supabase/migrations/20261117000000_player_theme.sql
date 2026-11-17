-- Тема сайта (светлая/тёмная) в профиле игрока: выбор открывается и на другом устройстве после входа
alter table public.players add column if not exists theme text check (theme in ('light', 'dark'));
