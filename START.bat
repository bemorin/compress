@echo off
setlocal EnableExtensions
cd /d "%~dp0"
title Compress by Ben Morin - Local Server

echo.
echo  ==========================================
echo           COMPRESS BY BEN MORIN
echo  ==========================================
echo.

where.exe node.exe >nul 2>&1
if errorlevel 1 (
  echo  Node.js was not found.
  echo  Install Node.js 22 or newer from https://nodejs.org/
  echo  After installation, double-click START.bat again.
  goto :failure
)

for /f "tokens=1 delims=." %%V in ('node -p "process.versions.node"') do set "NODE_MAJOR=%%V"
if not defined NODE_MAJOR goto :badnode
if %NODE_MAJOR% LSS 22 goto :badnode

where.exe npm.cmd >nul 2>&1
if errorlevel 1 (
  echo  npm was not found. Reinstall Node.js with npm included.
  goto :failure
)

rem Ensure all required dependencies are available before starting.
set "NEED_INSTALL=0"
if not exist "node_modules\next\package.json" set "NEED_INSTALL=1"
if not exist "node_modules\jszip\package.json" set "NEED_INSTALL=1"
if "%NEED_INSTALL%"=="1" (
  echo  [1/3] Installing project dependencies...
  echo  An internet connection is required for the first installation.
  call npm.cmd install --no-audit --no-fund
  if errorlevel 1 (
    echo  Dependency installation failed. Check your internet connection,
    echo  then double-click START.bat again.
    goto :failure
  )
) else (
  echo  [1/3] Dependencies are installed.
)

echo  [2/3] Preparing the license notices...
call node scripts
otices.mjs
if errorlevel 1 goto :failure

rem Never open an unrelated application that already uses this port.
powershell.exe -NoProfile -Command "if (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue) { exit 1 }"
if errorlevel 1 (
  echo.
  echo  Port 3000 is already in use.
  echo  If Compress is already running, open http://localhost:3000
  echo  Otherwise, close the other application and run START.bat again.
  goto :failure
)

echo.
echo  [3/3] Starting Compress. Your browser will open automatically.
echo  Keep this window open while you use the application.
echo  To stop the server, press Ctrl+C or close this window.
echo.
start "" /min powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "%~dp0scripts\open-browser.ps1"
call npm.cmd run dev -- -p 3000
if errorlevel 1 (
  echo  The application server stopped because of an error. See above.
  goto :failure
)
exit /b 0

:badnode
echo  Node.js 22 or newer is required.
echo  Download it from https://nodejs.org/
:failure
echo.
echo  No images were uploaded by the launcher.
set /p "CLOSE=Press Enter to close this window..."
exit /b 1
