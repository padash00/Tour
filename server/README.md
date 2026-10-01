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

## F16 Server Agent

`server/agent/agent.mjs` (Node.js, без зависимостей) — копируется `install.ps1` в `D:\cs2server\f16\agent`.
Раз в 5 секунд отправляет на сайт состояние инстансов (A2S + `get5_status`) и получает команды:
start / stop / restart / load_match / end_match / rcon. Сайт к серверу не подключается — только исходящие HTTPS.

- Конфиг: `D:\cs2server\f16\agent.json` — `siteUrl`, `token` (= `AGENT_TOKEN` в Vercel), `lanIp`. В git не хранится.
- Ручной запуск: `D:\cs2server\F16-agent.bat` (перезапускается сам при падении).
- Автозапуск при входе в Windows: `shell:startup\F16-Arena.bat` → `D:\cs2server\F16-autostart.bat` (CS2-01..03 + агент).

Поток матча: вето на сайте → админ «Отправить на сервер» → агент `matchzy_loadmatch_url` →
MatchZy забирает конфиг (составы по SteamID, карты) → агент ставит адрес событий → сайт видит
`get5_status` = warmup и выдаёт игрокам IP → события MatchZy (`round_end`, `map_result`, `series_end`)
обновляют счёт, статистику и сетку.

Проверки: `node scripts/e2e-server-test.mjs CS2-01` (загрузка матча на сервер),
`node scripts/e2e-events-test.mjs` (обработка событий).
