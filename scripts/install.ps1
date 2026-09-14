<#
.SYNOPSIS
    One-shot installer for the Tennis AI Playground on Windows 10/11.

.DESCRIPTION
    Installs uv, FFmpeg and Ollama with winget (skipping anything already
    present), installs Python 3.13 and the project's dependencies with uv,
    creates the data folders, writes .env (asking for the Gemini API key
    without echoing it), configures Ollama for the GPU and checks the
    NVIDIA driver. Safe to run again at any time.

.USAGE
    Open PowerShell in the project folder and run:

        powershell -ExecutionPolicy Bypass -File scripts\install.ps1

    (If the zip was downloaded from the internet, first right-click the zip,
    Properties, tick "Unblock", or run:  Unblock-File -Path .\scripts\*.ps1)
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version 2.0

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
$script:ProjectRoot = Split-Path -Parent $PSScriptRoot
$script:Warnings = New-Object System.Collections.Generic.List[string]

function Write-Step([string]$Text) {
    Write-Host ''
    Write-Host "==> $Text" -ForegroundColor Cyan
}
function Write-Ok([string]$Text)   { Write-Host "    [OK]   $Text" -ForegroundColor Green }
function Write-Skip([string]$Text) { Write-Host "    [SKIP] $Text" -ForegroundColor DarkGray }
function Write-Warn([string]$Text) {
    Write-Host "    [WARN] $Text" -ForegroundColor Yellow
    $script:Warnings.Add($Text) | Out-Null
}
function Write-Fail([string]$Text) { Write-Host "    [FAIL] $Text" -ForegroundColor Red }

function Update-SessionPath {
    # Re-read PATH from the registry (Machine + User) so binaries installed a
    # moment ago are visible in this same PowerShell session.
    $machine = [Environment]::GetEnvironmentVariable('Path', 'Machine')
    $user    = [Environment]::GetEnvironmentVariable('Path', 'User')
    $env:Path = (($machine, $user) -join ';').Trim(';')
}

function Test-Command([string]$Name) {
    return [bool](Get-Command $Name -ErrorAction SilentlyContinue)
}

function Add-UserPathEntry([string]$Dir) {
    $user = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = @()
    if ($user) { $parts = $user -split ';' | Where-Object { $_ } }
    if ($parts -notcontains $Dir) {
        [Environment]::SetEnvironmentVariable('Path', (($parts + $Dir) -join ';'), 'User')
    }
    Update-SessionPath
}

function Install-WingetPackage {
    param(
        [Parameter(Mandatory)][string]$Id,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string]$Label
    )
    if (Test-Command $Command) {
        Write-Skip "$Label is already installed ($((Get-Command $Command).Source))"
        return
    }
    Write-Host "    Installing $Label via winget ($Id) ... this can take a few minutes." -ForegroundColor Gray
    # winget returns non-zero for "already installed / no update" situations, so we
    # judge success by whether the command is on PATH afterwards, not by the exit code.
    & winget install --id $Id -e --accept-source-agreements --accept-package-agreements
    $code = $LASTEXITCODE
    Update-SessionPath
    if (Test-Command $Command) {
        Write-Ok "$Label installed ($((Get-Command $Command).Source))"
        return
    }
    throw "winget finished (exit code $code) but '$Command' is still not on PATH. Open a new PowerShell window and run this script again; if it still fails, install '$Id' manually."
}

function ConvertFrom-SecureToPlain([System.Security.SecureString]$Secure) {
    $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try   { return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
}

function Set-EnvFileValue([string[]]$Lines, [string]$Key, [string]$Value) {
    # Replace "KEY=..." in place; append if the key is missing.
    $found = $false
    $out = foreach ($l in $Lines) {
        if ($l -match "^\s*$([regex]::Escape($Key))\s*=") { $found = $true; "$Key=$Value" } else { $l }
    }
    if (-not $found) { $out = @($out) + "$Key=$Value" }
    return $out
}

function Write-Utf8NoBom([string]$Path, [string[]]$Lines) {
    # .env must be plain UTF-8 without BOM, otherwise the first key would be mangled.
    $enc = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($Path, (($Lines -join "`r`n") + "`r`n"), $enc)
}

# ---------------------------------------------------------------------------
# Banner
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '  =============================================================' -ForegroundColor Cyan
Write-Host '   Tennis AI Playground - Windows installer' -ForegroundColor Cyan
Write-Host '  =============================================================' -ForegroundColor Cyan
Write-Host "   Project folder : $ProjectRoot"
Write-Host "   Computer name  : $env:COMPUTERNAME"
Write-Host "   PowerShell     : $($PSVersionTable.PSVersion)"
Write-Host ''
Write-Host '   This script installs uv, FFmpeg and Ollama, prepares Python,'
Write-Host '   creates the data folders and writes your .env configuration.'
Write-Host '   It is safe to run more than once.'
Write-Host ''

$failed = $false

# ---------------------------------------------------------------------------
# 1. Windows 10/11 + winget
# ---------------------------------------------------------------------------
Write-Step 'Checking Windows version and winget'
try {
    if ($env:OS -ne 'Windows_NT') { throw 'This installer only runs on Windows.' }
    $os = [Environment]::OSVersion.Version
    if ($os.Major -lt 10) { throw "Windows 10 or 11 is required (detected $os)." }
    $caption = "Windows $os"
    try { $caption = (Get-CimInstance Win32_OperatingSystem -ErrorAction Stop).Caption } catch { }
    Write-Ok "$caption (build $($os.Build))"

    if (-not (Test-Command 'winget')) {
        Write-Fail 'winget (Windows Package Manager) was not found.'
        Write-Host ''
        Write-Host '    How to get it:' -ForegroundColor Yellow
        Write-Host '      1. Open the Microsoft Store.'
        Write-Host '      2. Search for "App Installer" (publisher: Microsoft) and install / update it.'
        Write-Host '      3. Close and reopen PowerShell, then run this script again.'
        Write-Host '    Direct link: https://apps.microsoft.com/detail/9NBLGGH4NNS1'
        throw 'winget is required.'
    }
    $wv = $null
    $ErrorActionPreference = 'Continue'
    $wv = (& winget --version) 2>$null
    $ErrorActionPreference = 'Stop'
    Write-Ok "winget $wv"
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# ---------------------------------------------------------------------------
# 2. Tools via winget
# ---------------------------------------------------------------------------
Write-Step 'Installing tools (uv, FFmpeg, Ollama)'
try {
    Install-WingetPackage -Id 'astral-sh.uv'  -Command 'uv'     -Label 'uv (Python manager)'
} catch { Write-Fail $_.Exception.Message; $failed = $true }

try {
    Install-WingetPackage -Id 'Gyan.FFmpeg'   -Command 'ffmpeg' -Label 'FFmpeg'
} catch {
    # Some winget versions do not link ffmpeg.exe onto PATH; look for it in the winget package folder.
    $pkgDir = Join-Path $env:LOCALAPPDATA 'Microsoft\WinGet\Packages'
    $ff = $null
    if (Test-Path $pkgDir) {
        $ff = Get-ChildItem -Path $pkgDir -Filter 'ffmpeg.exe' -Recurse -ErrorAction SilentlyContinue |
              Where-Object { $_.FullName -like '*Gyan.FFmpeg*' } | Select-Object -First 1
    }
    if ($ff) {
        Add-UserPathEntry $ff.DirectoryName
        Write-Ok "FFmpeg found at $($ff.FullName); its folder was added to your PATH"
    } else {
        Write-Fail $_.Exception.Message
        $failed = $true
    }
}

try {
    Install-WingetPackage -Id 'Ollama.Ollama' -Command 'ollama' -Label 'Ollama (local models)'
} catch { Write-Fail $_.Exception.Message; $failed = $true }

if ($failed) {
    Write-Host ''
    Write-Fail 'One or more tools could not be installed. Fix the messages above and run the script again.'
    exit 1
}

# ---------------------------------------------------------------------------
# 3. Python + project dependencies
# ---------------------------------------------------------------------------
Write-Step 'Installing Python 3.13 and project dependencies with uv'
try {
    Push-Location $ProjectRoot
    try {
        & uv python install 3.13
        if ($LASTEXITCODE -ne 0) { throw "'uv python install 3.13' failed with exit code $LASTEXITCODE." }
        Write-Ok 'Python 3.13 is available to uv'

        & uv sync
        if ($LASTEXITCODE -ne 0) { throw "'uv sync' failed with exit code $LASTEXITCODE (check your internet connection and run the script again)." }
        Write-Ok 'Project dependencies installed (.venv)'
    } finally { Pop-Location }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# ---------------------------------------------------------------------------
# 4. Data folders
# ---------------------------------------------------------------------------
Write-Step 'Creating data folders'
try {
    foreach ($sub in 'videos', 'frames', 'logs') {
        $dir = Join-Path $ProjectRoot "data\$sub"
        if (Test-Path $dir) { Write-Skip "data\$sub exists" }
        else { New-Item -ItemType Directory -Path $dir -Force | Out-Null; Write-Ok "created data\$sub" }
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# ---------------------------------------------------------------------------
# 5. .env
# ---------------------------------------------------------------------------
Write-Step 'Configuring .env'
try {
    $envPath     = Join-Path $ProjectRoot '.env'
    $examplePath = Join-Path $ProjectRoot '.env.example'

    $needKey = $false
    if (-not (Test-Path $envPath)) {
        if (-not (Test-Path $examplePath)) { throw '.env.example is missing from the project folder.' }
        Copy-Item $examplePath $envPath
        Write-Ok 'created .env from .env.example'
        $needKey = $true
    } else {
        Write-Skip '.env already exists (values are kept)'
        $existing = [IO.File]::ReadAllLines($envPath)
        $keyLine = $existing | Where-Object { $_ -match '^\s*GEMINI_API_KEY\s*=\s*(.*)$' } | Select-Object -First 1
        if (-not $keyLine -or ($keyLine -replace '^\s*GEMINI_API_KEY\s*=\s*', '').Trim() -eq '') {
            Write-Warn 'GEMINI_API_KEY is empty in .env'
            $answer = Read-Host '    Enter the Gemini API key now? (y/N)'
            if ($answer -match '^[yY]') { $needKey = $true }
        }
    }

    if ($needKey) {
        Write-Host ''
        Write-Host '    Paste your Gemini API key (from https://aistudio.google.com/apikey).' -ForegroundColor Yellow
        Write-Host '    Nothing is shown while you type; press Enter when done (leave empty to skip).'
        $secure = Read-Host -AsSecureString '    GEMINI_API_KEY'
        $plain  = ConvertFrom-SecureToPlain $secure
        $lines  = [IO.File]::ReadAllLines($envPath)
        if ($plain.Trim() -ne '') {
            $lines = Set-EnvFileValue $lines 'GEMINI_API_KEY' $plain.Trim()
            Write-Ok 'GEMINI_API_KEY written to .env'
        } else {
            Write-Warn 'No key entered; edit .env later and set GEMINI_API_KEY=... (Gemini models will not work until then).'
        }
        $lines = Set-EnvFileValue $lines 'HOST_NAME'  $env:COMPUTERNAME
        $lines = Set-EnvFileValue $lines 'OLLAMA_URL' 'http://127.0.0.1:11434'
        Write-Utf8NoBom $envPath $lines
        $plain = $null
        Write-Ok "HOST_NAME=$env:COMPUTERNAME and OLLAMA_URL=http://127.0.0.1:11434 written"
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# ---------------------------------------------------------------------------
# 6. Ollama environment variables (User scope)
# ---------------------------------------------------------------------------
Write-Step 'Configuring Ollama for the GPU (user environment variables)'
try {
    $ollamaVars = [ordered]@{
        OLLAMA_FLASH_ATTENTION = '1'
        OLLAMA_KV_CACHE_TYPE   = 'q8_0'
        OLLAMA_KEEP_ALIVE      = '30m'
    }
    $changed = $false
    foreach ($k in $ollamaVars.Keys) {
        $v = $ollamaVars[$k]
        $current = [Environment]::GetEnvironmentVariable($k, 'User')
        if ($current -eq $v) { Write-Skip "$k=$v already set" }
        else {
            [Environment]::SetEnvironmentVariable($k, $v, 'User')
            Write-Ok "$k=$v"
            $changed = $true
        }
        Set-Item -Path "Env:$k" -Value $v   # also for this session
    }
    if ($changed) {
        Write-Host ''
        Write-Host '    IMPORTANT: Ollama only reads these settings when it starts.' -ForegroundColor Yellow
        Write-Host '    Right-click the Ollama icon in the system tray (bottom-right, near the clock),'
        Write-Host '    choose "Quit Ollama", then start Ollama again from the Start menu.'
        Write-Warn 'Quit and relaunch the Ollama tray app so the new GPU settings take effect.'
    }
} catch {
    Write-Fail $_.Exception.Message
    exit 1
}

# ---------------------------------------------------------------------------
# 7. NVIDIA driver / GPU
# ---------------------------------------------------------------------------
Write-Step 'Checking the NVIDIA GPU'
try {
    if (Test-Command 'nvidia-smi') {
        $ErrorActionPreference = 'Continue'
        $gpu = (& nvidia-smi --query-gpu=name,memory.total --format=csv,noheader) 2>$null
        $ErrorActionPreference = 'Stop'
        if ($LASTEXITCODE -eq 0 -and $gpu) {
            foreach ($g in @($gpu)) { Write-Ok "GPU: $($g.Trim())" }
            $mib = 0
            if ("$gpu" -match '(\d+)\s*MiB') { $mib = [int]$Matches[1] }
            if ($mib -gt 0 -and $mib -lt 15000) {
                Write-Warn "Only ~$([math]::Round($mib/1024,1)) GB of VRAM detected; use the 'Light (16 GB)' preset and the smaller models."
            }
        } else {
            Write-Warn 'nvidia-smi exists but returned an error. Update the NVIDIA driver from https://www.nvidia.com/drivers'
        }
    } else {
        Write-Warn 'nvidia-smi not found: no NVIDIA driver detected. Local models will run on the CPU (very slow). Install the driver from https://www.nvidia.com/drivers'
    }
} catch {
    Write-Warn "GPU check failed: $($_.Exception.Message)"
}

# ---------------------------------------------------------------------------
# Summary + optional model download
# ---------------------------------------------------------------------------
Write-Host ''
Write-Host '  =============================================================' -ForegroundColor Green
Write-Host '   Installation finished.' -ForegroundColor Green
Write-Host '  =============================================================' -ForegroundColor Green
if ($Warnings.Count -gt 0) {
    Write-Host ''
    Write-Host '   Things to look at:' -ForegroundColor Yellow
    foreach ($w in $Warnings) { Write-Host "    - $w" -ForegroundColor Yellow }
}
Write-Host ''
Write-Host '   Next steps:'
Write-Host '     1. Download the local models:  powershell -ExecutionPolicy Bypass -File scripts\pull-models.ps1'
Write-Host '     2. Start the playground:       double-click scripts\run.cmd'
Write-Host '     3. Something wrong?            powershell -ExecutionPolicy Bypass -File scripts\doctor.ps1'
Write-Host ''

try {
    $pull = Read-Host '   Download the local Ollama models now? (~25-30 GB, y/N)'
    if ($pull -match '^[yY]') {
        & powershell -NoProfile -ExecutionPolicy Bypass -File (Join-Path $PSScriptRoot 'pull-models.ps1')
    }
} catch {
    Write-Warn "Could not start pull-models.ps1: $($_.Exception.Message)"
}
exit 0
