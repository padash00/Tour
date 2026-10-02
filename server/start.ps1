# F16 Arena — запуск инстансов CS2.
#   start.ps1 -Name CS2-01        один инстанс
#   start.ps1 -Active             все активные (CS2-01..03)
#   start.ps1 -Name CS2-01 -Stop  остановить
param(
  [string]$Name,
  [switch]$Active,
  [switch]$Stop,
  [string]$ServerDir = "D:\cs2server",
  [string]$Map = "de_mirage"
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $MyInvocation.MyCommand.Path
$instances = Import-Csv (Join-Path $repo "instances.csv")
$targets = if ($Active) { $instances | Where-Object role -eq "active" } else { $instances | Where-Object name -eq $Name }
if (-not $targets) { throw "Укажите -Name (CS2-01..CS2-05) или -Active" }

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
    "-dedicated", "-console", "-usercon", "-condebug",
    "-ip", "0.0.0.0",
    "-port", $port,
    "+tv_port", ($port + 5),
    "-maxplayers", "12",
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
  Write-Host "START $($i.name) :$port pid $($r.ProcessId)"
}
