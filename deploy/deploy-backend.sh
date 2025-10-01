#!/bin/bash

# Manual deployment script for Container App
# Use this if you prefer manual deployment over GitHub Actions

set -e

# Configuration - Update these values
RESOURCE_GROUP="rg-hunajapannu"
CONTAINER_APP_NAME="hunajapannu-backend"
CONTAINER_APP_ENV="hunajapannu-env"
ACR_NAME="hunajapannuacr"
IMAGE_NAME="hunajapannu-backend"
FRONTEND_URL="https://hunajapannu-frontend.azurestaticapps.net"  # Update after Static Web App is created

echo "🐳 Building and deploying backend to Azure Container Apps"
echo "========================================================"

# Build and push Docker image
echo "📦 Building Docker image..."
docker build -t ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:latest .

echo "🔐 Logging in to ACR..."
az acr login --name $ACR_NAME

echo "📤 Pushing image to ACR..."
docker push ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:latest

# Deploy to Container Apps
echo "🚀 Deploying to Container Apps..."
az containerapp create \
  --name $CONTAINER_APP_NAME \
  --resource-group $RESOURCE_GROUP \
  --environment $CONTAINER_APP_ENV \
  --image ${ACR_NAME}.azurecr.io/${IMAGE_NAME}:latest \
  --target-port 3001 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.25 \
  --memory 0.5Gi \
  --env-vars \
    PORT=3001 \
    NODE_ENV=production \
    FRONTEND_URL=$FRONTEND_URL \
    AZURE_CONTAINER_NAME=hunajapannulogs

echo "🔑 Don't forget to add your Azure Storage connection string:"
echo "az containerapp secret set \\"
echo "  --name $CONTAINER_APP_NAME \\"
echo "  --resource-group $RESOURCE_GROUP \\"
echo "  --secrets azure-storage-connection='YOUR_CONNECTION_STRING'"
echo ""
echo "az containerapp update \\"
echo "  --name $CONTAINER_APP_NAME \\"
echo "  --resource-group $RESOURCE_GROUP \\"
echo "  --set-env-vars AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-connection"

# Get the Container App URL
BACKEND_URL=$(az containerapp show --name $CONTAINER_APP_NAME --resource-group $RESOURCE_GROUP --query "properties.configuration.ingress.fqdn" --output tsv)

echo ""
echo "✅ Deployment complete!"
echo "🌐 Backend URL: https://$BACKEND_URL"
echo "📋 Next: Update your frontend to use this backend URL"