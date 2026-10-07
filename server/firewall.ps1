# F16 Arena — RCON только с этого ПК.
# CS2 с -usercon слушает RCON по TCP на игровом порту. Пароль один на все инстансы, поэтому из клубной
# сети (LAN) RCON должен быть закрыт: правило запрещает входящие TCP на игровые порты со всех адресов,
# кроме 127.0.0.1 (агент работает на этом же ПК). UDP (сама игра и GOTV) не трогаем.
# Порты — из instances.csv рядом со скриптом. Правила группы «F16 Arena RCON» пересоздаются каждый раз.
#
#   powershell -ExecutionPolicy Bypass -File firewall.ps1        (от администратора; агент вызывает сам)

param([string]$Csv = (Join-Path $PSScriptRoot "instances.csv"))
$ErrorActionPreference = "Stop"
$group = "F16 Arena RCON"

$ports = @(Import-Csv $Csv | ForEach-Object { [int]$_.port } | Where-Object { $_ -gt 0 })
if (-not $ports.Count) { throw "В $Csv нет портов" }

Get-NetFirewallRule -Group $group -ErrorAction SilentlyContinue | Remove-NetFirewallRule
# все адреса, кроме петли (127.0.0.0/8 и ::1); запрещающее правило сильнее любых разрешающих
$remote = @("0.0.0.0-126.255.255.255", "128.0.0.0-255.255.255.255", "::2-ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff")
New-NetFirewallRule -DisplayName "F16 Arena: RCON (TCP) только с этого ПК" -Group $group `
  -Direction Inbound -Protocol TCP -LocalPort $ports -RemoteAddress $remote -Action Block -Profile Any | Out-Null
Write-Host "TCP $($ports -join ', ') закрыт для входящих из сети (UDP игры открыт)"
