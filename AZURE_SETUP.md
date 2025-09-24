# Azure Storage Account Integration Guide

## Prerequisites

1. **Azure Storage Account**: You need an Azure Storage Account with your Cowrie logs
2. **Container**: A blob container containing your log files
3. **Access**: Storage Account access keys or connection string

## Step 1: Get Your Azure Storage Connection String

### Option A: From Azure Portal (Recommended)
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Storage Account
3. Go to **Security + networking** → **Access keys**
4. Copy the **Connection string** from either key1 or key2

### Option B: From Azure CLI
```bash
az storage account show-connection-string \
  --name your_storage_account_name \
  --resource-group your_resource_group_name
```

## Step 2: Configure Environment Variables

1. Edit the `.env` file in the `backend/` directory:
```bash
cd backend
nano .env
```

2. Add your Azure Storage configuration:
```env
# Replace with your actual connection string
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;AccountName=yourstorage;AccountKey=your_key;EndpointSuffix=core.windows.net

# Replace with your container name
AZURE_CONTAINER_NAME=cowrie-logs

# Optional: If logs are in a specific folder within the container
AZURE_LOG_PREFIX=logs/cowrie/

# Set to production mode
NODE_ENV=production

# Enable debug logging to troubleshoot issues
DEBUG_LOGS=true
```

## Step 3: Verify Your Log Structure

Make sure your Cowrie logs are in JSON format, one entry per line. Example:
```json
{"timestamp":"2025-09-22T10:30:45.123Z","session":"abc123","src_ip":"1.2.3.4","eventid":"cowrie.login.failed","username":"admin","password":"123456"}
```

## Step 4: Test the Connection

1. Restart the backend server:
```bash
# Stop current server
pkill -f "node src/index.js"

# Start with new configuration
cd backend
node src/index.js
```

2. Test the connection:
```bash
curl http://localhost:3001/api/test-connection
```

Expected successful response:
```json
{
  "success": true,
  "connection": {
    "status": "connected",
    "container": "cowrie-logs",
    "lastModified": "2025-09-22T15:30:00.000Z"
  }
}
```

## Step 5: Test Log Retrieval

```bash
# List log files
curl http://localhost:3001/api/log-files

# Get recent logs
curl http://localhost:3001/api/logs?limit=5

# Get analytics
curl http://localhost:3001/api/analytics
```

## Troubleshooting

### Common Issues

#### 1. "Container not found"
- Verify your container name is correct
- Ensure the container exists in your storage account

#### 2. "Invalid authentication"
- Check your connection string is complete and correct
- Verify you have access to the storage account

#### 3. "No logs found"
- Check if your log files are in the expected location
- Verify the `AZURE_LOG_PREFIX` if using a subfolder
- Ensure log files are not empty

#### 4. "Failed to parse logs"
- Verify your logs are in JSON format
- Check for malformed JSON entries

### Debug Mode

Enable detailed logging by setting:
```env
DEBUG_LOGS=true
```

This will show:
- Blob search parameters
- Found files and their sizes
- Download progress
- Parsing results

### Log File Structure

Your Azure Storage container should look like:
```
your-container/
├── cowrie-logs/
│   ├── 2025-09-22.json
│   ├── 2025-09-21.json
│   └── ...
└── other-files/
```

## Production Deployment Notes

1. **Security**: Never commit your `.env` file with real credentials
2. **Access**: Consider using Azure Managed Identity for production
3. **Performance**: Monitor blob storage costs and optimize log retention
4. **Monitoring**: Enable Azure Storage analytics for monitoring
