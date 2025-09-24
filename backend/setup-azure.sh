#!/bin/bash

# Azure Storage Integration Helper Script
# This script helps you configure and test your Azure Storage Account integration

echo "🐝 Cowrie Honeypot Analytics - Azure Setup Helper"
echo "=================================================="

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found! Creating from template..."
    cp .env.example .env
    echo "✅ Created .env file from template"
fi

echo ""
echo "📋 Current Configuration:"
echo "------------------------"

# Show current config (without revealing secrets)
if grep -q "AZURE_STORAGE_CONNECTION_STRING=" .env; then
    if grep -q "AZURE_STORAGE_CONNECTION_STRING=$" .env || grep -q "AZURE_STORAGE_CONNECTION_STRING=\"\"" .env; then
        echo "❌ Azure Storage Connection String: NOT SET"
    else
        echo "✅ Azure Storage Connection String: CONFIGURED"
    fi
else
    echo "❌ Azure Storage Connection String: NOT FOUND"
fi

CONTAINER_NAME=$(grep "AZURE_CONTAINER_NAME=" .env | cut -d'=' -f2)
echo "📁 Container Name: ${CONTAINER_NAME:-NOT SET}"

LOG_PREFIX=$(grep "AZURE_LOG_PREFIX=" .env | cut -d'=' -f2)
echo "📂 Log Prefix: ${LOG_PREFIX:-NOT SET}"

echo ""
echo "🔧 Setup Steps:"
echo "---------------"
echo "1. Get your Azure Storage Connection String from Azure Portal:"
echo "   Portal → Storage Account → Access Keys → Connection String"
echo ""
echo "2. Edit the .env file:"
echo "   nano .env"
echo ""
echo "3. Set your connection string:"
echo "   AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=...;"
echo ""
echo "4. Update container name if needed:"
echo "   AZURE_CONTAINER_NAME=your-container-name"
echo ""
echo "5. Test the connection:"
echo "   curl http://localhost:3001/api/test-connection"

echo ""
echo "🧪 Testing Current Setup:"
echo "-------------------------"

# Check if server is running
if curl -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "✅ Backend server is running"
    
    # Test connection
    echo "🔌 Testing Azure Storage connection..."
    RESPONSE=$(curl -s http://localhost:3001/api/test-connection)
    echo "Response: $RESPONSE"
    
    if echo "$RESPONSE" | grep -q '"status":"connected"'; then
        echo "✅ Azure Storage connection successful!"
        
        # Test log listing
        echo "📄 Testing log file listing..."
        LOG_FILES=$(curl -s http://localhost:3001/api/log-files)
        FILE_COUNT=$(echo "$LOG_FILES" | grep -o '"name":' | wc -l)
        echo "Found $FILE_COUNT log files"
        
    elif echo "$RESPONSE" | grep -q '"status":"development"'; then
        echo "🔧 Running in development mode (using mock data)"
        echo "💡 Configure your Azure Storage connection string to use real data"
    else
        echo "❌ Azure Storage connection failed"
        echo "Response: $RESPONSE"
    fi
else
    echo "❌ Backend server is not running"
    echo "💡 Start it with: cd backend && node src/index.js"
fi

echo ""
echo "📚 For detailed instructions, see: AZURE_SETUP.md"
