<#
  Сборка аддона F16 Arena UI (Workshop id 3826313310).

  Копирует addon\f16_ui в content\csgo_addons\f16_ui установленной CS2 и
  компилирует его resourcecompiler'ом. После сборки — Workshop Tools →
  Workshop Manager → Re-Upload (см. addon\README.md).

  Запуск:  powershell -ExecutionPolicy Bypass -File addon\build.ps1
           powershell -File addon\build.ps1 -Cs2Dir "E:\Steam\...\Counter-Strike Global Offensive"
#>
param(
  [string]$Cs2Dir = "D:\SteamLibrary\steamapps\common\Counter-Strike Global Offensive"
)

$ErrorActionPreference = "Stop"

$src = Join-Path $PSScriptRoot "f16_ui"
$content = Join-Path $Cs2Dir "content\csgo_addons\f16_ui"
$compiler = Join-Path $Cs2Dir "game\bin\win64\resourcecompiler.exe"

if (-not (Test-Path $compiler)) {
  throw "Не найден resourcecompiler: $compiler. Установите Counter-Strike 2 Workshop Tools или укажите -Cs2Dir."
}

# Копируем без удаления: в content могут лежать файлы, которые создали сами Workshop Tools.
New-Item -ItemType Directory -Force $content | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $content -Recurse -Force
Write-Host "Исходники скопированы в $content"

function Invoke-Compile([string]$target) {
  $out = & $compiler -r -i $target 2>&1
  $summary = $out | Select-String -Pattern "^\s*(OK|ERROR):" | Select-Object -Last 1
  $failed = $out | Select-String -Pattern "\[FAIL\]|Internal Error"
  if (-not $summary -or $summary.Line -match "ERROR:" -or $failed) {
    $out | Select-Object -Last 20 | ForEach-Object { Write-Host $_ }
    throw "Сборка не удалась: $target"
  }
  Write-Host "  $($summary.Line.Trim())  ← $(Split-Path $target -Leaf)"
}

# Разметка, стили и звуки. Картинки .png напрямую компилятор не берёт
# («Failed to find compiler» по ним — норма), их собирает следующий шаг.
Invoke-Compile (Join-Path $content "*")

# Картинки: у каждой <имя>.png рядом лежит описание <имя>_png.vtex (DMX).
# В CSS/XML на неё ссылаются как s2r://panorama/images/custom_game/<имя>_png.vtex.
Get-ChildItem (Join-Path $content "panorama\images") -Recurse -Filter "*_png.vtex" | ForEach-Object {
  Invoke-Compile $_.FullName
}

Write-Host ""
Write-Host "Готово. Дальше: Workshop Tools → Workshop Manager → F16 Arena UI → Re-Upload."
