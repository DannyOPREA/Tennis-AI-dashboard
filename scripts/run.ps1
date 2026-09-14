<#
.SYNOPSIS
    Starts the Tennis AI Playground and opens it in your browser.

.DESCRIPTION
    Runs "uv run playground" from the project folder, writes everything the
    server prints to data\logs\playground-<date>-<time>.log (and to this
    window), waits for http://127.0.0.1:8000/api/health to answer, then opens
    http://127.0.0.1:8000 in the default browser. Press Ctrl+C in this window
    to stop the server. Configuration is read by the app itself from .env.

.USAGE
        double-click scripts\run.cmd
    or  powershell -ExecutionPolicy Bypass -File scripts\run.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Url         = 'http://127.0.0.1:8000'
$HealthUrl   = "$Url/api/health"
$LogDir      = Join-Path $ProjectRoot 'data\logs'
$LogFile     = Join-Path $LogDir ("playground-{0}.log" -f (Get-Date -Format 'yyyyMMdd-HHmmss'))

function Write-Ok([string]$Text)   { Write-Host "  [OK]   $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "  [WARN] $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "  [FAIL] $Text" -ForegroundColor Red }

function Test-Health([int]$TimeoutSec = 2) {
    try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec $TimeoutSec
        return ($r.StatusCode -eq 200)
    } catch { return $false }
}

Write-Host ''
Write-Host '  Tennis AI Playground' -ForegroundColor Cyan
Write-Host "  Project : $ProjectRoot"
Write-Host "  Log     : $LogFile"
Write-Host ''

# --- Pre-flight -------------------------------------------------------------
try {
    if (-not (Get-Command uv -ErrorAction SilentlyContinue)) {
        throw 'The "uv" command was not found. Run scripts\install.ps1 first.'
    }
    if (-not (Test-Path (Join-Path $ProjectRoot '.env'))) {
        Write-Warn '.env not found: Gemini models will be unavailable. Run scripts\install.ps1 to create it.'
    }
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }

    if (Test-Health) {
        Write-Warn "Something already answers on $Url (is the playground already running?)."
        Write-Warn 'Opening the browser on the existing server. Close the other window first if you wanted a restart.'
        Start-Process $Url
        exit 0
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# --- Background watcher: waits for /api/health, then opens the browser ---------
$watcher = Start-Job -ScriptBlock {
    param($HealthUrl, $Url)
    for ($i = 0; $i -lt 60; $i++) {
        try {
            $r = Invoke-WebRequest -UseBasicParsing -Uri $HealthUrl -TimeoutSec 2
            if ($r.StatusCode -eq 200) { Start-Process $Url; return 'opened' }
        } catch { }
        Start-Sleep -Seconds 1
    }
    return 'timeout'
} -ArgumentList $HealthUrl, $Url

# --- Run the server in the foreground, teeing output to the log ---------------
Write-Host '  Starting the server ... the browser will open automatically when it is ready.' -ForegroundColor Cyan
Write-Host '  Press Ctrl+C in this window to stop it.' -ForegroundColor Cyan
Write-Host ''

$exitCode = 0
$writer = $null
Push-Location $ProjectRoot
try {
    $env:PYTHONUNBUFFERED = '1'
    $env:PYTHONIOENCODING = 'utf-8'
    $writer = New-Object System.IO.StreamWriter($LogFile, $true, (New-Object System.Text.UTF8Encoding($false)))
    $writer.AutoFlush = $true
    $writer.WriteLine("# Tennis AI Playground log - started $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') on $env:COMPUTERNAME")

    # cmd merges stderr into stdout so both streams reach the log as plain text.
    $ErrorActionPreference = 'Continue'
    & cmd /c 'uv run playground 2>&1' | ForEach-Object {
        Write-Host $_
        $writer.WriteLine($_)
    }
    $exitCode = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
} finally {
    Pop-Location
    if ($writer) { $writer.WriteLine("# stopped $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"); $writer.Dispose() }
    if ($watcher) { Remove-Job -Job $watcher -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
if ($exitCode -ne 0) {
    Write-Fail "The server stopped with exit code $exitCode. See the log: $LogFile"
    Write-Host '  Tip: run  powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1  to diagnose.'
    exit $exitCode
}
Write-Ok 'Server stopped.'
exit 0
