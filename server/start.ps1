# F16 Arena — запуск инстансов CS2.
#   start.ps1 -Name CS2-01        один инстанс
#   start.ps1 -Active             все активные (CS2-01..03)
#   start.ps1 -Name CS2-01 -Stop  остановить
param(
  [string]$Name,
  [switch]$Active,
  [switch]$Stop,
  [string]$ServerDir = "D:\cs2server",
  [string]$Map = "de_mirage",
  [switch]$NoAffinity
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$instances = Import-Csv (Join-Path $repo "instances.csv")
$targets = if ($Active) { $instances | Where-Object role -eq "active" } else { $instances | Where-Object name -eq $Name }
if (-not $targets) { throw "Укажите -Name (CS2-01..CS2-07) или -Active" }

$exe = Join-Path $ServerDir "game\bin\win64\cs2.exe"
$secrets = Get-Content (Join-Path $ServerDir "f16-secrets.json") -Raw | ConvertFrom-Json

foreach ($i in $targets) {
  $port = [int]$i.port
  $running = Get-CimInstance Win32_Process -Filter "Name='cs2.exe'" | Where-Object { $_.CommandLine -match "-port $port\b" }
  if ($Stop) {
    $running | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
    Write-Host "STOP $($i.name)"
    continue
  }
  if ($running) { Write-Host "SKIP $($i.name) уже запущен (pid $($running.ProcessId))"; continue }

  $argList = @(
    "-dedicated", "-console", "-usercon",
    # без этого ключа CS2 не пишет файлы раундов (mp_backup_round_auto): не работают откат раунда (.stop),
    # переигровка при вылете и восстановление матча после падения сервера
    "-allow_round_backup_files",
    "-ip", "0.0.0.0",
    "-port", $port,
    "+tv_port", ($port + 5),
    "-maxplayers", "20",
    "+game_type", "0", "+game_mode", "1",
    "+map", $Map,
    "+exec", "f16/$($i.name.ToLower()).cfg"
  )
  if ($secrets.gslt) { $argList += @("+sv_setsteamaccount", $secrets.gslt) }
  # Через WMI, а не Start-Process: процесс создаёт сама Windows, он не входит в задание (job) агента
  # и не умирает, когда агент перезапускается или обновляется.
  $cmd = "`"$exe`" " + ($argList -join " ")
  $r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $cmd; CurrentDirectory = (Split-Path $exe) }
  if ($r.ReturnValue -ne 0) { throw "Не удалось запустить $($i.name): код $($r.ReturnValue)" }
  # WMI подтверждает создание процесса, но CS2 может упасть при загрузке tier0.dll.
  # Пауза между инстансами убирает одновременную загрузку движка.
  Start-Sleep -Seconds 6
  if (-not (Get-Process -Id $r.ProcessId -ErrorAction SilentlyContinue)) {
    throw "$($i.name) завершился сразу после запуска. Проверьте события Application Error для cs2.exe"
  }
  # высокий приоритет: другие программы на этом ПК не отнимают у сервера время (меньше фризов у игроков)
  try { (Get-Process -Id $r.ProcessId).PriorityClass = "High" } catch { Write-Host "приоритет $($i.name) не изменён: $_" }
  # Все физические ядра, кроме нулевого (оно остаётся Windows, агенту и остальным программам), — общие для всех
  # инстансов. Одно ядро на сервер не тянет: на миксе 25.11.2026 сервер с 10 игроками упирался в 140–205 % из 200,
  # а на общих ядрах 1–7 пик был около 300 % на сервер при загрузке всего процессора ~40 %. -NoAffinity выключает.
  $affinity = ""
  $logical = [Environment]::ProcessorCount
  if (-not $NoAffinity -and $logical -ge 8 -and $logical -le 62) {
    try {
      (Get-Process -Id $r.ProcessId).ProcessorAffinity = [IntPtr]((([int64]1 -shl $logical) - 1) -band (-bnot [int64]3))
      $affinity = " ядра 1-$([int]($logical / 2) - 1)"
    } catch { Write-Host "ядра $($i.name) не закреплены: $_" }
  }
  Write-Host "START $($i.name) :$port pid $($r.ProcessId)$affinity"
}
