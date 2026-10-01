# F16 Arena — установка Metamod, CounterStrikeSharp, MatchZy и конфигов F16 в CS2 Dedicated Server.
# Запускать после каждого обновления CS2 через SteamCMD (обновление перезаписывает gameinfo.gi).
#
#   powershell -ExecutionPolicy Bypass -File server\install.ps1 [-ServerDir D:\cs2server] [-Staging D:\cs2-staging]
#
# В -Staging должны лежать распакованные архивы: mms\, css\, matchzy\ (см. server\README.md).

param(
  [string]$ServerDir = "D:\cs2server",
  [string]$Staging = "D:\cs2-staging"
)
$ErrorActionPreference = "Stop"

$csgo = Join-Path $ServerDir "game\csgo"
if (-not (Test-Path (Join-Path $csgo "gameinfo.gi"))) { throw "Не найден $csgo\gameinfo.gi" }
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path

# 1. Плагины: Metamod → CounterStrikeSharp → MatchZy
foreach ($pkg in "mms", "css", "matchzy") {
  $src = Join-Path $Staging $pkg
  if (-not (Test-Path $src)) { throw "Нет распакованного пакета $src" }
  # конфиги MatchZy не перетираем — их ставим из репозитория ниже
  Copy-Item -Path (Join-Path $src "*") -Destination $csgo -Recurse -Force
  Write-Host "OK  $pkg"
}

# 2. gameinfo.gi: Metamod должен грузиться первым
$gi = Join-Path $csgo "gameinfo.gi"
$text = [IO.File]::ReadAllText($gi)
if ($text -notmatch "csgo/addons/metamod") {
  $text = [regex]::Replace($text, "(\r?\n)(\s*)Game_LowViolence", "`$1`$2Game`tcsgo/addons/metamod`$1`$2Game_LowViolence", 1)
  [IO.File]::WriteAllText($gi, $text)
  Write-Host "OK  gameinfo.gi: добавлен Metamod"
} else {
  Write-Host "OK  gameinfo.gi уже содержит Metamod"
}

# 3. Конфиги F16
Copy-Item -Path (Join-Path $repo "cfg\*") -Destination (Join-Path $csgo "cfg") -Recurse -Force
Write-Host "OK  конфиги F16"

# 4. Секреты инстансов (RCON) — генерируются один раз, в git не попадают
$secretsPath = Join-Path $ServerDir "f16-secrets.json"
if (Test-Path $secretsPath) {
  $secrets = Get-Content $secretsPath -Raw | ConvertFrom-Json
} else {
  $chars = (48..57) + (65..90) + (97..122) | ForEach-Object { [char]$_ }
  $gen = { -join (1..24 | ForEach-Object { $chars | Get-Random }) }
  $secrets = [pscustomobject]@{ rcon = & $gen; gslt = "" }
  $secrets | ConvertTo-Json | Set-Content -Encoding utf8 $secretsPath
  Write-Host "OK  создан $secretsPath (RCON-пароль)"
}

$instances = Import-Csv (Join-Path $repo "instances.csv")
foreach ($i in $instances) {
  $cfg = @"
// сгенерировано server\install.ps1 — не редактировать вручную
exec f16/instance.cfg
hostname "F16 Arena | $($i.name)"
rcon_password "$($secrets.rcon)"
"@
  Set-Content -Encoding ascii -Path (Join-Path $csgo "cfg\f16\$($i.name.ToLower()).cfg") -Value $cfg
}
Write-Host "OK  конфиги инстансов: $($instances.name -join ', ')"

# 5. Скрипт запуска в путь без кириллицы — для F16-start-servers.bat / F16-stop-servers.bat
$f16 = Join-Path $ServerDir "f16"
New-Item -ItemType Directory -Force $f16 | Out-Null
Copy-Item (Join-Path $repo "start.ps1"), (Join-Path $repo "instances.csv") $f16 -Force
# F16 Server Agent
New-Item -ItemType Directory -Force (Join-Path $f16 "agent") | Out-Null
Copy-Item (Join-Path $repo "agent\*.mjs") (Join-Path $f16 "agent") -Force
if (-not (Test-Path (Join-Path $f16 "agent.json"))) {
  Write-Host "!!  Нет $f16gent.json — создайте: { siteUrl, token (AGENT_TOKEN), lanIp }"
}
Write-Host "OK  $f16\start.ps1"
Write-Host ""
Write-Host "Готово. Запуск: powershell -ExecutionPolicy Bypass -File server\start.ps1 -Name CS2-01"
