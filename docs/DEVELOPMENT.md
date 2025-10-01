# Development Quick Reference

## Setup Options
```bash
setup.bat           # Windows
./setup.sh          # Linux/macOS
npm run setup       # Any platform
```

## Development Options
```bash
dev.bat             # Windows (quick)
./dev.sh            # Linux/macOS (quick)  
npm run start:dev   # Any platform (with setup)
npm run dev         # Any platform (direct)
```

## Stop Development
```bash
npm run stop:dev    # Any platform
Ctrl+C              # In terminal
```

## URLs
- Frontend: http://localhost:3000
- Backend: http://localhost:3001

## API Endpoints (VM Integration)
- `/api/test-connection` - Test Azure connection
- `/api/log-structure` - View VM uploader log structure  
- `/api/daily-logs` - Daily logs (cowrie-YYYY-MM-DD.json)
- `/api/historical-logs` - Historical logs (historical/*)
- `/api/analytics` - Main analytics dashboard data

## VS Code Tasks
- `Ctrl+Shift+P` → "Tasks: Run Task"
- Choose: Setup Project, Start Development, Stop Development, Build

## VS Code Integration

### Recommended Extensions
The project includes VS Code extension recommendations. Install them when prompted for the best development experience:

- TypeScript and JavaScript Language Features
- Tailwind CSS IntelliSense
- Prettier - Code formatter
- PowerShell (Windows)
- ESLint

### Available Tasks
Use `Ctrl+Shift+P` → "Tasks: Run Task" to access:

- **Install All Dependencies** - Install dependencies for all projects
- **Start Development** - Start both frontend and backend
- **Start Frontend Only** - Start frontend development server
- **Start Backend Only** - Start backend development server  
- **Build All** - Build both frontend and backend

### Debug Configuration
Use `F5` to start debugging:

- **Debug Backend** - Debug the Node.js backend
- **Debug Frontend** - Debug the React frontend
- **Debug Full Stack** - Debug both frontend and backend

## Environment Configuration

### Backend Environment Variables

Copy `backend/.env.example` to `backend/.env` and configure:

```env
# Azure Storage Account Configuration
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=your_account;AccountKey=your_key;EndpointSuffix=core.windows.net

# Container name where Cowrie logs are stored
AZURE_CONTAINER_NAME=cowrie-logs

# Optional: Specific path prefix within the container
AZURE_LOG_PREFIX=cowrie/logs/

# Application Configuration
NODE_ENV=development
PORT=3001

# Frontend URL for CORS
FRONTEND_URL=http://localhost:3000

# Optional: Enable detailed logging
DEBUG_LOGS=false
```

## Troubleshooting

### Port Conflicts

If ports 3000 or 3001 are in use:

**Windows:**
```powershell
# Check what's using the ports
netstat -ano | findstr :3000
netstat -ano | findstr :3001

# Kill processes (replace PID with actual process ID)
taskkill /PID <PID> /F

# Or use the force flag
.\start-dev.ps1 -Force
```

**Linux/macOS:**
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :3001

# Kill processes
sudo lsof -ti:3000 | xargs kill -9
sudo lsof -ti:3001 | xargs kill -9
```

### Node.js Version Issues

Ensure you're using Node.js 20.19.5 or later:

```bash
node --version
npm --version
```

If you need to update Node.js:
- **Windows**: Download from [nodejs.org](https://nodejs.org/) or use [nvm-windows](https://github.com/coreybutler/nvm-windows)
- **Linux/macOS**: Use [nvm](https://github.com/nvm-sh/nvm)

### Dependency Issues

Clean and reinstall dependencies:

```bash
# Clean (cross-platform)
npm run clean

# Reinstall
npm run install:all
```

### PowerShell Execution Policy (Windows)

If you get execution policy errors:

```powershell
# Check current policy
Get-ExecutionPolicy

# Set policy for current user (safer than system-wide)
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

# Or bypass for single session
PowerShell -ExecutionPolicy Bypass -File .\start-dev.ps1
```

## Project Structure

```
hunajapannu/
├── backend/           # Node.js Express API
├── frontend/          # React TypeScript app
├── .vscode/          # VS Code configuration
├── start-dev.sh      # Linux/macOS start script
├── start-dev.bat     # Windows batch start script  
├── start-dev.ps1     # Windows PowerShell start script
├── stop-dev.sh       # Linux/macOS stop script
├── stop-dev.bat      # Windows batch stop script
├── stop-dev.ps1      # Windows PowerShell stop script
├── setup.sh          # Linux/macOS setup script
├── setup.bat         # Windows setup script
└── package.json      # Root package configuration
```