<#
.SYNOPSIS
    Downloads the local Ollama models listed in playground\registry\models.yaml.

.DESCRIPTION
    Reads the registry (no YAML library needed), keeps the entries with
    "provider: ollama" and "enabled: true", makes sure Ollama is running,
    then runs "ollama pull <tag>" for each one, skipping tags already present.

.USAGE
        powershell -ExecutionPolicy Bypass -File scripts\pull-models.ps1
        powershell -ExecutionPolicy Bypass -File scripts\pull-models.ps1 -Only qwen3-vl:8b
        powershell -ExecutionPolicy Bypass -File scripts\pull-models.ps1 -Force

.PARAMETER Only
    Pull just this one tag (it must still be listed in models.yaml).

.PARAMETER Force
    Re-pull tags even if "ollama list" already shows them (fetches updates).
#>

[CmdletBinding()]
param(
    [string]$Only = '',
    [switch]$Force
)

$ErrorActionPreference = 'Stop'

$ProjectRoot  = Split-Path -Parent $PSScriptRoot
$RegistryPath = Join-Path $ProjectRoot 'playground\registry\models.yaml'
$EstimatedGbPerModel = 6.5   # rough: current rows are ~5-8 GB each

function Write-Info([string]$Text) { Write-Host "    $Text" -ForegroundColor Gray }
function Write-Ok([string]$Text)   { Write-Host "    [OK]   $Text" -ForegroundColor Green }
function Write-Warn([string]$Text) { Write-Host "    [WARN] $Text" -ForegroundColor Yellow }
function Write-Fail([string]$Text) { Write-Host "    [FAIL] $Text" -ForegroundColor Red }

# ---------------------------------------------------------------------------
# Minimal registry parser: walks "  - id:" blocks and remembers provider,
# model_id and enabled for each. Ignores comments, blank lines, indentation.
# ---------------------------------------------------------------------------
function Get-RegistryOllamaTags([string]$Path) {
    if (-not (Test-Path $Path)) { throw "Registry not found: $Path" }
    $tags = New-Object System.Collections.Generic.List[string]
    $entry = $null

    function Add-EntryIfEnabledOllama($e, $list) {
        if ($null -eq $e) { return }
        if ($e.provider -eq 'ollama' -and ($e.enabled -in 'true', 'yes', 'on') -and $e.model_id) {
            $list.Add($e.model_id)
        }
    }

    foreach ($raw in [IO.File]::ReadAllLines($Path)) {
        $line = $raw -replace '\s+#.*$', ''            # strip trailing comments
        if ($line -match '^\s*(#|$)') { continue }      # comment-only or blank line
        if ($line -match '^\s*-\s+id:\s*(.+?)\s*$') {  # start of a new list entry
            Add-EntryIfEnabledOllama $entry $tags
            $entry = @{ id = $Matches[1].Trim('"', "'"); provider = ''; model_id = ''; enabled = '' }
            continue
        }
        if ($null -ne $entry -and $line -match '^\s*(provider|model_id|enabled)\s*:\s*(.+?)\s*$') {
            $key = $Matches[1]
            $val = $Matches[2].Trim('"', "'")
            if ($key -ne 'model_id') { $val = $val.ToLowerInvariant() }
            $entry[$key] = $val
        }
    }
    Add-EntryIfEnabledOllama $entry $tags
    return ,$tags
}

function Get-OllamaInstalledTags {
    # First column of "ollama list", header removed. Returns @() if Ollama is unreachable.
    $ErrorActionPreference = 'Continue'   # function-local: native stderr must not abort
    $out = & ollama list 2>$null
    if ($LASTEXITCODE -ne 0 -or -not $out) { return @() }
    $names = @()
    foreach ($l in @($out) | Select-Object -Skip 1) {
        $t = ($l -split '\s+')[0]
        if ($t) { $names += $t }
    }
    return $names
}

function ConvertTo-FullTag([string]$Tag) {
    # "ollama list" always shows a tag suffix; "minicpm-v4.5" is stored as "minicpm-v4.5:latest".
    if ($Tag -match ':') { return $Tag } else { return "$Tag`:latest" }
}

function Test-OllamaAlive {
    $ErrorActionPreference = 'Continue'   # function-local
    & ollama list *> $null
    return ($LASTEXITCODE -eq 0)
}

# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '  ==================================================' -ForegroundColor Cyan
Write-Host '   Tennis AI Playground - download local models' -ForegroundColor Cyan
Write-Host '  ==================================================' -ForegroundColor Cyan
Write-Host ''

# 1. Read the registry
try {
    $tags = Get-RegistryOllamaTags $RegistryPath
    if ($tags.Count -eq 0) { throw "No enabled Ollama models found in $RegistryPath" }
    if ($Only) {
        $match = @($tags | Where-Object { $_ -eq $Only -or (ConvertTo-FullTag $_) -eq (ConvertTo-FullTag $Only) })
        if ($match.Count -eq 0) {
            throw "'$Only' is not an enabled Ollama model in the registry. Known tags: $($tags -join ', ')"
        }
        $tags = $match
    }
    Write-Host "  Models in the registry ($($tags.Count)):"
    foreach ($t in $tags) { Write-Info "- $t" }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# 2. Make sure Ollama is installed and running
Write-Host ''
Write-Host '  Checking Ollama ...'
try {
    if (-not (Get-Command ollama -ErrorAction SilentlyContinue)) {
        throw 'The "ollama" command was not found. Run scripts\install.ps1 first (or open a new PowerShell window).'
    }
    if (Test-OllamaAlive) {
        Write-Ok 'Ollama is running'
    } else {
        Write-Info 'Ollama is not responding; starting "ollama serve" in the background ...'
        Start-Process -FilePath 'ollama' -ArgumentList 'serve' -WindowStyle Hidden | Out-Null
        $alive = $false
        for ($i = 0; $i -lt 30; $i++) {
            Start-Sleep -Seconds 1
            if (Test-OllamaAlive) { $alive = $true; break }
        }
        if (-not $alive) {
            throw 'Ollama did not start within 30 s. Start "Ollama" from the Start menu and run this script again.'
        }
        Write-Ok "Ollama started (took about $($i + 1) s)"
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# 3. Disk space + size warning
Write-Host ''
try {
    $modelsDir = $env:OLLAMA_MODELS
    if (-not $modelsDir) { $modelsDir = Join-Path $env:USERPROFILE '.ollama' }
    $root = [IO.Path]::GetPathRoot($modelsDir)
    $drive = New-Object System.IO.DriveInfo($root)
    $freeGb = [math]::Round($drive.AvailableFreeSpace / 1GB, 1)

    $installed = Get-OllamaInstalledTags
    $toPull = @($tags | Where-Object { $Force -or ((ConvertTo-FullTag $_) -notin $installed) })
    $estGb = [math]::Round($toPull.Count * $EstimatedGbPerModel, 0)

    Write-Host "  Models are stored in: $modelsDir"
    Write-Host "  Free space on $root : $freeGb GB"
    if ($toPull.Count -gt 0) {
        Write-Warn "About to download $($toPull.Count) model(s): roughly $estGb GB in total (5-8 GB each). This can take a long time."
        if ($freeGb -lt ($toPull.Count * 8)) {
            Write-Warn "Free space may be insufficient (need up to $($toPull.Count * 8) GB). Free up space or press Ctrl+C now."
        }
    } else {
        Write-Ok 'All models are already present (use -Force to re-download).'
    }
} catch {
    Write-Warn "Could not compute disk space: $($_.Exception.Message)"
    $installed = Get-OllamaInstalledTags
}

# 4. Pull sequentially
Write-Host ''
$results = @()
foreach ($tag in $tags) {
    $full = ConvertTo-FullTag $tag
    if (-not $Force -and ($full -in $installed)) {
        Write-Ok "$tag already present - skipped"
        $results += [pscustomobject]@{ Model = $tag; Status = 'skipped'; Note = 'already in ollama list' }
        continue
    }
    Write-Host ''
    Write-Host "  ==> ollama pull $tag" -ForegroundColor Cyan
    $sw = [Diagnostics.Stopwatch]::StartNew()
    try {
        & ollama pull $tag
        $code = $LASTEXITCODE
        $sw.Stop()
        if ($code -eq 0) {
            Write-Ok "$tag pulled in $([math]::Round($sw.Elapsed.TotalMinutes,1)) min"
            $results += [pscustomobject]@{ Model = $tag; Status = 'pulled'; Note = "$([math]::Round($sw.Elapsed.TotalMinutes,1)) min" }
        } else {
            Write-Fail "$tag failed (exit code $code)"
            $results += [pscustomobject]@{ Model = $tag; Status = 'failed'; Note = "exit code $code - check the tag name / internet" }
        }
    } catch {
        $sw.Stop()
        Write-Fail "$tag failed: $($_.Exception.Message)"
        $results += [pscustomobject]@{ Model = $tag; Status = 'failed'; Note = $_.Exception.Message }
    }
}

# 5. Summary
Write-Host ''
Write-Host '  Summary' -ForegroundColor Cyan
$results | Format-Table -AutoSize | Out-String | ForEach-Object { Write-Host $_ }
$failedCount = @($results | Where-Object { $_.Status -eq 'failed' }).Count
if ($failedCount -gt 0) {
    Write-Fail "$failedCount model(s) failed. Run the script again; it will only retry the missing ones."
    exit 1
}
Write-Ok 'Done. Start the playground with scripts\run.cmd'
exit 0
