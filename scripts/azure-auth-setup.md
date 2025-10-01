# Azure Authentication Setup for GitHub Actions

## Create Service Principal

Run this command in Azure Cloud Shell or Azure CLI:

```bash
az ad sp create-for-rbac --name "github-actions-hunajapannu" \
  --role contributor \
  --scopes /subscriptions/YOUR_SUBSCRIPTION_ID/resourceGroups/rg-hunajapannu \
  --sdk-auth
```

## Add GitHub Secret

1. Copy the JSON output from the command above
2. Go to your GitHub repository: https://github.com/OskariKosonen/hunajapannu
3. Go to Settings → Secrets and variables → Actions
4. Click "New repository secret"
5. Name: `AZURE_CREDENTIALS`
6. Value: Paste the JSON output

The JSON should look like this:
```json
{
  "clientId": "xxxx",
  "clientSecret": "xxxx",
  "subscriptionId": "xxxx",
  "tenantId": "xxxx"
}
```

## Alternative: Use Azure CLI

If you prefer to use Azure CLI locally:

```bash
# Login to Azure
az login

# Get your subscription ID
az account show --query id -o tsv

# Create service principal (replace SUBSCRIPTION_ID with your actual ID)
az ad sp create-for-rbac --name "github-actions-hunajapannu" \
  --role contributor \
  --scopes /subscriptions/SUBSCRIPTION_ID/resourceGroups/rg-hunajapannu \
  --sdk-auth
```

## Verify Resource Group

Make sure your resource group name matches:
```bash
az group show --name rg-hunajapannu
```

If it's different, update the AZURE_RESOURCE_GROUP secret in GitHub.