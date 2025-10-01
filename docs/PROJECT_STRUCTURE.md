# Organized Project Structure

```
hunajapannu/
├── backend/              # Node.js API server
├── frontend/             # React web app
├── scripts/              # Development & setup scripts
│   ├── dev/             # Development scripts
│   │   ├── start-dev.bat/.sh    # Platform-specific start
│   │   ├── stop-dev.bat/.sh     # Platform-specific stop  
│   │   ├── start.js     # Cross-platform start script
│   │   └── stop.js      # Cross-platform stop script
│   └── setup/           # Setup scripts
│       ├── setup.bat/.sh        # Platform-specific setup
│       └── setup.js     # Cross-platform setup script
├── docs/                # Documentation
│   ├── DEVELOPMENT.md   # Development guide
│   └── PROJECT_STRUCTURE.md     # This file
├── .vscode/             # VS Code configuration
├── dev.bat/.sh          # Quick dev start (convenience)
├── setup.bat/.sh        # Quick setup (convenience)  
├── package.json         # Workspace & npm scripts
└── README.md           # Main documentation
```

## Script Organization

### **Root Level (Convenience)**
- `setup.bat/.sh` - Quick setup, calls scripts/setup/
- `dev.bat/.sh` - Quick development start

### **Scripts Directory (Organized)**
- `scripts/setup/` - All setup-related scripts
- `scripts/dev/` - All development-related scripts
- Cross-platform `.js` files work everywhere
- Platform-specific `.bat/.sh` files for native feel

### **NPM Scripts (Universal)**
- `npm run setup` - Cross-platform setup
- `npm run start:dev` - Cross-platform development start
- `npm run stop:dev` - Cross-platform stop
- `npm run dev` - Direct development (no setup checks)
