#!/usr/bin/env node
/**
 * Cross-platform setup script
 * Works on Windows, Linux, and macOS
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🔧 Setting up Hunajapannu Development Environment...\n');

try {
    // Install all dependencies
    console.log('📦 Installing dependencies...');
    execSync('npm install', { stdio: 'inherit' });
    execSync('npm install --prefix frontend', { stdio: 'inherit' });
    execSync('npm install --prefix backend', { stdio: 'inherit' });

    // Create .env file if it doesn't exist
    const envPath = path.join(__dirname, '../../backend/.env');
    const envExamplePath = path.join(__dirname, '../../backend/.env.example');

    if (!fs.existsSync(envPath)) {
        console.log('\n⚠️  Creating backend/.env from template...');
        fs.copyFileSync(envExamplePath, envPath);
        console.log('   Please edit backend/.env with your Azure settings');
    }

    console.log('\n🎉 Setup complete! Use npm run dev to start development');

} catch (error) {
    console.error('❌ Setup failed:', error.message);
    process.exit(1);
}