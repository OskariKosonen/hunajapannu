@echo off
echo 🛑 Stopping Development Environment...

REM Stop Node.js processes
taskkill /f /im node.exe >nul 2>&1

echo ✅ Stopped all development processes
pause