@echo off
rem tanku Anime launcher (Windows). Double-click to start server + web and open the browser.
rem Terminal users can keep running `npm start`.
rem Dependency lookup: .tools\ next to this file first (Node 22 + FFmpeg placed by scripts\install.ps1),
rem then the normal PATH. Nothing here depends on the user's shell profile.

title tanku Anime
chcp 65001 >nul
cd /d "%~dp0"

set "PATH=%CD%\.tools\node;%CD%\.tools\ffmpeg;%PATH%"
set "TANKU_OPEN_BROWSER=1"

where node >nul 2>nul
if errorlevel 1 goto :nonode

set "NODE_MAJOR="
for /f "usebackq delims=" %%v in (`node -p "process.versions.node.split('.')[0]"`) do set "NODE_MAJOR=%%v"
if not "%NODE_MAJOR%"=="22" goto :wrongnode

call npm start
set "STATUS=%ERRORLEVEL%"
echo.
echo [tanku Anime] stopped (exit code %STATUS%).
pause
exit /b %STATUS%

:nonode
echo [tanku Anime] Node.js was not found.
echo Run the one-line install command from README.md first, or install Node.js 22 from https://nodejs.org/en/download
pause
exit /b 1

:wrongnode
echo [tanku Anime] Node.js 22 is required, but a different version was found first on PATH.
echo Run the one-line install command from README.md (it keeps a private Node 22 under .tools\), or install Node.js 22.
pause
exit /b 1
