#!/bin/bash

echo "🛑 Stopping Development Environment..."

# Stop Node.js processes
pkill -f "node" 2>/dev/null || true

echo "✅ Stopped all development processes"
echo "To start again, run:"
echo "   ./start-dev.sh"
