# Cowrie Analytics Development Makefile
# Simple commands for local development

.PHONY: help start stop restart install clean test build

# Default target
help:
	@echo "🚀 Cowrie Analytics Development Commands"
	@echo ""
	@echo "Available commands:"
	@echo "  make start     - Start both backend and frontend servers"
	@echo "  make stop      - Stop all development servers"
	@echo "  make restart   - Stop and start servers"
	@echo "  make install   - Install all dependencies"
	@echo "  make clean     - Remove all node_modules"
	@echo "  make test      - Run all tests"
	@echo "  make build     - Build for production"
	@echo "  make logs      - Show logs from running servers"
	@echo ""
	@echo "Quick start:"
	@echo "  make start"
	@echo ""
	@echo "URLs:"
	@echo "  Frontend: http://localhost:3000"
	@echo "  Backend:  http://localhost:3001"

# Start development servers
start:
	@echo "🚀 Starting development environment..."
	@./start-dev.sh

# Stop development servers  
stop:
	@echo "🛑 Stopping development environment..."
	@./stop-dev.sh

# Restart servers
restart: stop start

# Install all dependencies
install:
	@echo "📦 Installing dependencies..."
	@npm run install:all

# Clean all node_modules
clean:
	@echo "🧹 Cleaning node_modules..."
	@npm run clean

# Run tests
test:
	@echo "🧪 Running tests..."
	@npm run test

# Build for production
build:
	@echo "🏗️  Building for production..."
	@npm run build

# Show logs (if servers are running)
logs:
	@echo "📋 Checking server status..."
	@echo ""
	@echo "Backend status (port 3001):"
	@curl -s http://localhost:3001/health || echo "❌ Backend not running"
	@echo ""
	@echo "Frontend status (port 3000):"
	@curl -s -I http://localhost:3000 | head -1 || echo "❌ Frontend not running"

# Quick development setup
dev-setup: install start
	@echo ""
	@echo "🎉 Development environment ready!"
	@echo "📊 Frontend: http://localhost:3000"
	@echo "🔧 Backend: http://localhost:3001"

# Status check
status:
	@echo "📊 Service Status:"
	@echo ""
	@echo -n "Backend (3001): "
	@curl -s http://localhost:3001/health >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Stopped"
	@echo -n "Frontend (3000): "
	@curl -s http://localhost:3000 >/dev/null 2>&1 && echo "✅ Running" || echo "❌ Stopped"
