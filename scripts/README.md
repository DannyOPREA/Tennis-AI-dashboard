# Windows scripts (manual / advanced fallback)

These PowerShell scripts are the **manual way** to install and run the playground on a Windows PC.
They exist for developers and as a fallback when the packaged installer (`TennisAI-Setup-<version>.exe`
from the GitHub Releases page) cannot be used. **Clients who installed the app with the installer do
not need them**: the installer, the `TennisAI.exe` tray app, and the in-app Welcome / Settings pages
cover everything below.

All scripts require a **checkout of this repository** and are run from its root, for example
`powershell -ExecutionPolicy Bypass -File scripts\install.ps1`.

| Script | What it does |
|---|---|
| `install.ps1` | One-shot setup: installs `uv`, FFmpeg and Ollama with winget, installs Python 3.13 and the dependencies, creates the data folders and `.env` (asks for the Gemini key), configures Ollama for the GPU, checks the NVIDIA driver. Safe to re-run. |
| `pull-models.ps1` | Downloads the Ollama models listed in `playground/registry/models.yaml`; skips what is already present. |
| `run.ps1` | Starts the backend with the built frontend and opens <http://127.0.0.1:8000> in the browser. |
| `run.cmd` | Double-click wrapper around `run.ps1` (bypasses the execution policy, pauses on error). |
| `doctor.ps1` | Read-only health check: tool versions, `.env` keys present, Ollama reachable and models pulled, GPU, free disk, port 8000 free. |

With the installer, the equivalents are: the installer itself (install + Ollama), the Settings page
(models, Gemini key), the Start menu / tray icon (run), and `%LOCALAPPDATA%\TennisAI\data\logs\app.log`
(diagnostics).
