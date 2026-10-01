-- Когда матч назначен на сервер (для проверки, что нужная карта загрузилась, и таймера неявки)
alter table matches add column server_assigned_at timestamptz;
-- Когда игрокам выдан адрес (отсчёт 15 минут на подключение)
alter table matches add column server_ready_at timestamptz;
