# F16 Arena — Server Agent как фоновая служба Windows (без окна).
#
#   powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1            установить и запустить
#   powershell -ExecutionPolicy Bypass -File D:\cs2server\f16\service.ps1 -Remove    вернуть запуск в окне при входе
#
# Задача Планировщика «F16 Server Agent»: при включении ПК (вход в Windows не нужен), от SYSTEM, без окна,
# без ограничения по времени, перезапуск при сбое. Запускает agent\service.mjs — тот поднимает CS2-01..03
# и держит агента живым. Лог: D:\cs2server\f16\agent.log. Запускать от администратора.

param(
  [string]$ServerDir = "D:\cs2server",
  [switch]$Remove
)
$ErrorActionPreference = "Stop"
$TaskName = "F16 Server Agent"
$f16 = Join-Path $ServerDir "f16"

$admin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $admin) { throw "Запустите PowerShell от имени администратора" }

function Stop-OldAgent {
  # агент в окне (F16-agent.bat) и любой node agent.mjs / service.mjs — иначе будет два агента
  Get-CimInstance Win32_Process -Filter "Name='cmd.exe' OR Name='node.exe'" |
    Where-Object { $_.CommandLine -match 'F16-agent\.bat|f16\\agent\\(agent|service)\.mjs' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

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

$node = (Get-Command node -ErrorAction Stop).Source
$service = Join-Path $f16 "agent\service.mjs"
if (-not (Test-Path $service)) { throw "Нет $service — агент ещё не обновился с сайта" }

$action = New-ScheduledTaskAction -Execute $node -Argument "`"$service`"" -WorkingDirectory $f16
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable `
  -MultipleInstances IgnoreNew
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings `
  -Description "F16 Arena: Server Agent в фоне (сайт управляет серверами CS2). Лог: $f16\agent.log" | Out-Null
Start-ScheduledTask -TaskName $TaskName

Start-Sleep -Seconds 8
$running = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'f16\\agent\\agent\.mjs' }
if ($running) { Write-Host "OK  агент работает в фоне (PID $($running.ProcessId -join ', ')), окна нет. Лог: $f16\agent.log" }
else { Write-Host "!!  агент не запустился — смотрите $f16\agent.log" }
