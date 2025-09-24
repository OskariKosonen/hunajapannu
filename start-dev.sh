#!/bin/bash

# Cowrie Analytics Development Startup Script
# This script starts both backend and frontend for local development

echo "🚀 Starting Cowrie Analytics Development Environment..."
echo ""

# Check if we're in the right directory
if [[ ! -f "package.json" ]]; then
    echo "❌ Error: Please run this script from the project root directory"
    exit 1
fi

# Function to check if a port is in use
check_port() {
    local port=$1
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null 2>&1; then
        return 0  # Port is in use
    else
        return 1  # Port is available
    fi
}

# Check if backend port (3001) is already in use
if check_port 3001; then
    echo "⚠️  Port 3001 is already in use. Checking if it's our backend..."
    if curl -s http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ Backend is already running on port 3001"
        BACKEND_RUNNING=true
    else
        echo "❌ Port 3001 is occupied by another process. Please stop it first:"
        echo "   sudo lsof -ti:3001 | xargs kill -9"
        exit 1
    fi
else
    BACKEND_RUNNING=false
fi

# Check if frontend port (3000) is already in use
if check_port 3000; then
    echo "⚠️  Port 3000 is already in use. Checking if it's our frontend..."
    if curl -s http://localhost:3000 >/dev/null 2>&1; then
        echo "✅ Frontend is already running on port 3000"
        FRONTEND_RUNNING=true
    else
        echo "❌ Port 3000 is occupied by another process. Please stop it first:"
        echo "   sudo lsof -ti:3000 | xargs kill -9"
        exit 1
    fi
else
    FRONTEND_RUNNING=false
fi

# If both are already running, no need to start
if [[ "$BACKEND_RUNNING" == true && "$FRONTEND_RUNNING" == true ]]; then
    echo ""
    echo "🎉 Both services are already running!"
    echo "📊 Frontend Dashboard: http://localhost:3000"
    echo "🔧 Backend API: http://localhost:3001"
    echo ""
    echo "To stop the services:"
    echo "   ./stop-dev.sh"
    exit 0
fi

# Install dependencies if node_modules don't exist
if [[ ! -d "node_modules" ]] || [[ ! -d "frontend/node_modules" ]] || [[ ! -d "backend/node_modules" ]]; then
    echo "📦 Installing dependencies..."
    npm run install:all
    echo ""
fi

# Check if .env file exists in backend
if [[ ! -f "backend/.env" ]]; then
    echo "⚠️  Warning: backend/.env file not found"
    echo "   Make sure to configure your Azure Blob Storage SAS URL"
    echo "   Copy backend/.env.example to backend/.env and fill in your values"
    echo ""
fi

echo "🔧 Starting development servers..."
echo ""
echo "Backend will start on: http://localhost:3001"
echo "Frontend will start on: http://localhost:3000"
echo ""
echo "Press Ctrl+C to stop both servers"
echo ""

# Start both services using concurrently
npm run dev
