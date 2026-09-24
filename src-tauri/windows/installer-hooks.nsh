!include LogicLib.nsh

; Same structure as NetsuBoard's hooks, trimmed to what NetsuCast needs. Everything NetsuCast
; writes on its own lives under the bundle identifier (%APPDATA%\com.netsucast.app for settings,
; %LOCALAPPDATA%\com.netsucast.app for caches, logs and the WebView2 profile), which Tauri's own
; "Delete application data" checkbox already removes, so no custom uninstall page is needed.

LangString NCElevateAsk 1036 "NetsuCast est installé dans :$\n$INSTDIR$\n$\nCe dossier demande des droits administrateur, que cette installation n'a pas. Continuer en tant qu'administrateur ?"
LangString NCElevateAsk 1033 "NetsuCast is installed in:$\n$INSTDIR$\n$\nThat folder requires administrator rights, which this installer does not have. Continue as administrator?"
LangString NCWriteError 1036 "Impossible d'écrire dans :$\n$INSTDIR$\n$\nRéinstalle NetsuCast dans un dossier qui t'appartient — le dossier proposé par défaut convient."
LangString NCWriteError 1033 "Cannot write to:$\n$INSTDIR$\n$\nReinstall NetsuCast into a folder you own — the default location works."

!macro NSIS_HOOK_PREINSTALL
  ; Write access, settled BEFORE the first byte is written. `installMode: currentUser` compiles to
  ; RequestExecutionLevel user, so an install someone pointed at Program Files — it only succeeded
  ; because that first setup ran as administrator — could never be updated by the app itself: every
  ; File would be refused, one dialog at a time. Ask once and relaunch elevated on the same
  ; directory rather than fail. The probe is a real write: it also catches a folder locked by
  ; ransomware protection or an ACL.
  ;
  ; The elevated run re-executes THIS installer ($EXEPATH) after a dialog the user has to accept,
  ; and /NCELEVATED guarantees it never asks twice. Nothing is dropped, downloaded or executed
  ; before the user says yes (docs/code-signing.md, "What the installer must not do").
  ClearErrors
  FileOpen $0 "$INSTDIR\netsucast-write-probe.tmp" w
  ${If} ${Errors}
    ClearErrors
    ${GetOptions} $CMDLINE "/NCELEVATED" $1
    ${IfNot} ${Errors}
      ; Already came back from a UAC prompt and still cannot write: elevation is not the problem.
      IfSilent +2
      MessageBox MB_ICONSTOP|MB_OK "$(NCWriteError)"
      Abort
    ${EndIf}
    IfSilent netsucast_elevate
    MessageBox MB_ICONEXCLAMATION|MB_OKCANCEL "$(NCElevateAsk)" IDOK netsucast_elevate
    Abort
    netsucast_elevate:
    ; /D= must stay last and unquoted (NSIS reads the rest of the line as the directory).
    ${GetParameters} $1
    ExecShell "runas" "$EXEPATH" "$1 /NCELEVATED /D=$INSTDIR"
    Quit
  ${Else}
    FileClose $0
    Delete "$INSTDIR\netsucast-write-probe.tmp"
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ; `yt-dlp -U` (Settings > update yt-dlp) replaces yt-dlp.exe in place and can leave its previous
  ; binary beside it. The uninstaller only deletes the files it installed, so that leftover would
  ; keep tools\mpv — and therefore $INSTDIR — on disk. Plain NSIS file operations only: no script,
  ; no PowerShell. Skipped during an update, where the next install reuses the folder.
  ${If} $UpdateMode <> 1
    ; "Start with Windows" (Settings > Playback) writes this login entry; it must not outlive the
    ; app. Windows adds the StartupApproved value when the entry is toggled in the Task Manager.
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Run" "NetsuCast"
    DeleteRegValue HKCU "Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run" "NetsuCast"
    Delete "$INSTDIR\tools\mpv\yt-dlp.exe.old"
    Delete "$INSTDIR\tools\mpv\yt-dlp.exe.new"
    RMDir "$INSTDIR\tools\mpv\licenses"
    RMDir "$INSTDIR\tools\mpv\mpv"
    RMDir "$INSTDIR\tools\mpv"
    RMDir "$INSTDIR\tools"
    RMDir "$INSTDIR"
  ${EndIf}
!macroend
