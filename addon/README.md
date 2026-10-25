# Аддон F16 Arena UI

Клиентский аддон CS2 с оконным меню скинов (мышь вместо W/S/E). Опубликован в
Мастерской: **id 3826313310**, аккаунт ALTX_F4. Игроки скачивают его сами при
входе на сервер — раздаёт MultiAddonManager (`mm_client_extra_addons`), его
ставит агент, когда в пульте выбрано «Меню скинов в игре → Окна F16 с мышью».

Основан на MenuManager 1.3 (RRimmer) и PMM_WeaponPaints 0.1.1, оформление — F16.
Логику окон ведёт серверный плагин PMM_WeaponPaints: он находит элементы по `id`
(`wp-live-N`, `wp-cat-*`, `wp-side-*` …) и ставит им классы (`wp-off`, `wp-ghost`,
`is-eq`, `side-p0/1`, `multi-page` …). **`id` не переименовывать и не удалять** —
менять можно разметку вокруг и стили.

## Что где

| Файл | Что |
|---|---|
| `f16_ui/panorama/layout/custom_game/wp.xml` | окно скинов |
| `f16_ui/panorama/styles/custom_game/wp.css` | его стили; в конце блок «F16 v2» — наши правки поверх исходных |
| `f16_ui/panorama/layout/custom_game/menu_ui.xml`, `styles/.../ui.css` | общее окно MenuManager |
| `f16_ui/panorama/images/custom_game/*.png` + `*_png.vtex` | картинки и их описания для компилятора |
| `f16_ui/sounds`, `f16_ui/soundevents` | звуки меню |
| `preview.jpg` | картинка страницы в Мастерской |
| `build.ps1` | сборка |

## Обновить аддон

1. Поправить файлы в `addon/f16_ui`.
2. Собрать: `powershell -ExecutionPolicy Bypass -File addon\build.ps1`
   (копирует в `content\csgo_addons\f16_ui` и компилирует; путь к CS2 — `-Cs2Dir`).
3. Steam → Инструменты → Counter-Strike 2 Workshop Tools → аддон `f16_ui` →
   Workshop Manager → F16 Arena UI → Re-Upload. Заполнить «Список изменений».
   Номер аддона не меняется, в пульте ничего трогать не нужно.
4. Проверить в игре на свободном сервере (не во время матча): перезапустить CS2,
   зайти, открыть меню скинов.

## Новая картинка

Компилятор не собирает `.png` сам по себе, а ссылка из CSS — «слабая» и сборку
тоже не запускает. Поэтому рядом с `имя.png` кладётся `имя_png.vtex` — копия
`f16_logo_png.vtex` с заменённым `m_fileName` (путь через прямые слэши).
`build.ps1` собирает все `*_png.vtex`. В разметке/стилях ссылка:
`s2r://panorama/images/custom_game/имя_png.vtex`.

## Первая публикация (если аддон придётся создать заново)

1. Steam → Библиотека → Инструменты → установить «Counter-Strike 2 Workshop Tools».
2. Workshop Tools → Create New Addon → имя `f16_ui` → закрыть.
3. `addon\build.ps1`.
4. Workshop Tools с `f16_ui` → Workshop Manager → New → «F16 Arena UI», видимость
   «Для всех», метка «Пользовательский», картинка `preview.jpg` → Отправить.
5. Номер из адреса страницы (`id=…`) вписать в пульт: Настройки → «Меню скинов в
   игре» → номер аддона.
