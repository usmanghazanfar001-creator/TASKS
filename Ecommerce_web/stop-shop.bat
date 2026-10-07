@echo off
echo Stopping anything using port 3000...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 " ^| findstr LISTENING') do (
  taskkill /f /pid %%a >nul 2>&1
  echo Stopped process %%a
)
echo Done.
pause
