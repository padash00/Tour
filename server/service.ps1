# F16 Arena — Server Agent в пользовательском сеансе Windows (без окна).
#
#   powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1            установить и запустить
#   powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1 -Remove    вернуть запуск в окне при входе
#
# Задача Планировщика «F16 Server Agent»: при входе пользователя, без окна,
# без ограничения по времени, перезапуск при сбое. CS2 падает в сеансе SYSTEM,
# поэтому задача запускается с интерактивным токеном владельца ПК.
# Запускает agent\service.mjs — тот поднимает CS2-01..03
# и держит агента живым. Лог: D:\cs2server\f16\agent.log. Запускать от администратора.

param(
  [string]$ServerDir = "D:\cs2server",
  [switch]$Remove
)
$ErrorActionPreference = "Stop"
$TaskName = "F16 Server Agent"
$WatchTaskName = "F16 Server Agent Watchdog"
$f16 = Join-Path $ServerDir "f16"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Запустите PowerShell от имени администратора" }
$user = [Security.Principal.WindowsIdentity]::GetCurrent().Name
if ($user -match '\\SYSTEM$') { throw "Установите задачу из сеанса пользователя, под которым должен работать CS2" }
if (-not $Remove) {
  $node = (Get-Command node -ErrorAction Stop).Source
  $service = Join-Path $f16 "agent\service.mjs"
  if (-not (Test-Path $service)) { throw "Нет $service — агент ещё не обновился с сайта" }
  $watchdogSource = Join-Path $PSScriptRoot "watchdog.ps1"
  if (-not (Test-Path $watchdogSource)) { throw "Нет $watchdogSource" }
  $watchdogPath = Join-Path $f16 "watchdog.ps1"
  if ([IO.Path]::GetFullPath($watchdogSource) -ne [IO.Path]::GetFullPath($watchdogPath)) {
    Copy-Item -LiteralPath $watchdogSource -Destination $watchdogPath -Force
  }
}

function Stop-OldAgent {
  # агент в окне (F16-agent.bat) и любой node agent.mjs / service.mjs — иначе будет два агента
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'F16-agent\.bat|f16\\agent\\(agent|service)\.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

Stop-ScheduledTask -TaskName $WatchTaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $WatchTaskName -Confirm:$false -ErrorAction SilentlyContinue
Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Stop-OldAgent
Start-Sleep -Seconds 2

if ($Remove) {
  # как было: при входе пользователя, окно с агентом
  $action = New-ScheduledTaskAction -Execute (Join-Path $ServerDir "F16-autostart.bat")
  $trigger = New-ScheduledTaskTrigger -AtLogOn
  $settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -RunLevel Highest | Out-Null
  Start-ScheduledTask -TaskName $TaskName
  Write-Host "OK  агент снова запускается в окне при входе"
  return
}

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$service`" --no-servers" -WorkingDirectory $f16
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "F16 Arena: Server Agent в пользовательском сеансе (сайт управляет серверами CS2). Лог: $f16\agent.log" | Out-Null
Start-ScheduledTask -TaskName $TaskName

$running = $null
for ($attempt = 0; $attempt -lt 25; $attempt++) {
  Start-Sleep -Seconds 2
  $running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'f16\\agent\\agent\.mjs' }
  if ($running) { break }
}
if (-not $running) { throw "Агент не запустился — смотрите $f16\agent.log" }

# Завершение процесса вручную не считается сбоем для RestartCount в Планировщике.
# Отдельная короткая задача этого же пользователя проверяет агент каждую минуту.
# Повторение без Duration продолжается бессрочно; отключённую задачу сторож не включает.
$watchAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$watchdogPath`"" -WorkingDirectory $f16
$watchTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 1)
$watchSettings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -StartWhenAvailable -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $WatchTaskName -Action $watchAction -Trigger $watchTrigger -Principal $principal -Settings $watchSettings `
  -Description "F16 Arena: проверяет агент раз в минуту и запускает его после остановки" | Out-Null

# Старая задача прежнего агента не должна запускать вторую копию после следующего входа.
$legacy = Get-ScheduledTask -TaskName "F16ArenaAgent" -ErrorAction SilentlyContinue
if ($legacy -and ($legacy.Actions | Where-Object { $_.Execute -match 'cs2lan\\agent\\start-agent\.bat$' })) {
  try { Disable-ScheduledTask -TaskName "F16ArenaAgent" | Out-Null }
  catch { Write-Warning "Не удалось отключить старую задачу F16ArenaAgent: $_" }
}
Write-Host "OK  агент работает в фоне от $user (PID $($running.ProcessId -join ', ')); сторож проверяет его каждую минуту. Лог: $f16\agent.log"
