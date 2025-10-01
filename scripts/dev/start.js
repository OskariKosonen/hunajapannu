#!/usr/bin/env node
/**
 * Cross-platform development start script
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Starting Development Environment...\n');

try {
    // Check if .env exists, create if missing
    const envPath = path.join(__dirname, '../../backend/.env');
    const envExamplePath = path.join(__dirname, '../../backend/.env.example');

    if (!fs.existsSync(envPath)) {
        console.log('⚠️  Creating backend/.env from template...');
        fs.copyFileSync(envExamplePath, envPath);
        console.log('   Please edit backend/.env with your Azure settings\n');
    }

    console.log('🔧 Starting servers on:');
    console.log('   Frontend: http://localhost:3000');
    console.log('   Backend:  http://localhost:3001\n');

    // Start development servers
    execSync('npm run dev', { stdio: 'inherit' });

} catch (error) {
    if (error.signal === 'SIGINT') {
        console.log('\n🛑 Development servers stopped');
    } else {
        console.error('❌ Failed to start:', error.message);
        process.exit(1);
    }
}