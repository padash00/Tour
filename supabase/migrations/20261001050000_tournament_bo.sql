-- Формат матчей турнира выбирается в админке, сетка использует его при генерации.
alter table tournaments add column default_best_of int not null default 1 check (default_best_of in (1, 3, 5));
alter table tournaments add column final_best_of   int not null default 3 check (final_best_of in (1, 3, 5));
