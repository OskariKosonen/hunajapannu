@echo off
REM Quick deployment guide for Hunajapannu to Azure

echo 🚀 Hunajapannu Azure Deployment Quick Start
echo ============================================
echo.

echo This will deploy your app using Azure's FREE tiers:
echo - Azure Static Web Apps (FREE - 100 GB/month)
echo - Azure Container Apps (FREE - 180k vCPU-seconds/month)
echo - Total cost: ~$5/month for Container Registry only
echo.

echo 📋 Prerequisites:
echo [1] Azure CLI installed and logged in
echo [2] Docker installed (for manual deployment)
echo [3] GitHub repository pushed to main branch
echo [4] Azure Storage account with Cowrie logs
echo.

set /p continue="Continue with setup? (y/N): "
if /i not "%continue%"=="y" (
    echo Cancelled.
    pause
    exit /b 0
)

echo.
echo 🔧 Step 1: Create Azure Resources
echo ==================================
echo Running azure-setup.bat...
call azure-setup.bat

echo.
echo 📝 Step 2: Configure GitHub Secrets
echo ===================================
echo Add these secrets to your GitHub repository:
echo Go to: https://github.com/OskariKosonen/hunajapannu/settings/secrets/actions
echo.
echo Required secrets:
echo - AZURE_STATIC_WEB_APPS_API_TOKEN
echo - AZURE_RESOURCE_GROUP
echo - ACR_NAME  
echo - ACR_LOGIN_SERVER
echo - ACR_USERNAME
echo - ACR_PASSWORD
echo.
pause

echo.
echo 🐳 Step 3: Manual Container App Setup
echo =====================================
echo We'll create the Container App manually first...
echo.

REM Get the ACR server name
for /f "tokens=*" %%i in ('az acr show --name hunajapannuacr --resource-group rg-hunajapannu --query "loginServer" --output tsv 2^>nul') do set ACR_SERVER=%%i

if "%ACR_SERVER%"=="" (
    echo ❌ Could not get ACR server. Make sure Azure resources were created successfully.
    pause
    exit /b 1
)

echo Creating Container App with placeholder image...
az containerapp create ^
  --name hunajapannu-backend ^
  --resource-group rg-hunajapannu ^
  --environment hunajapannu-env ^
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest ^
  --target-port 3001 ^
  --ingress external ^
  --min-replicas 0 ^
  --max-replicas 1 ^
  --cpu 0.25 ^
  --memory 0.5Gi

echo.
echo 🔑 Step 4: Add Azure Storage Secret
echo ===================================
set /p storage_conn="Enter your Azure Storage connection string: "

az containerapp secret set ^
  --name hunajapannu-backend ^
  --resource-group rg-hunajapannu ^
  --secrets azure-storage-connection="%storage_conn%"

az containerapp update ^
  --name hunajapannu-backend ^
  --resource-group rg-hunajapannu ^
  --set-env-vars ^
    AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-connection ^
    AZURE_CONTAINER_NAME=hunajapannulogs ^
    PORT=3001 ^
    NODE_ENV=production

REM Get the backend URL
for /f "tokens=*" %%i in ('az containerapp show --name hunajapannu-backend --resource-group rg-hunajapannu --query "properties.configuration.ingress.fqdn" --output tsv 2^>nul') do set BACKEND_URL=%%i

echo.
echo ✅ Setup Complete!
echo ==================
echo.
echo 🌐 Your URLs (once deployed):
echo Frontend: https://hunajapannu-frontend.azurestaticapps.net
echo Backend:  https://%BACKEND_URL%
echo.
echo 📝 Next Steps:
echo 1. Push your code to main branch to trigger GitHub Actions
echo 2. Check deployment status in GitHub Actions tab
echo 3. Update REACT_APP_API_URL in GitHub Actions if backend URL differs
echo.
echo 🔍 To check deployment:
echo - GitHub Actions: https://github.com/OskariKosonen/hunajapannu/actions
echo - Azure Portal: https://portal.azure.com
echo.
echo 🎉 Your honeypot analytics will be live once GitHub Actions completes!
pause