# Require -NoProfile pour ne pas charger les profiles (évite $env:USERPROFILE override)
param(
  [Parameter(Mandatory = $false, ValueFromRemainingArguments = $true)]
  [string[]]$Args
)

$ErrorActionPreference = 'Stop'

$PROJECT_ROOT = Split-Path -Parent $MyInvocation.MyCommand.Path
$SANDBOX_HOME = Join-Path $PROJECT_ROOT '.sandbox-home'
$SB_SUPABASE_DIR = Join-Path $SANDBOX_HOME '.supabase'
$SB_SUPABASE_TRACES = Join-Path $SB_SUPABASE_DIR 'traces'
$SB_TEMP = Join-Path $SANDBOX_HOME 'temp'

foreach ($d in @($SANDBOX_HOME, $SB_SUPABASE_DIR, $SB_SUPABASE_TRACES, $SB_TEMP)) {
  if (-not (Test-Path -LiteralPath $d)) {
    New-Item -ItemType Directory -Force -Path $d | Out-Null
  }
}

$telemDest = Join-Path $SB_SUPABASE_DIR 'telemetry.json'
if (-not (Test-Path -LiteralPath $telemDest)) {
  $origTelem = Join-Path $env:USERPROFILE '.supabase\telemetry.json'
  if (Test-Path -LiteralPath $origTelem) {
    Copy-Item -LiteralPath $origTelem -Destination $telemDest -Force
  } else {
    @'
{"enabled":false,"device_id":"sandbox-fix","session_id":"sandbox-fix","session_last_active":"2026-01-01T00:00:00Z","schema_version":1}
'@ | Set-Content -LiteralPath $telemDest -Encoding utf8
  }
}

$env:USERPROFILE = $SANDBOX_HOME
$env:HOME = $SANDBOX_HOME
$env:LocalAppData = $SANDBOX_HOME
$env:AppData = $SANDBOX_HOME
$env:TEMP = $SB_TEMP
$env:TMP = $SB_TEMP
$env:SUPABASE_DISABLE_TELEMETRY = 'true'
$env:SUPABASE_INTERNAL_DISABLE_TELEMETRY = 'true'
$env:DO_NOT_TRACK = '1'
$env:CI = 'true'

Set-Location -LiteralPath $PROJECT_ROOT

if ($Args.Count -eq 0) {
  & supabase --help
} else {
  & supabase @Args
}

exit $LASTEXITCODE
