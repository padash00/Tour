-- Стороны «по пикам», как на крупных турнирах: на карте, которую пикнула команда, сторону выбирает соперник;
-- решающая карта — ножевой раунд.
--
-- tournaments.side_choice — режим включён для турнира (иначе стороны решает knife_round, как раньше).
-- veto_actions.side — сторона, которую соперник выбрал на пикнутой карте ('ct' или 't'); у банов и decider пусто.
-- Пока у последнего пика side пуст, бан-пик ждёт выбора стороны.
alter table public.tournaments add column side_choice boolean not null default false;
alter table public.veto_actions add column side text check (side in ('ct', 't'));
