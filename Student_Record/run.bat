@echo off
title Student Records
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it from https://nodejs.org
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Student Records at http://localhost:3000
start "" http://localhost:3000
node server.js
pause
