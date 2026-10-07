# F16 Arena — задачи Планировщика агента без мигающего окна.
# powershell.exe -WindowStyle Hidden всё равно на мгновение показывает консоль (сторож запускается раз в минуту).
# conhost.exe --headless создаёт консоль без окна. Агент вызывает скрипт сам; повторный запуск ничего не меняет.
$ErrorActionPreference = "Stop"
# агент читает вывод как UTF-8 (иначе в agent.log кириллица превращается в кракозябры)
[Console]::OutputEncoding = [Text.Encoding]::UTF8
$f16 = Split-Path -Parent $MyInvocation.MyCommand.Path
$changed = @()
foreach ($pair in @(@("F16 Server Agent", "launch-agent.ps1"), @("F16 Server Agent Watchdog", "watchdog.ps1"))) {
  $task = Get-ScheduledTask -TaskName $pair[0] -ErrorAction SilentlyContinue
  if (-not $task) { continue }
  if ($task.Actions[0].Execute -match 'conhost') { continue }
  $script = Join-Path $f16 $pair[1]
  $action = New-ScheduledTaskAction -Execute "conhost.exe" `
    -Argument "--headless powershell.exe -NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" `
    -WorkingDirectory $f16
  # меняется только действие: работающий агент не перезапускается
  Set-ScheduledTask -TaskName $pair[0] -Action $action | Out-Null
  $changed += $pair[0]
}
if ($changed.Count) { "без окна: " + ($changed -join ", ") } else { "задачи уже без окна" }
