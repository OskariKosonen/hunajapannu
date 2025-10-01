#!/usr/bin/env node
/**
 * Cross-platform development stop script
 */

const { execSync } = require('child_process');
const os = require('os');

console.log('🛑 Stopping Development Environment...\n');

try {
    if (os.platform() === 'win32') {
        // Windows
        execSync('taskkill /f /im node.exe 2>nul', { stdio: 'pipe' });
    } else {
        // Linux/macOS
        execSync('pkill -f "node" 2>/dev/null || true', { stdio: 'pipe' });
    }

    console.log('✅ Stopped all development processes');
} catch (error) {
    // Ignore errors - processes might not be running
    console.log('✅ No running processes found');
}