# 🍯 Hunajapannu - Cowrie SSH Honeypot Analytics

A personal analytics dashboard for monitoring SSH honeypot logs from my Cowrie setup. Analyzes attack patterns, geographic distribution, and brute force attempts in real-time.

## Setup

### Prerequisites
- Node.js 20.19.5 or later
- npm 10.8.0 or later

### Quick Setup

```bash
git clone https://github.com/OskariKosonen/hunajapannu.git
cd hunajapannu

# Setup (multiple options)
setup.bat           # Windows convenience
./setup.sh          # Linux/macOS convenience  
npm run setup       # Cross-platform

# Start development (multiple options)
dev.bat             # Windows convenience
./dev.sh            # Linux/macOS convenience
npm run start:dev   # Cross-platform with setup checks
npm run dev         # Direct start (faster)
```

The setup automatically creates `backend/.env` from the template.

## Usage

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001

## Azure Storage Configuration

### VM Uploader Integration
This dashboard works with the VM log uploader script that:
- Uploads daily logs as `cowrie-YYYY-MM-DD.json` 
- Uploads historical logs to `historical/cowrie.json*`
- Uses container `hunajapannulogs`

### 1. Configure Backend
Edit `backend/.env`:
```env
# Use same storage account as VM uploader
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=hunajapannulogs;AccountKey=your_key;EndpointSuffix=core.windows.net

# Or use SAS URL (same as VM script)
# AZURE_SAS_URL=https://hunajapannulogs.blob.core.windows.net/?sp=w&st=...

# Container name (matches VM uploader)
AZURE_CONTAINER_NAME=hunajapannulogs
```

### 2. Test Connection & Structure
```bash
curl http://localhost:3001/api/test-connection
curl http://localhost:3001/api/log-structure
```

### 3. VM Uploader Endpoints
- `/api/daily-logs` - Daily logs from VM uploader
- `/api/historical-logs` - Historical logs uploaded by VM
- `/api/log-structure` - Shows log organization

## Stack

- **Frontend**: React + TypeScript + Tailwind CSS
- **Backend**: Node.js + Express
- **Storage**: Azure Blob Storage
- **Analytics**: Real-time log processing with geographic mapping

## Features

- Real-time processing of Cowrie honeypot logs
- Geographic attack visualization
- Brute force detection and analytics
- Time-based filtering and analysis
- Memory-efficient handling of large log files

## API

Main endpoints:
- `GET /api/analytics?timeRange=7d` - Attack analytics
- `GET /api/logs?limit=100` - Recent log entries  
- `GET /health` - Health check

## License

MIT

## 📈 Features

### Analytics Dashboard
- **Real-time Processing**: Handles 10GB+ datasets efficiently
- **Geographic Intelligence**: Attack source mapping by country
- **Brute Force Detection**: Identifies and tracks attack patterns
- **Login Analytics**: Success/failure rates and credential analysis
- **Time-based Filtering**: 1h, 24h, 7d, 30d, all-time views

### API Endpoints
- `GET /api/analytics?timeRange=7d` - Comprehensive attack analytics
- `GET /api/logs?limit=100&timeRange=7d` - Recent log entries
- `GET /api/log-files` - Available log files
- `GET /api/validate-logs` - Log format validation
- `GET /health` - Service health check

### Sample Analytics Data
```json
{
  "totalEvents": 500,
  "topSourceIPs": [
    {"ip": "196.251.88.103", "count": 440, "location": "ZA"},
    {"ip": "64.227.122.67", "count": 40, "location": "DE"}
  ],
  "geographicDistribution": [
    {"country": "ZA", "count": 440},
    {"country": "DE", "count": 40}
  ],
  "loginAttempts": {
    "totalAttempts": 80,
    "failedLogins": 80,
    "successRate": "0.00"
  },
  "attackPatterns": {
    "bruteForce": [
      {"ip": "196.251.88.103", "failedAttempts": 80}
    ]
  }
}
```

## 🛡️ Security Features

- **Rate Limiting**: 100 requests per 15 minutes per IP
- **CORS Protection**: Configured for localhost development
- **Memory Limits**: Safe processing with 50MB file limits
- **Timeout Handling**: 30s list operations, 60s downloads
- **Error Handling**: Comprehensive error logging and recovery

## 🚀 Deployment

### Azure Deployment (Recommended for cheap hosting)
1. **Frontend**: Azure Static Web Apps (free tier)
2. **Backend**: Azure Container Instances or App Service (basic tier)
3. **Storage**: Already using Azure Blob Storage

### Build for Production
```bash
make build
# or
npm run build
```

## 🐛 Troubleshooting

### Port Already in Use
```bash
# Kill processes on specific ports
sudo lsof -ti:3000 | xargs kill -9  # Frontend
sudo lsof -ti:3001 | xargs kill -9  # Backend

# Or use the stop script
./stop-dev.sh
```

### Backend Not Connecting to Azure
1. Check `backend/.env` file exists
2. Verify Azure Blob Storage SAS URL is valid
3. Ensure SAS URL has read permissions
4. Check network connectivity to Azure

### Frontend CORS Issues
- Backend CORS is configured for `http://localhost:3000`
- Ensure both servers are running on expected ports

### Memory Issues with Large Datasets
- Backend has memory limits: `NODE_OPTIONS="--max-old-space-size=1024"`
- Large files (>10MB) are automatically skipped
- Streaming approach prevents memory overload

## 📁 Project Structure
```
hunajapannu/
├── backend/                 # Node.js API server
│   ├── src/
│   │   ├── routes/         # API routes
│   │   ├── services/       # Azure & analysis services
│   │   └── utils/          # Utilities
│   └── package.json
├── frontend/               # React dashboard
│   ├── src/
│   │   ├── components/     # React components
│   │   └── ...
│   └── package.json
├── start-dev.sh           # Development startup script
├── stop-dev.sh            # Development stop script
├── Makefile               # Make commands
└── package.json           # Root workspace config
```

## 🐳 Docker Deployment

### Quick Start with Docker Compose
```bash
# Copy environment configuration
cp backend/.env.example backend/.env
# Edit backend/.env with your Azure settings

# Build and start containers
docker-compose up -d

# View logs
docker-compose logs -f

# Stop containers
docker-compose down
```

### Individual Docker Images
```bash
# Build backend
docker build -t cowrie-analytics-backend ./backend

# Build frontend  
docker build -t cowrie-analytics-frontend ./frontend

# Run backend
docker run -p 3001:3001 --env-file backend/.env cowrie-analytics-backend

# Run frontend
docker run -p 80:80 cowrie-analytics-frontend
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Quick Contributing Steps
1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes and add tests
4. Run `make test` to verify everything works
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

### Development Resources
- [Contributing Guide](CONTRIBUTING.md) - Detailed contribution instructions
- [Security Policy](SECURITY.md) - How to report security vulnerabilities
- [Issues](https://github.com/OskariKosonen/hunajapannu/issues) - Bug reports and feature requests

## 📄 License

This project is licensed under the MIT License.

---

🍯 **Happy Honeypot Monitoring!** 🛡️
