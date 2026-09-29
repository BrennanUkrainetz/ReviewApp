@echo off
setlocal enabledelayedexpansion

rem ===========================================================================
rem  Aerie - remove everything aerie-schedule.bat registered.
rem
rem  Usage:
rem    aerie-unschedule.bat          remove the three scheduled tasks
rem    aerie-unschedule.bat purge    also delete the state folder (marker + log)
rem
rem  Standalone on purpose: it still works if aerie-schedule.bat has been
rem  moved or deleted, which is exactly when you need it.
rem ===========================================================================

set "STATE=%LOCALAPPDATA%\Aerie"
set "MARKER=%STATE%\last-morning-run.txt"
set "LOG=%STATE%\aerie-schedule.log"
set "TASKDAY=Aerie\Aerie 4-15 PM"
set "TASKMORN=Aerie\Aerie Morning 8 AM"
set "TASKLOGON=Aerie\Aerie Morning Logon"

set "PURGE=0"
if /i "%~1"=="purge" set "PURGE=1"

echo Removing Aerie scheduled tasks for %USERNAME% ...
echo.

call :drop "%TASKDAY%"
call :drop "%TASKMORN%"
call :drop "%TASKLOGON%"

rem the Aerie task folder is left behind by schtasks; drop it if it is empty
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "try { $s = New-Object -ComObject Schedule.Service; $s.Connect();" ^
  "  $root = $s.GetFolder('\'); $f = $s.GetFolder('\Aerie');" ^
  "  if ($f.GetTasks(1).Count -eq 0 -and $f.GetFolders(0).Count -eq 0) { $root.DeleteFolder('Aerie', 0) } } catch { }" >nul 2>&1

echo.
if "%PURGE%"=="0" goto :kept
if exist "%MARKER%" del /f /q "%MARKER%" >nul 2>&1
if exist "%LOG%"    del /f /q "%LOG%"    >nul 2>&1
rd "%STATE%" >nul 2>&1
echo   State folder purged: %STATE%
goto :finish

:kept
echo   Left in place: %STATE%
echo   (run "%~nx0 purge" to delete the run marker and log too)

:finish
echo.
echo Done. Nothing will launch Edge on a schedule any more.
echo A `vite preview` server started by an earlier run may still be listening
echo on 127.0.0.1:4273 - it goes away at your next sign-out or reboot.
echo.
echo Re-register at any time with: aerie-schedule.bat install
exit /b 0


rem --------------------------------------------------------------------------
rem  Delete one task. schtasks handles the two daily tasks; the at-logon task
rem  was registered through the scheduler COM API, so fall back to that.
:drop
set "TN=%~1"
schtasks /Query /TN "%TN%" >nul 2>&1
if errorlevel 1 goto :drop_absent

schtasks /Delete /F /TN "%TN%" >nul 2>&1
if not errorlevel 1 goto :drop_ok

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$n = Split-Path -Leaf '%TN%'; $p = '\' + (Split-Path -Parent '%TN%') + '\';" ^
  "Unregister-ScheduledTask -TaskName $n -TaskPath $p -Confirm:$false -ErrorAction Stop" >nul 2>&1
if errorlevel 1 goto :drop_failed

:drop_ok
echo   Removed: "%TN%"
goto :eof

:drop_absent
echo   Not registered: "%TN%"
goto :eof

:drop_failed
echo   FAILED to remove: "%TN%"
goto :eof
