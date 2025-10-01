#!/bin/bash

echo "🚀 Starting Development Environment..."

# Check if .env exists, if not copy from example
if [[ ! -f "backend/.env" ]]; then
    echo "⚠️  Creating backend/.env from template..."
    cp backend/.env.example backend/.env
    echo "   Please edit backend/.env with your Azure settings"
fi

echo "🔧 Starting servers on http://localhost:3000 and http://localhost:3001"
npm run dev
