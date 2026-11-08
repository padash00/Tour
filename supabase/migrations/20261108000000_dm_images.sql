-- Картинки в личных сообщениях: файл в закрытом хранилище dm-images, путь — в сообщении.
-- Отдаёт картинку только сервер сайта (/api/dm/image/<id>) — участникам переписки и админам.
-- Подпись к картинке необязательна: пустой текст разрешён, если есть картинка.

alter table public.direct_messages add column if not exists image_path text;

alter table public.direct_messages drop constraint if exists direct_messages_body_check;
alter table public.direct_messages add constraint direct_messages_body_check
  check (char_length(body) <= 1000 and (char_length(body) >= 1 or image_path is not null));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('dm-images', 'dm-images', false, 3145728, array['image/png','image/jpeg','image/webp'])
on conflict (id) do nothing;
