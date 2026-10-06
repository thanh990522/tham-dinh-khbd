@echo off
chcp 65001 >nul
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Chua cai Node.js. Hay tai ban LTS tai https://nodejs.org roi chay lai file nay.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Dang cai dat lan dau, vui long cho...
  call npm install --omit=dev
)
echo Dang mo trinh duyet: http://localhost:3000
start "" http://localhost:3000
node src\server.js
pause
