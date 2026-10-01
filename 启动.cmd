@echo off
chcp 65001 >nul
title Grapheon —— 节点与连线
setlocal
set "HERE=%~dp0"

if not exist "%HERE%index.html" (
  echo.
  echo   [X] 这个文件夹里没有 index.html
  echo.
  echo   启动器必须和 index.html 放在**同一个文件夹**里。
  echo   如果你是从压缩包里解出来的，请先把整个文件夹解压出来再双击。
  echo.
  pause
  exit /b 1
)

echo.
echo   ============================================
echo      G R A P H E O N
echo      节点与连线
echo   ============================================
echo.
echo   正在用默认浏览器打开...
echo.
echo   · 这个黑窗口可以关掉，不影响画布
echo   · 要退出就关掉浏览器的那个标签页
echo.

start "" "%HERE%index.html"

rem 给浏览器一点启动时间，然后自己关掉
timeout /t 2 /nobreak >nul
endlocal
