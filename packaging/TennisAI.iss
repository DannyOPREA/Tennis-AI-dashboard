; Inno Setup 6.1+ script for the Tennis AI Playground Windows installer.
; Built by .github/workflows/release.yml:  ISCC.exe /DAppVersion=x.y.z packaging\TennisAI.iss
; Expects the PyInstaller output in build\dist\TennisAI\ (relative to the repo root).

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#define AppName "Tennis AI Playground"
#define AppExe "TennisAI.exe"
#define OllamaUrl "https://ollama.com/download/OllamaSetup.exe"

[Setup]
AppId={{7E1C2C4A-6C0B-4B6F-9D8B-TENNISAI0001}
AppName={#AppName}
AppVersion={#AppVersion}
AppPublisher=Ancillary AI
DefaultDirName={localappdata}\TennisAI
DefaultGroupName={#AppName}
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=..\build
OutputBaseFilename=TennisAI-Setup-{#AppVersion}
SetupIconFile=icon.ico
UninstallDisplayIcon={app}\{#AppExe}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
CloseApplications=yes

[Languages]
Name: "english"; MessagesFile: "compiler:Default.isl"
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"

[Files]
Source: "..\build\dist\TennisAI\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#AppName}"; Filename: "{app}\{#AppExe}"
Name: "{group}\Tennis AI data folder"; Filename: "{localappdata}\TennisAI\data"
Name: "{autodesktop}\{#AppName}"; Filename: "{app}\{#AppExe}"; Tasks: desktopicon

[Registry]
; Ollama reads these when its tray app starts. They keep the KV cache small enough for 16 GB cards.
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "OLLAMA_FLASH_ATTENTION"; ValueData: "1"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "OLLAMA_KV_CACHE_TYPE"; ValueData: "q8_0"; Flags: uninsdeletevalue
Root: HKCU; Subkey: "Environment"; ValueType: string; ValueName: "OLLAMA_KEEP_ALIVE"; ValueData: "30m"; Flags: uninsdeletevalue

[Run]
Filename: "{app}\{#AppExe}"; Description: "Start {#AppName}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{app}"

[Code]
var
  DownloadPage: TDownloadWizardPage;
  InstallOllama: Boolean;

function OllamaInstalled(): Boolean;
begin
  Result := FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama.exe'))
         or FileExists(ExpandConstant('{pf}\Ollama\ollama.exe'));
end;

procedure InitializeWizard;
begin
  DownloadPage := CreateDownloadPage(SetupMessage(msgWizardPreparing), SetupMessage(msgPreparingDesc), nil);
end;

function NextButtonClick(CurPageID: Integer): Boolean;
begin
  Result := True;
  if CurPageID = wpReady then begin
    InstallOllama := False;
    if not OllamaInstalled() then begin
      if MsgBox('Ollama (the program that runs the local AI models) is not installed.' + #13#10 +
                'Download and install it now? (about 1 GB, needed for the local models; Gemini works without it)',
                mbConfirmation, MB_YESNO) = IDYES then
      begin
        DownloadPage.Clear;
        DownloadPage.Add('{#OllamaUrl}', 'OllamaSetup.exe', '');
        DownloadPage.Show;
        try
          try
            DownloadPage.Download;
            InstallOllama := True;
          except
            if DownloadPage.AbortedByUser then
              Log('Ollama download aborted by user')
            else
              MsgBox('Could not download Ollama: ' + GetExceptionMessage + #13#10 +
                     'You can install it later from https://ollama.com/download', mbError, MB_OK);
          end;
        finally
          DownloadPage.Hide;
        end;
      end;
    end;
  end;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Setup: String;
begin
  if CurStep = ssPostInstall then begin
    if InstallOllama then begin
      Setup := ExpandConstant('{tmp}\OllamaSetup.exe');
      if not Exec(Setup, '/S', '', SW_SHOW, ewWaitUntilTerminated, ResultCode) then
        MsgBox('The Ollama installer could not be started. Install it later from https://ollama.com/download', mbError, MB_OK);
    end;
    { Restart the Ollama tray app so it picks up the environment variables written above. }
    if OllamaInstalled() then begin
      Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM "ollama app.exe"', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      Exec(ExpandConstant('{sys}\taskkill.exe'), '/F /IM ollama.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
      if FileExists(ExpandConstant('{localappdata}\Programs\Ollama\ollama app.exe')) then
        Exec(ExpandConstant('{localappdata}\Programs\Ollama\ollama app.exe'), '', '', SW_HIDE, ewNoWait, ResultCode);
    end;
  end;
end;
