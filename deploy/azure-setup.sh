#!/bin/bash

# Azure Deployment Script for Hunajapannu
# Creates Azure Static Web Apps + Container Apps deployment

set -e

echo "🚀 Azure Deployment Setup for Hunajapannu"
echo "=========================================="

# Check if Azure CLI is installed
if ! command -v az &> /dev/null; then
    echo "❌ Azure CLI is not installed. Please install it first:"
    echo "   https://docs.microsoft.com/en-us/cli/azure/install-azure-cli"
    exit 1
fi

# Configuration
RESOURCE_GROUP="rg-hunajapannu"
LOCATION="East US"
STATIC_APP_NAME="hunajapannu-frontend"
CONTAINER_APP_ENV="hunajapannu-env"
CONTAINER_APP_NAME="hunajapannu-backend"
ACR_NAME="hunajapannuacr"

echo "📋 Configuration:"
echo "   Resource Group: $RESOURCE_GROUP"
echo "   Location: $LOCATION"
echo "   Static App: $STATIC_APP_NAME"
echo "   Container App: $CONTAINER_APP_NAME"
echo ""

# Login to Azure (if not already logged in)
echo "🔐 Checking Azure login..."
if ! az account show &> /dev/null; then
    echo "Please login to Azure:"
    az login
fi

# Create resource group
echo "📦 Creating resource group..."
az group create --name $RESOURCE_GROUP --location "$LOCATION"

# Create Azure Container Registry (for free tier)
echo "🐳 Creating Container Registry..."
az acr create \
    --resource-group $RESOURCE_GROUP \
    --name $ACR_NAME \
    --sku Basic \
    --admin-enabled true

# Create Container Apps environment
echo "🌐 Creating Container Apps environment..."
az containerapp env create \
    --name $CONTAINER_APP_ENV \
    --resource-group $RESOURCE_GROUP \
    --location "$LOCATION"

# Create Static Web App
echo "🌍 Creating Static Web App..."
az staticwebapp create \
    --name $STATIC_APP_NAME \
    --resource-group $RESOURCE_GROUP \
    --location "$LOCATION" \
    --source https://github.com/OskariKosonen/hunajapannu \
    --branch main \
    --app-location "/frontend" \
    --build-location "/frontend/build" \
    --output-location ""

# Get Static Web App deployment token
echo "🔑 Getting deployment token..."
STATIC_APP_TOKEN=$(az staticwebapp secrets list --name $STATIC_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.apiKey" --output tsv)

# Get ACR credentials
echo "🔑 Getting ACR credentials..."
ACR_SERVER=$(az acr show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "loginServer" --output tsv)
ACR_USERNAME=$(az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "username" --output tsv)
ACR_PASSWORD=$(az acr credential show --name $ACR_NAME --resource-group $RESOURCE_GROUP --query "passwords[0].value" --output tsv)

echo "✅ Azure resources created successfully!"
echo ""
echo "📝 Next steps:"
echo "1. Add these secrets to your GitHub repository:"
echo "   AZURE_STATIC_WEB_APPS_API_TOKEN: $STATIC_APP_TOKEN"
echo "   AZURE_RESOURCE_GROUP: $RESOURCE_GROUP"
echo "   ACR_NAME: $ACR_NAME"
echo "   ACR_LOGIN_SERVER: $ACR_SERVER"
echo "   ACR_USERNAME: $ACR_USERNAME"
echo "   ACR_PASSWORD: $ACR_PASSWORD"
echo ""
echo "2. Create Container App with your Azure Storage connection:"
echo "   az containerapp create \\"
echo "     --name $CONTAINER_APP_NAME \\"
echo "     --resource-group $RESOURCE_GROUP \\"
echo "     --environment $CONTAINER_APP_ENV \\"
echo "     --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \\"
echo "     --target-port 3001 \\"
echo "     --ingress external \\"
echo "     --env-vars AZURE_STORAGE_CONNECTION_STRING='YOUR_CONNECTION_STRING' PORT=3001"
echo ""
echo "3. Push to main branch to trigger deployment"
echo ""
echo "🎉 Setup complete! Your app will be deployed on push to main branch."