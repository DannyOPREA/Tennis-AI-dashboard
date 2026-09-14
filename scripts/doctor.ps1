<#
.SYNOPSIS
    Quick health check for the Tennis AI Playground installation.

.DESCRIPTION
    Prints one green/red line per check: tool versions, .env keys (values are
    never shown), Ollama reachability and pulled models, GPU, free disk space
    and whether port 8000 is free. Nothing is modified.

.USAGE
        powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

$ProjectRoot  = Split-Path -Parent $PSScriptRoot
$RegistryPath = Join-Path $ProjectRoot 'playground\registry\models.yaml'
$EnvPath      = Join-Path $ProjectRoot '.env'
$script:Problems = 0

function Write-Check([bool]$Ok, [string]$Label, [string]$Detail = '') {
    if ($Ok) { Write-Host ("  [OK]   {0,-34} {1}" -f $Label, $Detail) -ForegroundColor Green }
    else     { Write-Host ("  [FAIL] {0,-34} {1}" -f $Label, $Detail) -ForegroundColor Red; $script:Problems++ }
}
function Write-Note([string]$Text) { Write-Host "         $Text" -ForegroundColor DarkGray }

function Get-ToolVersion([string]$Command, [string[]]$Arguments) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { return $null }
    $ErrorActionPreference = 'Continue'   # function-local: native stderr must not abort the probe
    try {
        $out = & $Command @Arguments 2>$null | Out-String
        if ($LASTEXITCODE -ne 0) { return $null }
        return ($out -split "`r?`n" | Where-Object { $_.Trim() } | Select-Object -First 1).Trim()
    } catch { return $null }
}

function Get-RegistryOllamaTags([string]$Path) {
    # Same minimal parser as pull-models.ps1: "- id:" blocks with provider/model_id/enabled.
    $tags = New-Object System.Collections.Generic.List[string]
    if (-not (Test-Path $Path)) { return ,$tags }
    $entry = $null
    function Add-EntryIfEnabledOllama($e, $list) {
        if ($null -eq $e) { return }
        if ($e.provider -eq 'ollama' -and ($e.enabled -in 'true', 'yes', 'on') -and $e.model_id) { $list.Add($e.model_id) }
    }
    foreach ($raw in [IO.File]::ReadAllLines($Path)) {
        $line = $raw -replace '\s+#.*$', ''
        if ($line -match '^\s*(#|$)') { continue }
        if ($line -match '^\s*-\s+id:\s*(.+?)\s*$') {
            Add-EntryIfEnabledOllama $entry $tags
            $entry = @{ id = $Matches[1].Trim('"', "'"); provider = ''; model_id = ''; enabled = '' }
            continue
        }
        if ($null -ne $entry -and $line -match '^\s*(provider|model_id|enabled)\s*:\s*(.+?)\s*$') {
            $key = $Matches[1]; $val = $Matches[2].Trim('"', "'")
            if ($key -ne 'model_id') { $val = $val.ToLowerInvariant() }
            $entry[$key] = $val
        }
    }
    Add-EntryIfEnabledOllama $entry $tags
    return ,$tags
}

function ConvertTo-FullTag([string]$Tag) { if ($Tag -match ':') { $Tag } else { "$Tag`:latest" } }

function Get-EnvFileValues([string]$Path) {
    $map = @{}
    if (-not (Test-Path $Path)) { return $map }
    foreach ($l in [IO.File]::ReadAllLines($Path)) {
        if ($l -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$') { $map[$Matches[1]] = $Matches[2].Trim().Trim('"', "'") }
    }
    return $map
}

function Format-Gb([double]$Bytes) { "{0:N1} GB" -f ($Bytes / 1GB) }

Write-Host ''
Write-Host '  Tennis AI Playground - doctor' -ForegroundColor Cyan
Write-Host "  Project: $ProjectRoot"
Write-Host ''

# --- Tools -------------------------------------------------------------------
Write-Host '  Tools' -ForegroundColor Cyan
$v = Get-ToolVersion 'uv' @('--version');           Write-Check ($null -ne $v) 'uv' $(if ($v) { $v } else { 'not found - run scripts\install.ps1' })

$py = $null
if ($v) {
    Push-Location $ProjectRoot
    try { $py = Get-ToolVersion 'uv' @('run', '--no-sync', 'python', '--version') } finally { Pop-Location }
}
Write-Check ($null -ne $py) 'python (via uv)' $(if ($py) { $py } else { 'not ready - run scripts\install.ps1 (uv sync)' })

$v = Get-ToolVersion 'ffmpeg' @('-version');         Write-Check ($null -ne $v) 'ffmpeg' $(if ($v) { (($v -replace '^ffmpeg version\s+', '') -split '\s+')[0] } else { 'not found - needed to extract frames' })
$v = Get-ToolVersion 'ollama' @('--version');        Write-Check ($null -ne $v) 'ollama' $(if ($v) { $v } else { 'not found - local models unavailable' })

# --- .env --------------------------------------------------------------------
Write-Host ''
Write-Host '  Configuration (.env) - values are never printed' -ForegroundColor Cyan
$envMap = Get-EnvFileValues $EnvPath
Write-Check (Test-Path $EnvPath) '.env file' $(if (Test-Path $EnvPath) { $EnvPath } else { 'missing - run scripts\install.ps1' })
foreach ($key in 'GEMINI_API_KEY', 'OLLAMA_URL', 'DATA_DIR', 'HOST_NAME') {
    $present = $envMap.ContainsKey($key) -and $envMap[$key] -ne ''
    $detail = if ($present) { "set ($($envMap[$key].Length) chars)" } else { 'missing or empty' }
    if ($key -eq 'OLLAMA_URL' -or $key -eq 'DATA_DIR') { $detail = if ($present) { $envMap[$key] } else { 'missing or empty' } }
    Write-Check $present $key $detail
}

# --- Ollama --------------------------------------------------------------------
Write-Host ''
Write-Host '  Ollama' -ForegroundColor Cyan
$ollamaUrl = if ($envMap.ContainsKey('OLLAMA_URL') -and $envMap['OLLAMA_URL']) { $envMap['OLLAMA_URL'].TrimEnd('/') } else { 'http://127.0.0.1:11434' }
$installed = @()
$reachable = $false
try {
    $resp = Invoke-RestMethod -Uri "$ollamaUrl/api/tags" -TimeoutSec 3
    $reachable = $true
    if ($resp.models) { $installed = @($resp.models | ForEach-Object { $_.name }) }
} catch { }
Write-Check $reachable "Ollama reachable" $(if ($reachable) { "$ollamaUrl ($($installed.Count) model(s) pulled)" } else { "$ollamaUrl not answering - start Ollama from the Start menu" })

$tags = Get-RegistryOllamaTags $RegistryPath
if ($tags.Count -eq 0) { Write-Check $false 'registry models' "none found in $RegistryPath" }
foreach ($t in $tags) {
    $have = $reachable -and ((ConvertTo-FullTag $t) -in $installed)
    Write-Check $have "model $t" $(if ($have) { 'pulled' } elseif ($reachable) { 'missing - run scripts\pull-models.ps1' } else { 'unknown (Ollama down)' })
}
foreach ($k in 'OLLAMA_FLASH_ATTENTION', 'OLLAMA_KV_CACHE_TYPE', 'OLLAMA_KEEP_ALIVE') {
    $val = [Environment]::GetEnvironmentVariable($k, 'User')
    Write-Check ([bool]$val) "$k (user env)" $(if ($val) { $val } else { 'not set - run scripts\install.ps1' })
}

# --- GPU -------------------------------------------------------------------------
Write-Host ''
Write-Host '  GPU' -ForegroundColor Cyan
$gpu = $null
if (Get-Command nvidia-smi -ErrorAction SilentlyContinue) {
    try {
        $ErrorActionPreference = 'Continue'
        $gpu = (& nvidia-smi --query-gpu=name,memory.total,driver_version --format=csv,noheader 2>$null | Out-String).Trim()
        if ($LASTEXITCODE -ne 0) { $gpu = $null }
    } catch { $gpu = $null }
    $ErrorActionPreference = 'Stop'
}
Write-Check ($null -ne $gpu -and $gpu -ne '') 'NVIDIA GPU' $(if ($gpu) { $gpu -replace "`r?`n", ' | ' } else { 'nvidia-smi not found or failed - install/update the NVIDIA driver' })

# --- Disk ----------------------------------------------------------------------
Write-Host ''
Write-Host '  Disk' -ForegroundColor Cyan
try {
    $projRoot = [IO.Path]::GetPathRoot($ProjectRoot)
    $projDrive = New-Object System.IO.DriveInfo($projRoot)
    $free = $projDrive.AvailableFreeSpace
    Write-Check ($free -gt 10GB) "free space on $projRoot (videos/frames)" (Format-Gb $free)

    $modelsDir = if ($env:OLLAMA_MODELS) { $env:OLLAMA_MODELS } else { Join-Path $env:USERPROFILE '.ollama' }
    $modelsRoot = [IO.Path]::GetPathRoot($modelsDir)
    if ($modelsRoot -ne $projRoot) {
        $free2 = (New-Object System.IO.DriveInfo($modelsRoot)).AvailableFreeSpace
        Write-Check ($free2 -gt 10GB) "free space on $modelsRoot (Ollama models)" (Format-Gb $free2)
    }
} catch { Write-Check $false 'disk space' $_.Exception.Message }

# --- Port 8000 -------------------------------------------------------------------
Write-Host ''
Write-Host '  Network' -ForegroundColor Cyan
$portFree = $true
try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect('127.0.0.1', 8000, $null, $null)
    if ($async.AsyncWaitHandle.WaitOne(500) -and $client.Connected) { $portFree = $false }
    $client.Close()
} catch { $portFree = $true }
if ($portFree) {
    Write-Check $true 'port 8000' 'free'
} else {
    $isPlayground = $false
    try { $h = Invoke-RestMethod -Uri 'http://127.0.0.1:8000/api/health' -TimeoutSec 2; $isPlayground = ($h.status -eq 'ok') } catch { }
    if ($isPlayground) { Write-Check $true 'port 8000' 'in use by the playground (already running)' }
    else { Write-Check $false 'port 8000' 'in use by another program - close it or reboot' }
}

# --- Summary -----------------------------------------------------------------------
Write-Host ''
if ($script:Problems -eq 0) { Write-Host '  All checks passed.' -ForegroundColor Green }
else { Write-Host "  $($script:Problems) check(s) need attention (see red lines above)." -ForegroundColor Yellow }
$logDir = Join-Path $ProjectRoot 'data\logs'
if (Test-Path $logDir) {
    $last = Get-ChildItem $logDir -Filter 'playground-*.log' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    if ($last) { Write-Note "Latest log: $($last.FullName)" }
}
Write-Host ''
exit 0
