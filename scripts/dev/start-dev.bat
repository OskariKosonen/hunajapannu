@echo off
echo 🚀 Starting Development Environment...

REM Check if .env exists, if not copy from example
if not exist "backend\.env" (
    echo ⚠️  Creating backend\.env from template...
    copy "backend\.env.example" "backend\.env" >nul
    echo    Please edit backend\.env with your Azure settings
)

echo 🔧 Starting servers on http://localhost:3000 and http://localhost:3001
npm run dev