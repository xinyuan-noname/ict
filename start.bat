@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [start] Node.js not found. Install Node 20+ first.
  pause
  exit /b 1
)
node scripts\dev.mjs %*
set EXITCODE=%ERRORLEVEL%
if not "%EXITCODE%"=="0" (
  echo.
  echo [start] dev launcher exited with code %EXITCODE%
  pause
)
endlocal