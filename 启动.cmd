@echo off
title Grapheon
setlocal
set "HERE=%~dp0"

if not exist "%HERE%index.html" (
  echo.
  echo   [X] No index.html in this folder.
  echo.
  echo   This launcher must sit in the SAME folder as index.html.
  echo   If you opened it from inside the .zip, extract the folder first.
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================
echo      G R A P H E O N
echo      nodes  .  connections
echo   ============================================
echo.
echo   Opening in your default browser ...
echo.
echo   - You can close this window; the canvas stays open.
echo   - To quit, just close the browser tab.
echo.

start "" "%HERE%index.html"

rem give the browser a moment. (ping, not timeout -- timeout
rem errors out when stdin is redirected.)
ping -n 3 127.0.0.1 >nul
endlocal
