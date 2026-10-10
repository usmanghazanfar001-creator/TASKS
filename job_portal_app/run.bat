@echo off
title Job Portal
cd /d "%~dp0"

where node >NUL 2>&1
if errorlevel 1 (
  echo Node.js is not installed. Download it from https://nodejs.org and try again.
  pause
  exit /b 1
)

if not exist node_modules\better-sqlite3\build\Release (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

start "" http://localhost:3000
node server.js
pause
