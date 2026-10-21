# F16 Arena — Windows не должна притормаживать серверы CS2.
# Серверы запускаются без окна, и Windows 11 считает такие процессы фоновыми: снижает им частоту процессора
# (power throttling) и точность системного таймера — время кадра сервера становится неровным.
#   1. power throttling для cs2.exe выключен;
#   2. GlobalTimerResolutionRequests = 1 — запрос точного таймера действует и для скрытых процессов
#      (вступает в силу после перезагрузки Windows).
# Функции серверов не меняются. Агент запускает скрипт сам (от администратора), повторно — только при его изменении.
#
#   powershell -ExecutionPolicy Bypass -File tune.ps1 [-Cs2 D:\cs2server\game\bin\win64\cs2.exe]

param([string]$Cs2 = (Join-Path (Split-Path $PSScriptRoot -Parent) "game\bin\win64\cs2.exe"))
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

if (-not (Test-Path $Cs2)) { throw "нет $Cs2" }
& powercfg /powerthrottling disable /path "$Cs2" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "powercfg /powerthrottling: код $LASTEXITCODE" }

$kernel = "HKLM:\SYSTEM\CurrentControlSet\Control\Session Manager\kernel"
$before = (Get-ItemProperty $kernel -ErrorAction SilentlyContinue).GlobalTimerResolutionRequests
Set-ItemProperty -Path $kernel -Name GlobalTimerResolutionRequests -Value 1 -Type DWord
$reboot = if ($before -ne 1) { ", таймер — после перезагрузки Windows" } else { "" }
Write-Host "cs2.exe без фонового замедления, точный таймер включён$reboot"
