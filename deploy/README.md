# 🚀 Azure Deployment Guide - Static Web Apps + Container Apps (FREE)

This guide sets up your Hunajapannu app on Azure using the free tiers of Static Web Apps and Container Apps.

## 💰 Cost Breakdown
- **Azure Static Web Apps**: FREE (100 GB bandwidth/month)
- **Azure Container Apps**: FREE (first 180,000 vCPU-seconds + 360,000 GiB-seconds)
- **Azure Container Registry**: ~$5/month (Basic tier)
- **Azure Storage**: You already have this for logs

**Total estimated cost: ~$5/month**

## 📋 Prerequisites
1. Azure CLI installed
2. Docker installed (for manual deployment)
3. GitHub repository set up
4. Azure Storage account with your Cowrie logs

## 🎯 Deployment Options

### Option A: Automated Deployment (Recommended)
Uses GitHub Actions for continuous deployment.

### Option B: Manual Deployment
Step-by-step manual setup.

---

## 🤖 Option A: Automated Deployment

### 1. Create Azure Resources
Run the setup script:

**Windows:**
```cmd
cd deploy
azure-setup.bat
```

**Linux/macOS:**
```bash
cd deploy
chmod +x azure-setup.sh
./azure-setup.sh
```

### 2. Configure GitHub Secrets
Add these secrets to your GitHub repository (Settings → Secrets and variables → Actions):

```
AZURE_STATIC_WEB_APPS_API_TOKEN=<from setup script output>
AZURE_RESOURCE_GROUP=rg-hunajapannu
ACR_NAME=hunajapannuacr
ACR_LOGIN_SERVER=hunajapannuacr.azurecr.io
ACR_USERNAME=<from setup script output>
ACR_PASSWORD=<from setup script output>
```

### 3. Create Container App with Storage
```bash
az containerapp create \
  --name hunajapannu-backend \
  --resource-group rg-hunajapannu \
  --environment hunajapannu-env \
  --image mcr.microsoft.com/azuredocs/containerapps-helloworld:latest \
  --target-port 3001 \
  --ingress external \
  --min-replicas 0 \
  --max-replicas 1 \
  --cpu 0.25 \
  --memory 0.5Gi

# Add your Azure Storage connection string
az containerapp secret set \
  --name hunajapannu-backend \
  --resource-group rg-hunajapannu \
  --secrets azure-storage-connection='YOUR_AZURE_STORAGE_CONNECTION_STRING'

az containerapp update \
  --name hunajapannu-backend \
  --resource-group rg-hunajapannu \
  --set-env-vars \
    AZURE_STORAGE_CONNECTION_STRING=secretref:azure-storage-connection \
    AZURE_CONTAINER_NAME=hunajapannulogs \
    PORT=3001 \
    NODE_ENV=production
```

### 4. Deploy
Push to main branch - GitHub Actions will automatically deploy both frontend and backend.

---

## 🔧 Option B: Manual Deployment

### 1. Create Azure Resources
Same as Option A - run the setup script.

### 2. Deploy Backend Manually
```bash
cd deploy
chmod +x deploy-backend.sh
./deploy-backend.sh
```

### 3. Deploy Frontend Manually
```bash
# Build frontend
npm run build:frontend

# Deploy to Static Web App (requires Azure CLI extension)
az extension add --name staticwebapp
az staticwebapp deploy \
  --name hunajapannu-frontend \
  --resource-group rg-hunajapannu \
  --source ./frontend/build
```

---

## 🔗 Update Frontend API URL

After backend deployment, update your frontend to use the Container App URL:

1. Get backend URL:
```bash
az containerapp show \
  --name hunajapannu-backend \
  --resource-group rg-hunajapannu \
  --query "properties.configuration.ingress.fqdn" \
  --output tsv
```

2. Update frontend API calls to use: `https://<backend-url>`

---

## 🔍 Monitoring & Troubleshooting

### Check Container App Logs
```bash
az containerapp logs show \
  --name hunajapannu-backend \
  --resource-group rg-hunajapannu \
  --follow
```

### Check Static Web App Status
```bash
az staticwebapp show \
  --name hunajapannu-frontend \
  --resource-group rg-hunajapannu
```

### Test Endpoints
- Frontend: `https://hunajapannu-frontend.azurestaticapps.net`
- Backend Health: `https://<backend-url>/health`
- Backend API: `https://<backend-url>/api/status`

---

## 🎉 Benefits of This Setup

1. **Free Tier Usage**: Stays within Azure free limits
2. **Auto-scaling**: Backend scales to 0 when not in use
3. **Global CDN**: Frontend served globally via Azure CDN
4. **SSL/HTTPS**: Automatic SSL certificates
5. **CI/CD**: Automated deployment on code changes
6. **Monitoring**: Built-in Azure monitoring and logging

## 🚨 Important Notes

- Container Apps scale to 0 after idle time (saves costs)
- First request after idle may have cold start delay (~10-30 seconds)
- Static Web Apps free tier has 100 GB bandwidth/month limit
- Monitor usage in Azure portal to stay within free limits

Your honeypot analytics dashboard will now be accessible globally at minimal cost!