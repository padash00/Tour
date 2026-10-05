# F16 Server Agent watchdog. Runs briefly every minute in the same user session.
$ErrorActionPreference = "Stop"
$taskName = "F16 Server Agent"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction Stop
if ($task.State -ne "Ready") { exit 0 }

Start-ScheduledTask -TaskName $taskName -ErrorAction Stop
