#ifndef AppVersion
  #error AppVersion is required
#endif
#ifndef PayloadDir
  #error PayloadDir is required
#endif
#ifndef AppIcon
  #error AppIcon is required
#endif

[Setup]
AppId={{38B9F851-B695-4857-BB32-06F6F7D2168B}
AppName=CoReader
AppVersion={#AppVersion}
AppPublisher=CoReader contributors
AppPublisherURL=https://github.com/YuboCoco/CoReader
AppSupportURL=https://github.com/YuboCoco/CoReader/issues
DefaultDirName={localappdata}\Programs\CoReader
DefaultGroupName=CoReader
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
WizardStyle=modern
SetupIconFile={#AppIcon}
OutputBaseFilename=CoReader-{#AppVersion}-Setup-win-x64
UninstallDisplayIcon={app}\CoReader.exe
UninstallDisplayName=CoReader
VersionInfoVersion={#AppVersion}
VersionInfoProductName=CoReader
VersionInfoDescription=CoReader Setup
Compression=lzma2/fast
SolidCompression=no
CloseApplications=yes
CloseApplicationsFilter=CoReader.exe
RestartApplications=yes

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
#ifdef ChineseMessages
Name: "zh"; MessagesFile: "{#ChineseMessages}"
#endif

[CustomMessages]
en.DesktopShortcut=Create a desktop shortcut
en.UninstallCoReader=Uninstall CoReader
en.OpenCoReader=Open CoReader
#ifdef ChineseMessages
zh.DesktopShortcut=创建桌面快捷方式
zh.UninstallCoReader=卸载 CoReader
zh.OpenCoReader=启动 CoReader
#endif

[Tasks]
Name: "desktopicon"; Description: "{cm:DesktopShortcut}"; Flags: unchecked

[Files]
Source: "{#PayloadDir}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\CoReader"; Filename: "{app}\CoReader.exe"; WorkingDir: "{app}"
Name: "{group}\{cm:UninstallCoReader}"; Filename: "{uninstallexe}"
Name: "{userdesktop}\CoReader"; Filename: "{app}\CoReader.exe"; WorkingDir: "{app}"; Tasks: desktopicon

[Run]
; Electron sandbox processes need to read installed runtime assets on Windows.
Filename: "{sys}\icacls.exe"; Parameters: """{app}"" /grant *S-1-15-2-1:(OI)(CI)(RX)"; Flags: runhidden waituntilterminated
Filename: "{app}\CoReader.exe"; WorkingDir: "{app}"; Description: "{cm:OpenCoReader}"; Flags: nowait postinstall skipifsilent
