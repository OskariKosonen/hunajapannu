#!/bin/bash

echo "🔧 Setting up Development Environment..."

# Install all dependencies
echo "📦 Installing dependencies..."
npm run install:all

# Create .env file if it doesn't exist
if [ ! -f "backend/.env" ]; then
    cp backend/.env.example backend/.env
    echo "⚠️  Please edit backend/.env with your Azure settings"
fi

echo "🎉 Setup complete! Run ./start-dev.sh to start development"