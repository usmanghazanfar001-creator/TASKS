@echo off
cd /d "%~dp0"
title Ecommerce Shop

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo.
    echo npm install failed. See the error above.
    pause
    exit /b 1
  )
)

rem Free port 3000 if an old copy is still running
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

start "" http://localhost:3000
call npm start

pause
