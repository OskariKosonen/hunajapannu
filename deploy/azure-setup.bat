@echo off
REM Azure Deployment Script for Hunajapannu (Windows)
REM Creates Azure Static Web Apps + Container Apps deployment

echo 🚀 Azure Deployment Setup for Hunajapannu
echo ==========================================

REM Check if Azure CLI is installed
az --version >nul 2>&1
if errorlevel 1 (
    echo ❌ Azure CLI is not installed. Please install it first:
    echo    https://docs.microsoft.com/en-us/cli/azure/install-azure-cli
    pause
    exit /b 1
)

REM Configuration
set RESOURCE_GROUP=rg-hunajapannu
set LOCATION=East US
set STATIC_APP_NAME=hunajapannu-frontend
set CONTAINER_APP_ENV=hunajapannu-env
set CONTAINER_APP_NAME=hunajapannu-backend
set ACR_NAME=hunajapannuacr

echo 📋 Configuration:
echo    Resource Group: %RESOURCE_GROUP%
echo    Location: %LOCATION%
echo    Static App: %STATIC_APP_NAME%
echo    Container App: %CONTAINER_APP_NAME%
echo.

REM Login to Azure (if not already logged in)
echo 🔐 Checking Azure login...
az account show >nul 2>&1
if errorlevel 1 (
    echo Please login to Azure:
    az login
)

REM Create resource group
echo 📦 Creating resource group...
az group create --name %RESOURCE_GROUP% --location "%LOCATION%"

REM Create Azure Container Registry (for free tier)
echo 🐳 Creating Container Registry...
az acr create --resource-group %RESOURCE_GROUP% --name %ACR_NAME% --sku Basic --admin-enabled true

REM Create Container Apps environment
echo 🌐 Creating Container Apps environment...
az containerapp env create --name %CONTAINER_APP_ENV% --resource-group %RESOURCE_GROUP% --location "%LOCATION%"

REM Create Static Web App
echo 🌍 Creating Static Web App...
az staticwebapp create --name %STATIC_APP_NAME% --resource-group %RESOURCE_GROUP% --location "%LOCATION%" --source https://github.com/OskariKosonen/hunajapannu --branch main --app-location "/frontend" --build-location "/frontend/build" --output-location ""

echo ✅ Azure resources created successfully!
echo.
echo 📝 Next steps:
echo 1. Get deployment tokens from Azure portal
echo 2. Add secrets to GitHub repository
echo 3. Create Container App with your configuration
echo 4. Push to main branch to trigger deployment
echo.
echo 🎉 Setup complete!
pause