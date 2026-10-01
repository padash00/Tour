-- Автопилот турнира: сайт сам запускает вето и отправляет готовые матчи на свободные серверы.
alter table tournaments add column autopilot boolean not null default false;
