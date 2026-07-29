@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo No se encontro Node.js. Instala Node.js 22 o superior y vuelve a intentar.
  pause
  exit /b 1
)
start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"
node server.js
pause
