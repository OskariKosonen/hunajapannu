#!/bin/bash

# Cowrie Analytics Development Stop Script
# This script stops both backend and frontend development servers

echo "🛑 Stopping Cowrie Analytics Development Environment..."
echo ""

# Function to kill processes on a specific port
kill_port() {
    local port=$1
    local service_name=$2
    
    echo "Stopping $service_name on port $port..."
    
    # Find processes using the port
    pids=$(lsof -ti:$port 2>/dev/null)
    
    if [[ -n "$pids" ]]; then
        echo "Found processes on port $port: $pids"
        kill -TERM $pids 2>/dev/null
        
        # Wait a bit for graceful shutdown
        sleep 2
        
        # Check if processes are still running and force kill if needed
        remaining_pids=$(lsof -ti:$port 2>/dev/null)
        if [[ -n "$remaining_pids" ]]; then
            echo "Force killing remaining processes: $remaining_pids"
            kill -KILL $remaining_pids 2>/dev/null
        fi
        
        echo "✅ $service_name stopped"
    else
        echo "ℹ️  No processes found on port $port"
    fi
}

# Stop backend (port 3001)
kill_port 3001 "Backend API"

# Stop frontend (port 3000) 
kill_port 3000 "Frontend Dashboard"

# Also kill any npm/node processes that might be lingering
echo ""
echo "Cleaning up any remaining npm/node processes..."
pkill -f "npm.*start" 2>/dev/null || true
pkill -f "react-scripts" 2>/dev/null || true

echo ""
echo "🎉 All development servers stopped!"
echo ""
echo "To start again, run:"
echo "   ./start-dev.sh"
