-- Ещё два инстанса CS2 на серверном ПК: до 7 матчей 5×5 одновременно (71 игровое место в клубе).
-- Агент читает список из server/instances.csv; сайт обновляет только существующие строки — добавляем их здесь.
insert into server_instances (name, port, role) values
  ('CS2-06', 27515, 'reserve'),
  ('CS2-07', 27615, 'reserve')
on conflict (name) do nothing;
