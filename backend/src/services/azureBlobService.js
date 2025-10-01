const { BlobServiceClient, ContainerClient } = require('@azure/storage-blob');

class AzureBlobService {
  constructor() {
    this.connectionString = process.env.AZURE_STORAGE_CONNECTION_STRING;
    this.sasUrl = process.env.AZURE_SAS_URL;
    this.containerName = process.env.AZURE_CONTAINER_NAME || 'hunajapannulogs';

    if (!this.connectionString && !this.sasUrl) {
      throw new Error('Azure Storage configuration required: Set AZURE_STORAGE_CONNECTION_STRING or AZURE_SAS_URL');
    }

    try {
      if (this.connectionString) {
        this.blobServiceClient = BlobServiceClient.fromConnectionString(this.connectionString);
        this.containerClient = this.blobServiceClient.getContainerClient(this.containerName);
        console.log(`✅ Connected to Azure Storage via connection string`);
      } else if (this.sasUrl) {
        this.containerClient = new ContainerClient(this.sasUrl);
        console.log(`✅ Connected to Azure Storage via SAS URL`);
      }
      console.log(`📁 Container: ${this.containerName}`);
    } catch (error) {
      console.error('❌ Failed to initialize Azure Blob Service:', error.message);
      throw new Error(`Azure Storage configuration error: ${error.message}`);
    }
  }

  async testConnection() {
    try {
      if (this.sasUrl) {
        const iterator = this.containerClient.listBlobsFlat({ maxPageSize: 1 });
        const result = await iterator.next();
        return {
          status: 'connected',
          container: this.containerName,
          connectionType: 'SAS URL',
          hasBlobs: !result.done
        };
      } else {
        const properties = await this.containerClient.getProperties();
        return {
          status: 'connected',
          container: this.containerName,
          connectionType: 'Connection String',
          lastModified: properties.lastModified
        };
      }
    } catch (error) {
      console.error('Azure Storage connection test failed:', error);
      return { status: 'error', message: error.message, code: error.code };
    }
  }

  async getRecentLogs(hours = 24, maxFiles = 5) {
    try {
      const blobs = [];

      // Get live log
      try {
        const liveBlobName = 'live/cowrie.json';
        const blobClient = this.containerClient.getBlobClient(liveBlobName);
        if (await blobClient.exists()) {
          const props = await blobClient.getProperties();
          blobs.push({
            name: liveBlobName,
            lastModified: props.lastModified,
            size: props.contentLength
          });
        }
      } catch (error) {
        console.log('No live log found');
      }

      // Get archived logs
      const days = Math.ceil(hours / 24);
      const today = new Date();

      for (let i = 0; i < days && blobs.length < maxFiles; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() - i);
        const dateStr = date.toISOString().split('T')[0];
        const blobName = `archive/cowrie.json.${dateStr}`;

        try {
          const blobClient = this.containerClient.getBlobClient(blobName);
          if (await blobClient.exists()) {
            const props = await blobClient.getProperties();
            blobs.push({
              name: blobName,
              lastModified: props.lastModified,
              size: props.contentLength
            });
          }
        } catch (error) {
          continue;
        }
      }

      if (blobs.length === 0) {
        return null;
      }

      // Sort by last modified and limit
      blobs.sort((a, b) => new Date(b.lastModified) - new Date(a.lastModified));
      const limitedBlobs = blobs.slice(0, maxFiles);

      // Download and combine content
      const contents = await Promise.all(
        limitedBlobs.map(blob => this.downloadLogFile(blob.name))
      );

      return contents.filter(content => content).join('\n');
    } catch (error) {
      console.error('❌ Error getting recent logs:', error);
      throw new Error(`Failed to get recent logs: ${error.message}`);
    }
  }

  async downloadLogFile(blobName) {
    try {
      const blobClient = this.containerClient.getBlobClient(blobName);
      if (!(await blobClient.exists())) {
        throw new Error(`Blob '${blobName}' not found`);
      }

      const response = await blobClient.download();
      const content = await this.streamToBuffer(response.readableStreamBody);
      return content.toString();
    } catch (error) {
      console.error(`❌ Error downloading ${blobName}:`, error);
      throw new Error(`Failed to download log: ${error.message}`);
    }
  }

  async streamToBuffer(readableStream) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      readableStream.on('data', (data) => {
        chunks.push(data instanceof Buffer ? data : Buffer.from(data));
      });
      readableStream.on('end', () => resolve(Buffer.concat(chunks)));
      readableStream.on('error', reject);
    });
  }
}

module.exports = AzureBlobService;
