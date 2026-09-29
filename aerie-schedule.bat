@echo off
setlocal enabledelayedexpansion

rem ===========================================================================
rem  Aerie - build, serve and open the daily review app in Microsoft Edge,
rem          plus Windows Task Scheduler registration.
rem
rem  Usage:
rem    aerie-schedule.bat            register the tasks AND open Aerie now
rem    aerie-schedule.bat install    register the scheduled tasks only
rem    aerie-schedule.bat uninstall  remove the scheduled tasks
rem    aerie-schedule.bat status     show the registered tasks
rem    aerie-schedule.bat run        build if needed, serve, open Edge (always)
rem    aerie-schedule.bat serve      build if needed and serve, no Edge
rem    aerie-schedule.bat morning    same as run, but only once per day and
rem                                  only between 07:00 and 09:30
rem
rem  Double-clicking the file is the "just open Aerie" path: it re-registers
rem  the tasks (harmless, they are overwritten) and then builds, brings up the
rem  server window and opens Edge straight away, whatever time it is.
rem
rem  Schedule created by "install":
rem    16:15 daily              -> run
rem    08:00 daily              -> morning
rem    at logon (30s delay)     -> morning
rem  The morning slot is guarded by a once-per-day marker, so whichever of
rem  the 08:00 task / first logon happens first wins and the other is a no-op.
rem ===========================================================================

set "ROOT=%~dp0"
set "SELF=%~f0"
set "PORT=4273"
set "HOSTIP=127.0.0.1"
set "URL=http://%HOSTIP%:%PORT%/"
set "STATE=%LOCALAPPDATA%\Aerie"
set "MARKER=%STATE%\last-morning-run.txt"
set "LOG=%STATE%\aerie-schedule.log"
set "TASKDAY=Aerie\Aerie 4-15 PM"
set "TASKMORN=Aerie\Aerie Morning 8 AM"
set "TASKLOGON=Aerie\Aerie Morning Logon"
set "PF86=%ProgramFiles(x86)%"
set "PF64=%ProgramFiles%"

if not exist "%STATE%" mkdir "%STATE%" >nul 2>&1

rem no argument at all = "I just launched this myself" = install, then open now
set "ALSORUN=0"
set "MODE=%~1"
if "%MODE%"=="" set "ALSORUN=1"
if "%MODE%"=="" set "MODE=install"

if /i "%MODE%"=="install"   goto :install
if /i "%MODE%"=="uninstall" goto :uninstall
if /i "%MODE%"=="status"    goto :status
if /i "%MODE%"=="run"       goto :run
if /i "%MODE%"=="serve"     goto :serve
if /i "%MODE%"=="serveloop" goto :serveloop
if /i "%MODE%"=="morning"   goto :morning

echo Unknown option "%MODE%".
echo Use: install ^| uninstall ^| status ^| run ^| serve ^| morning
exit /b 1


rem --------------------------------------------------------------------------
:install
echo Registering Aerie scheduled tasks for %USERNAME% ...
echo.

schtasks /Create /F /TN "%TASKDAY%" /SC DAILY /ST 16:15 /TR "\"%SELF%\" run" >nul
if errorlevel 1 (echo   FAILED: 4:15 PM task) else (echo   OK: "%TASKDAY%"      daily 16:15)

schtasks /Create /F /TN "%TASKMORN%" /SC DAILY /ST 08:00 /TR "\"%SELF%\" morning" >nul
if errorlevel 1 (echo   FAILED: 8:00 AM task) else (echo   OK: "%TASKMORN%"  daily 08:00)

rem schtasks cannot create an ONLOGON task without elevation, so the logon
rem trigger goes through the scheduler COM API instead - that one is happy to
rem register an at-logon task scoped to the current user.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$u = $env:USERDOMAIN + '\' + $env:USERNAME;" ^
  "$tg = New-ScheduledTaskTrigger -AtLogOn -User $u;" ^
  "$tg.Delay = 'PT30S';" ^
  "$ac = New-ScheduledTaskAction -Execute '%SELF%' -Argument 'morning' -WorkingDirectory '%ROOT%';" ^
  "Register-ScheduledTask -TaskName 'Aerie Morning Logon' -TaskPath '\Aerie\' -Trigger $tg -Action $ac -Force -ErrorAction Stop | Out-Null" >nul
if errorlevel 1 (echo   FAILED: logon task) else (echo   OK: "%TASKLOGON%"   at logon, 07:00-09:30 only)

echo.
echo Target URL : %URL%
echo Log file   : %LOG%
echo.
echo Note: these run only while you are logged on. If the PC is asleep or off
echo at 16:15 / 08:00 the run is skipped - the logon task covers the morning.
echo.
if "%ALSORUN%"=="1" goto :run
echo Open it now with:  "%SELF%" run
exit /b 0


rem --------------------------------------------------------------------------
:uninstall
schtasks /Delete /F /TN "%TASKDAY%"   >nul 2>&1 && echo Removed "%TASKDAY%"
schtasks /Delete /F /TN "%TASKMORN%"  >nul 2>&1 && echo Removed "%TASKMORN%"
schtasks /Delete /F /TN "%TASKLOGON%" >nul 2>&1 && echo Removed "%TASKLOGON%"
exit /b 0


rem --------------------------------------------------------------------------
:status
schtasks /Query /TN "%TASKDAY%"   /FO LIST 2>nul
schtasks /Query /TN "%TASKMORN%"  /FO LIST 2>nul
schtasks /Query /TN "%TASKLOGON%" /FO LIST 2>nul
if not exist "%MARKER%" echo Morning slot has not run yet.
if exist "%MARKER%" set /p LASTRUN=<"%MARKER%"
if exist "%MARKER%" echo Morning slot last ran: !LASTRUN!
exit /b 0


rem --------------------------------------------------------------------------
rem  Morning slot: 07:00-09:30 only, and at most once per calendar day.
:morning
call :now
if %NOWHM% LSS 700 goto :morning_early
if %NOWHM% GTR 930 goto :morning_late
if not exist "%MARKER%" goto :morning_go
set /p LASTRUN=<"%MARKER%"
if "!LASTRUN!"=="%TODAY%" goto :morning_done

:morning_go
>"%MARKER%" echo %TODAY%
call :log "morning: firing at %NOWHM%"
goto :run

:morning_early
call :log "morning: %NOWHM% is before 07:00 - skipped"
exit /b 0

:morning_late
call :log "morning: %NOWHM% is after 09:30 - skipped"
exit /b 0

:morning_done
call :log "morning: already ran today (%TODAY%) - skipped"
exit /b 0


rem --------------------------------------------------------------------------
:run
call :now
call :log "run: starting (%TODAY% %NOWHM%)"

call :ensure_build
call :ensure_server
if "%SERVER_OK%"=="1" goto :run_serve

rem vite.config.ts uses base './', so the built files also work over file://
call :log "run: server unavailable, opening the built files from disk instead"
call :open_edge "file:///%ROOT:\=/%dist/index.html"
goto :run_done

:run_serve
call :open_edge "%URL%"

:run_done
call :log "run: done"
exit /b 0


rem --------------------------------------------------------------------------
rem  Build and bring the server up, but leave the browser alone.
:serve
call :now
call :log "serve: requested (%TODAY% %NOWHM%)"
call :ensure_build
call :ensure_server
exit /b 0


rem --------------------------------------------------------------------------
rem  The body of the visible "Aerie server" window. Keeps vite preview alive
rem  for as long as you are using the app - if it falls over, it comes back.
rem  Close this window (or sign out) to stop serving.
:serveloop
title Aerie server - %URL%
cd /d "%ROOT%"
set "TRIES=0"

:serveloop_start
echo.
echo === Aerie server on %URL% - close this window to stop ===
echo.
call npm run preview -- --host %HOSTIP% --port %PORT% --strictPort
set /a TRIES+=1
if %TRIES% GEQ 10 goto :serveloop_giveup
echo.
echo [aerie] preview server exited - restarting in 3s (restart %TRIES% of 10) ...
timeout /t 3 /nobreak >nul
goto :serveloop_start

:serveloop_giveup
echo.
echo [aerie] preview server exited 10 times in a row - giving up.
echo [aerie] Something is wrong; the output above should say what.
pause
exit /b 1


rem --------------------------------------------------------------------------
rem  Rebuild dist/ when it is missing or older than any source file.
:ensure_build
where npm >nul 2>&1
if errorlevel 1 goto :build_no_npm

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$out = Join-Path '%ROOT%' 'dist\index.html';" ^
  "if (-not (Test-Path $out)) { exit 1 };" ^
  "$built = (Get-Item $out).LastWriteTimeUtc;" ^
  "$srcs = @('src','index.html','package.json','package-lock.json','vite.config.ts','tsconfig.json') | ForEach-Object { Join-Path '%ROOT%' $_ } | Where-Object { Test-Path $_ };" ^
  "$newest = Get-ChildItem -Path $srcs -Recurse -File -ErrorAction SilentlyContinue | Sort-Object LastWriteTimeUtc -Descending | Select-Object -First 1;" ^
  "if ($newest -and $newest.LastWriteTimeUtc -gt $built) { exit 1 };" ^
  "exit 0"
if errorlevel 1 goto :build_stale
call :log "build: dist/ is up to date"
goto :eof

:build_stale
call :log "build: running npm run build"
pushd "%ROOT%"
call npm run build >>"%LOG%" 2>&1
set "BUILDRC=%ERRORLEVEL%"
popd
if not "%BUILDRC%"=="0" goto :build_failed
call :log "build: succeeded"
goto :eof

:build_failed
call :log "build: FAILED with exit code %BUILDRC% - npm output is in the log"
goto :eof

:build_no_npm
call :log "build: npm not found on PATH - using whatever is already in dist/"
goto :eof


rem --------------------------------------------------------------------------
rem  Start `vite preview` on %HOSTIP%:%PORT% unless something already answers.
:ensure_server
set "SERVER_OK=0"
call :probe_port
if "%PORT_UP%"=="1" goto :serve_already

where npm >nul 2>&1
if errorlevel 1 goto :serve_no_npm
if not exist "%ROOT%dist\index.html" goto :serve_no_dist

rem Visible window on purpose: it is the thing keeping the app alive while you
rem use it, so it should be closeable and its output readable. -WindowStyle
rem Normal asks for the window explicitly - plain `start` would inherit the
rem hidden console of whatever launched us (Task Scheduler included) and the
rem server would end up running with no window you could see or close.
call :log "serve: starting vite preview on %HOSTIP%:%PORT%"
set "AERIE_SELF=%SELF%"
set "AERIE_ROOT=%ROOT%"
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$a = '/c call ' + [char]34 + $env:AERIE_SELF + [char]34 + ' serveloop';" ^
  "Start-Process -FilePath 'cmd.exe' -ArgumentList $a -WorkingDirectory $env:AERIE_ROOT -WindowStyle Normal"

rem one PowerShell process polls for up to 45s (spawning one per second is slow)
powershell -NoProfile -Command ^
  "for ($i = 0; $i -lt 45; $i++) {" ^
  "  try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('%HOSTIP%', %PORT%); $c.Close(); exit 0 } catch { Start-Sleep -Seconds 1 }" ^
  "}; exit 1" >nul 2>&1
if errorlevel 1 goto :serve_timeout
set "SERVER_OK=1"
call :log "serve: listening on %URL%"
goto :eof

:serve_already
set "SERVER_OK=1"
call :log "serve: already listening on %HOSTIP%:%PORT%"
goto :eof

:serve_timeout
call :log "serve: timed out waiting for %HOSTIP%:%PORT%"
goto :eof

:serve_no_npm
call :log "serve: npm not found on PATH - cannot start the preview server"
goto :eof

:serve_no_dist
call :log "serve: no dist\index.html to serve"
goto :eof


rem --------------------------------------------------------------------------
:probe_port
set "PORT_UP=0"
powershell -NoProfile -Command ^
  "try { $c = New-Object Net.Sockets.TcpClient; $c.Connect('%HOSTIP%', %PORT%); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>&1
if not errorlevel 1 set "PORT_UP=1"
goto :eof


rem --------------------------------------------------------------------------
:open_edge
set "TARGET=%~1"
call :log "edge: opening %TARGET%"
if exist "%PF86%\Microsoft\Edge\Application\msedge.exe" goto :edge86
if exist "%PF64%\Microsoft\Edge\Application\msedge.exe" goto :edge64
start "" msedge "%TARGET%"
goto :eof

:edge86
start "" "%PF86%\Microsoft\Edge\Application\msedge.exe" "%TARGET%"
goto :eof

:edge64
start "" "%PF64%\Microsoft\Edge\Application\msedge.exe" "%TARGET%"
goto :eof


rem --------------------------------------------------------------------------
rem  Locale-independent date/time: TODAY=yyyyMMdd, NOWHM=Hmm (e.g. 715, 1615)
:now
for /f "usebackq delims=" %%d in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyyMMdd')"`) do set "TODAY=%%d"
for /f "usebackq delims=" %%t in (`powershell -NoProfile -Command "[int]((Get-Date).ToString('HHmm'))"`) do set "NOWHM=%%t"
goto :eof


rem --------------------------------------------------------------------------
:log
for /f "usebackq delims=" %%s in (`powershell -NoProfile -Command "(Get-Date).ToString('yyyy-MM-dd HH:mm:ss')"`) do set "STAMP=%%s"
echo [%STAMP%] %~1
>>"%LOG%" echo [%STAMP%] %~1
goto :eof
