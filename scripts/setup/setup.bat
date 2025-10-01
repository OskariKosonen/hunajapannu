@echo off
echo 🔧 Setting up Development Environment...

REM Install all dependencies
echo 📦 Installing dependencies...
npm run install:all

REM Create .env file if it doesn't exist  
if not exist "backend\.env" (
    copy "backend\.env.example" "backend\.env" >nul
    echo ⚠️  Please edit backend\.env with your Azure settings
)

echo 🎉 Setup complete! Run start-dev.bat to start development
pause