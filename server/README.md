# CS2 сервер F16 Arena

Один физический ПК, CS2 Dedicated Server в `D:\cs2server`, 5 инстансов (см. `instances.csv`):
CS2-01..03 — активные, CS2-04..05 — резерв.

## 1. Обновить CS2

SteamCMD лежит в `D:\SteamCMD`. Установка привязана к Steam-аккаунту — анонимный вход
получает `Access Denied`, поэтому обновлять под своим логином (Steam Guard спросит код):

```
D:\SteamCMD\steamcmd.exe +force_install_dir D:\cs2server +login <логин> +app_update 730 validate +quit
```

## 2. Плагины

Распаковать в `D:\cs2-staging`:

| папка      | архив |
|------------|-------|
| `mms\`     | Metamod:Source 2.0 — https://mms.alliedmods.net/mmsdrop/2.0/ (`*-windows.zip`) |
| `css\`     | CounterStrikeSharp — `counterstrikesharp-with-runtime-windows-*.zip` с GitHub roflmuffin/CounterStrikeSharp |
| `matchzy\` | MatchZy — `MatchZy-*.zip` с GitHub shobhit-pathak/MatchZy |

## 3. Установка

```
powershell -ExecutionPolicy Bypass -File server\install.ps1
```

Ставит плагины, прописывает Metamod в `gameinfo.gi`, копирует конфиги F16 и генерирует
`D:\cs2server\f16-secrets.json` (RCON-пароль, опционально GSLT). **Запускать после каждого обновления CS2.**

## 4. Запуск

```
powershell -ExecutionPolicy Bypass -File server\start.ps1 -Active        # CS2-01..03
powershell -ExecutionPolicy Bypass -File server\start.ps1 -Name CS2-04
powershell -ExecutionPolicy Bypass -File server\start.ps1 -Name CS2-01 -Stop
```

Проверка в консоли сервера: `meta list` (Metamod), `css_plugins list` (MatchZy).

## Сеть

Порты UDP 27015/27115/27215/27315/27415 (+5 для SourceTV) — только внутри LAN.
Входящие из интернета закрыты, исходящие разрешены (Steam).
Если игровые ПК находятся в `192.168.100.*`, а сервер в `192.168.0.*`, задайте в F16 Control → Настройки →
Серверы и MatchZy адрес роутера со стороны игроков как «IP сервера для игроков» (без порта).
Эту настройку используют и турнирные матчи, и лобби. При отсутствии настройки админка показывает
предупреждение, если LAN-адрес сервера и адрес роутера различаются. Адрес и UDP-проброс нужно проверить
с одного из игровых ПК; сайт и серверный ПК не могут проверить путь из другой подсети вместо игрока.

## F16 Server Agent

`server/agent/agent.mjs` (Node.js, без зависимостей) — копируется `install.ps1` в `D:\cs2server\f16\agent`.
Раз в 5 секунд отправляет на сайт состояние инстансов (A2S + `get5_status`) и получает команды:
start / stop / restart / load_match / end_match / rcon. Сайт к серверу не подключается — только исходящие HTTPS.
Игровые таймеры агент запускает отдельным запросом примерно раз в 5 секунд, обслуживание — раз в минуту.
Долгая проверка Steam/FACEIT или Workshop не задерживает ответ с командами. При обновлении старый агент
продолжает запускать задачи через `sync`, пока не скачает новую версию.

- Конфиг: `D:\cs2server\f16\agent.json` — `siteUrl`, `token` (= `AGENT_TOKEN` в Vercel), `lanIp`. В git не хранится.
- Фоновый агент: `D:\cs2server\f16\service.ps1` из сеанса владельца ПК в PowerShell администратора — задача Планировщика
  «F16 Server Agent»: при входе этого пользователя, без окна, без лимита времени, перезапуск при сбое.
  Запуск через `launch-agent.ps1` скрывает окно Node.js. Для уже установленной задачи команда
  `service.ps1 -UpdateActionOnly` меняет способ запуска без остановки работающего агента.
  CS2 Dedicated Server падает при запуске агентом от `SYSTEM`, поэтому этот режим не используется.
  Отдельная задача «F16 Server Agent Watchdog» под тем же пользователем проверяет агент раз в минуту и возвращает его после ручного закрытия Node.js.
  `agent\service.mjs --no-servers` держит агента живым, не меняя состояние CS2 при перезапуске агента.
  Лог: `D:\cs2server\f16\agent.log`. Вернуть запуск в окне при входе: `service.ps1 -Remove`.
- Ручной запуск в окне: `D:\cs2server\F16-agent.bat` (перезапускается сам при падении).
- Самообновление: сайт отдаёт `server/agent`, `start.ps1`, `service.ps1`, `launch-agent.ps1`, `watchdog.ps1`, `install.ps1`, `instances.csv`, `cfg/**` по версии (хэш).
  После деплоя агент сам скачивает новую версию и перезапускается. Ручное копирование не нужно.
- Обслуживание из админки «Серверы»: обновить CS2 (SteamCMD под кешированным логином), обновить плагины
  (последние Metamod / CounterStrikeSharp / MatchZy), перезапустить все — только когда нет активных матчей.

Поток матча: вето на сайте → админ «Отправить на сервер» → агент `matchzy_loadmatch_url` →
MatchZy забирает конфиг (составы по SteamID, карты) → агент ставит адрес событий → сайт видит
`get5_status` = warmup и выдаёт игрокам IP → события MatchZy (`round_end`, `map_result`, `series_end`)
обновляют счёт, статистику и сетку.

На de-картах турнира агент при событии `going_live` включает штатный `sv_auto_full_alltalk_during_warmup_half_end`:
соперники слышат друг друга во время смены сторон, в раундах действует командный голос. На `map_result`
и `series_end` параметр возвращается к 0; в разминке и на aim-картах он остаётся выключенным.
Для обычных карт 5×5 профиль задаёт MR12, овертайм MR3, $800 на старте, $12 500 в овертайме,
раунд 1:55, закупку 20 с, фризтайм 20 с и таймер бомбы 40 с. Голос в перерыве — правило F16,
добавленное отдельно от официальных регламентов ESL/PGL.
Ориентиры: [FACEIT Season 9](https://www.faceit.com/cs/news/faceit-season-9-launch),
[настройки матчей ESL](https://pro.eslgaming.com/tour/2023/10/esl-pro-tour-fall-2023-rule-book-update/),
[дополнительный регламент Valve для мейджоров](https://github.com/ValveSoftware/counter-strike_rules_and_regs/blob/main/major-supplemental-rulebook.md).

Проверки: `node scripts/e2e-server-test.mjs CS2-01` (загрузка матча на сервер),
`node scripts/e2e-events-test.mjs` (обработка событий).
