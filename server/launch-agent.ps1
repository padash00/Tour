# Keep the scheduled task alive while Node runs without a console window.
$ErrorActionPreference = "Stop"
$f16 = Split-Path -Parent $MyInvocation.MyCommand.Path
try {
  $service = Join-Path $f16 "agent\service.mjs"
  if (-not (Test-Path -LiteralPath $service)) { throw "Agent service not found: $service" }
  $node = (Get-Command node.exe -ErrorAction Stop).Source

  $start = [System.Diagnostics.ProcessStartInfo]::new()
  $start.FileName = $node
  $start.Arguments = '"' + $service + '" --no-servers'
  $start.WorkingDirectory = $f16
  $start.UseShellExecute = $false
  $start.CreateNoWindow = $true

  $process = [System.Diagnostics.Process]::Start($start)
  if (-not $process) { throw "Failed to start agent service" }
  $process.WaitForExit()
  exit $process.ExitCode
} catch {
  try { Add-Content -LiteralPath (Join-Path $f16 "agent.log") -Value "$(Get-Date -Format o) [launcher] $($_.Exception.Message)" -Encoding UTF8 } catch {}
  exit 1
}
