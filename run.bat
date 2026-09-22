@echo off
setlocal EnableExtensions EnableDelayedExpansion

rem NetsuCast development launcher.
rem Double-click for the interactive menu, or use:
rem   run.bat --launch|--tools|--extension|--switch|--pull|--push|--status

set "ROOT=%~dp0"
set "LOCK_STAMP=%ROOT%node_modules\.netsucast-pnpm-lock.hash"
set "MPV_EXE=%ROOT%tools\mpv\mpv.exe"
set "YTDLP_EXE=%ROOT%tools\mpv\yt-dlp.exe"
rem Must match `server.port` in vite.config.ts and `devUrl` in src-tauri\tauri.conf.json.
set "VITE_PORT=1420"

cd /d "%ROOT%" || goto :fatal_root
title NetsuCast - Development launcher

if /i "%~1"=="--launch" goto :launch
if /i "%~1"=="--tools" goto :tools_cli
if /i "%~1"=="--extension" goto :extension_cli
if /i "%~1"=="--switch" goto :switch_cli
if /i "%~1"=="--pull" goto :pull_cli
if /i "%~1"=="--push" goto :push_cli
if /i "%~1"=="--status" goto :status_cli
if not "%~1"=="" (
  echo [ERROR] Unknown option: %~1
  echo Use: run.bat [--launch^|--tools^|--extension^|--switch^|--pull^|--push^|--status]
  exit /b 2
)

call :require_command git Git
if errorlevel 1 goto :failed

:menu
cls
echo ============================================================
echo   NetsuCast - Dev launcher
echo ============================================================
call :print_git_summary
call :print_tools_summary
echo.
echo   [1] Start NetsuCast
echo   [2] Install / update player tools ^(mpv + yt-dlp^)
echo   [3] Browser extension ^(manual steps - easier: button in the app^)
echo   [4] Switch branch
echo   [5] Refresh branch list ^(fetch^)
echo   [6] Update current branch ^(safe pull^)
echo   [7] Send commits to GitHub ^(push^)
echo   [8] Show Git status
echo   [0] Exit
echo.
set "MENU_CHOICE="
set /p "MENU_CHOICE=Choose a number: "
if "%MENU_CHOICE%"=="1" goto :launch
if "%MENU_CHOICE%"=="2" goto :menu_tools
if "%MENU_CHOICE%"=="3" goto :menu_extension
if "%MENU_CHOICE%"=="4" goto :menu_switch
if "%MENU_CHOICE%"=="5" goto :menu_fetch
if "%MENU_CHOICE%"=="6" goto :menu_pull
if "%MENU_CHOICE%"=="7" goto :menu_push
if "%MENU_CHOICE%"=="8" goto :menu_status
if "%MENU_CHOICE%"=="0" exit /b 0
goto :menu

:menu_tools
call :install_tools
goto :menu_pause

:menu_extension
call :show_extension
goto :menu_pause

:menu_switch
call :switch_branch
goto :menu_pause

:menu_fetch
call :fetch_refs
goto :menu_pause

:menu_pull
call :pull_branch
goto :menu_pause

:menu_push
call :push_branch
goto :menu_pause

:menu_status
git status
goto :menu_pause

:menu_pause
echo.
pause
goto :menu

:tools_cli
call :install_tools
exit /b %ERRORLEVEL%

:extension_cli
call :show_extension
exit /b 0

:switch_cli
call :require_command git Git
if errorlevel 1 goto :failed
call :switch_branch
exit /b %ERRORLEVEL%

:pull_cli
call :require_command git Git
if errorlevel 1 goto :failed
call :pull_branch
exit /b %ERRORLEVEL%

:push_cli
call :require_command git Git
if errorlevel 1 goto :failed
call :push_branch
exit /b %ERRORLEVEL%

:status_cli
call :require_command git Git
if errorlevel 1 goto :failed
git status --short --branch
exit /b %ERRORLEVEL%

:launch
call :require_command node Node.js
if errorlevel 1 goto :failed
call :require_command pnpm pnpm
if errorlevel 1 goto :failed
rem Tauri needs the Rust toolchain. Without this check, `pnpm tauri dev` fails inside its own
rem window while this one exits successfully: the app never opens and nothing says why.
call :require_command cargo Rust
if errorlevel 1 goto :failed

rem The app opens without mpv, but only to say the player is missing: install it first.
if not exist "%MPV_EXE%" (
  echo [INFO] mpv is not installed yet: downloading the player tools first.
  call :install_tools
  if errorlevel 1 goto :failed
)

call :sync_dependencies
if errorlevel 1 goto :failed

rem `pnpm tauri dev` starts Vite by itself ^(beforeDevCommand^). Vite uses a strict port, so a
rem leftover server on it makes the whole start fail: deal with it here, where it can be explained.
call :find_listener %VITE_PORT%
if defined LISTENER_PID (
  echo [WARNING] Port %VITE_PORT% is already used ^(PID !LISTENER_PID!^). Tauri needs it for Vite.
  call :show_process !LISTENER_PID!
  set "KILL_VITE="
  set /p "KILL_VITE=Stop that process? (y/N): "
  if /i not "!KILL_VITE!"=="y" (
    echo [ERROR] Free port %VITE_PORT%, then run this file again.
    goto :failed
  )
  taskkill /PID !LISTENER_PID! /T /F >nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Could not stop PID !LISTENER_PID!.
    goto :failed
  )
  echo [OK] Port %VITE_PORT% freed.
)

echo [INFO] Starting NetsuCast ^(Vite + Tauri^)...
echo        The first start compiles the Rust side: allow a few minutes.
start "NetsuCast - Tauri" cmd /k pnpm tauri dev
exit /b 0

rem ---------------------------------------------------------------------------
rem Player tools and extension
rem ---------------------------------------------------------------------------

:install_tools
powershell -NoProfile -ExecutionPolicy Bypass -File "%ROOT%scripts\install-tools.ps1"
if errorlevel 1 (
  echo [ERROR] Tool installation failed. Read the message above.
  exit /b 1
)
exit /b 0

:print_tools_summary
set "TOOLS_LABEL=mpv missing"
if exist "%MPV_EXE%" set "TOOLS_LABEL=mpv OK"
if exist "%YTDLP_EXE%" (
  set "TOOLS_LABEL=!TOOLS_LABEL!, yt-dlp OK"
) else (
  set "TOOLS_LABEL=!TOOLS_LABEL!, yt-dlp missing"
)
echo   Player tools: !TOOLS_LABEL!
exit /b 0

:show_extension
echo.
echo To load the NetsuCast extension in Chrome ^(once^):
echo   1. Open chrome://extensions
echo   2. Turn on "Developer mode" ^(top right^)
echo   3. Click "Load unpacked" and pick the folder that just opened:
echo        %ROOT%extension
echo   4. Pin the NetsuCast icon. After a code change, click the reload arrow on its card.
start "" explorer "%ROOT%extension"
exit /b 0

rem ---------------------------------------------------------------------------
rem Git
rem ---------------------------------------------------------------------------

:switch_branch
call :fetch_refs
if errorlevel 1 (
  echo [WARNING] Fetch failed. Only known local branches will be shown.
)

set "CURRENT_BRANCH="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%B"
echo.
echo Current branch: !CURRENT_BRANCH!
echo.

set /a BRANCH_COUNT=0
for /f "delims=" %%B in ('git for-each-ref --format^="%%(refname:short)" refs/heads refs/remotes/origin 2^>nul') do (
  if /i not "%%B"=="origin" if /i not "%%B"=="origin/HEAD" (
    set /a BRANCH_COUNT+=1
    set "BRANCH_!BRANCH_COUNT!=%%B"
    if /i "%%B"=="!CURRENT_BRANCH!" (
      echo   [!BRANCH_COUNT!] %%B ^(active^)
    ) else (
      echo   [!BRANCH_COUNT!] %%B
    )
  )
)
if !BRANCH_COUNT! EQU 0 (
  echo [ERROR] No branch found.
  exit /b 1
)

echo   [0] Cancel
echo.
set "BRANCH_CHOICE="
set /p "BRANCH_CHOICE=Choose a number: "
if "!BRANCH_CHOICE!"=="0" exit /b 0
echo(!BRANCH_CHOICE!| findstr /r /x "[0-9][0-9]*" >nul || (
  echo [ERROR] Invalid choice.
  exit /b 1
)
if !BRANCH_CHOICE! LSS 1 (
  echo [ERROR] Invalid choice.
  exit /b 1
)
if !BRANCH_CHOICE! GTR !BRANCH_COUNT! (
  echo [ERROR] Invalid choice.
  exit /b 1
)
call set "TARGET_BRANCH=%%BRANCH_!BRANCH_CHOICE!%%"
if /i "!TARGET_BRANCH!"=="!CURRENT_BRANCH!" (
  echo [INFO] This branch is already active.
  exit /b 0
)

call :has_worktree_changes
if not errorlevel 1 (
  echo.
  echo [WARNING] You have files that are not committed.
  echo Git will keep safe changes. It will stop if there is a conflict.
  echo This launcher will NOT create a stash automatically.
  set "CONFIRM_SWITCH="
  set /p "CONFIRM_SWITCH=Continue? (y/N): "
  if /i not "!CONFIRM_SWITCH!"=="y" exit /b 1
)

if /i "!TARGET_BRANCH:~0,7!"=="origin/" (
  set "LOCAL_TARGET=!TARGET_BRANCH:~7!"
  git show-ref --verify --quiet "refs/heads/!LOCAL_TARGET!"
  if errorlevel 1 (
    git switch --track "!TARGET_BRANCH!"
  ) else (
    git switch "!LOCAL_TARGET!"
  )
) else (
  git switch "!TARGET_BRANCH!"
)
if errorlevel 1 (
  echo [ERROR] Git could not switch branch. Your files were NOT hidden in a stash.
  exit /b 1
)
echo [OK] Current branch:
git branch --show-current
exit /b 0

:fetch_refs
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No "origin" remote yet. Add the GitHub repository first:
  echo         git remote add origin https://github.com/^<user^>/NetsuCast.git
  exit /b 1
)
echo [INFO] Refreshing Git branches...
git fetch origin --prune
if errorlevel 1 (
  echo [ERROR] Fetch failed. Check your internet and GitHub access.
  exit /b 1
)
echo [OK] Branch list refreshed.
exit /b 0

:pull_branch
call :current_branch_or_fail
if errorlevel 1 exit /b 1
call :has_upstream
if errorlevel 1 (
  echo [ERROR] Branch !CURRENT_BRANCH! is not linked to GitHub yet.
  echo Use the push option first.
  exit /b 1
)
call :has_worktree_changes
if not errorlevel 1 (
  echo [WARNING] You have local changes. Git may refuse the update.
  set "CONFIRM_PULL="
  set /p "CONFIRM_PULL=Continue with a safe pull? (y/N): "
  if /i not "!CONFIRM_PULL!"=="y" exit /b 1
)
git pull --ff-only
if errorlevel 1 (
  echo [ERROR] Update stopped. No automatic merge was created.
  exit /b 1
)
echo [OK] Branch updated.
exit /b 0

:push_branch
call :current_branch_or_fail
if errorlevel 1 exit /b 1
git remote get-url origin >nul 2>&1
if errorlevel 1 (
  echo [ERROR] No "origin" remote yet. Add the GitHub repository first:
  echo         git remote add origin https://github.com/^<user^>/NetsuCast.git
  exit /b 1
)
call :has_worktree_changes
if not errorlevel 1 (
  echo [WARNING] Files that are not committed will NOT be sent.
  git status --short
  echo.
)
call :has_upstream
if errorlevel 1 (
  set "CONFIRM_PUBLISH="
  set /p "CONFIRM_PUBLISH=Create branch !CURRENT_BRANCH! on GitHub? (y/N): "
  if /i not "!CONFIRM_PUBLISH!"=="y" exit /b 1
  git push --set-upstream origin "!CURRENT_BRANCH!"
) else (
  git push
)
if errorlevel 1 (
  echo [ERROR] Push failed. Read the Git message above.
  exit /b 1
)
echo [OK] Commits sent to GitHub.
exit /b 0

rem ---------------------------------------------------------------------------
rem Helpers
rem ---------------------------------------------------------------------------

:sync_dependencies
set "LOCK_HASH="
if exist "%ROOT%pnpm-lock.yaml" (
  for /f "delims=" %%H in ('git hash-object "%ROOT%pnpm-lock.yaml" 2^>nul') do set "LOCK_HASH=%%H"
)
set "SAVED_LOCK_HASH="
if exist "%LOCK_STAMP%" set /p "SAVED_LOCK_HASH="<"%LOCK_STAMP%"

if not exist "%ROOT%node_modules" goto :install_dependencies
if not defined LOCK_HASH goto :dependencies_ready
if /i "%LOCK_HASH%"=="%SAVED_LOCK_HASH%" goto :dependencies_ready

:install_dependencies
echo [INFO] Updating pnpm packages for this branch...
call pnpm install
if errorlevel 1 (
  echo [ERROR] pnpm install failed.
  exit /b 1
)
if defined LOCK_HASH >"%LOCK_STAMP%" echo %LOCK_HASH%

:dependencies_ready
exit /b 0

:print_git_summary
set "CURRENT_BRANCH=detached HEAD"
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%B"
set "SHORT_HEAD=unknown"
for /f "delims=" %%H in ('git rev-parse --short HEAD 2^>nul') do set "SHORT_HEAD=%%H"
set "WORKTREE_LABEL=clean"
call :has_worktree_changes
if not errorlevel 1 set "WORKTREE_LABEL=changed files"
echo   Branch: !CURRENT_BRANCH!  -  Commit: !SHORT_HEAD!  -  Files: !WORKTREE_LABEL!
exit /b 0

:current_branch_or_fail
set "CURRENT_BRANCH="
for /f "delims=" %%B in ('git branch --show-current 2^>nul') do set "CURRENT_BRANCH=%%B"
if not defined CURRENT_BRANCH (
  echo [ERROR] No active branch. Git is in detached HEAD mode.
  exit /b 1
)
exit /b 0

:has_upstream
git rev-parse --abbrev-ref --symbolic-full-name "@{upstream}" >nul 2>&1
exit /b %ERRORLEVEL%

:has_worktree_changes
git diff --quiet --ignore-submodules -- 2>nul || exit /b 0
git diff --cached --quiet --ignore-submodules -- 2>nul || exit /b 0
for /f "delims=" %%F in ('git ls-files --others --exclude-standard 2^>nul') do exit /b 0
exit /b 1

:find_listener
set "LISTENER_PID="
for /f "tokens=5" %%P in ('netstat -ano -p tcp 2^>nul ^| findstr /r /c:":%~1 .*LISTENING"') do (
  if not defined LISTENER_PID set "LISTENER_PID=%%P"
)
exit /b 0

:show_process
powershell -NoProfile -Command "$p=Get-CimInstance Win32_Process -Filter 'ProcessId=%~1' -ErrorAction SilentlyContinue; if($p){Write-Host ('[INFO] Process: ' + $p.Name + '  ' + $p.CommandLine)}"
exit /b 0

:require_command
where "%~1" >nul 2>&1
if errorlevel 1 (
  echo [ERROR] %~2 was not found in PATH.
  exit /b 1
)
exit /b 0

:fatal_root
echo [ERROR] Could not open the NetsuCast folder.

:failed
echo.
echo The launcher stopped. It did not hide or remove your Git changes.
if "%~1"=="" pause
exit /b 1
