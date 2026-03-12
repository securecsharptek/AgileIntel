// List all blobs in Azure Blob Storage to find test files
require('dotenv').config();
const { BlobServiceClient } = require('@azure/storage-blob');

async function listBlobs() {
  const connectionString = process.env.AZURE_BLOB_CONNECTION_STRING;
  if (!connectionString) {
    console.error('❌ AZURE_BLOB_CONNECTION_STRING not set');
    process.exit(1);
  }

  const blobServiceClient = BlobServiceClient.fromConnectionString(connectionString);
  
  // List all containers
  console.log('\n📦 Containers:');
  for await (const container of blobServiceClient.listContainers()) {
    console.log(`  - ${container.name}`);
  }

  // List blobs in media-assets container
  console.log('\n📁 Blobs in "media-assets" container:');
  const containerClient = blobServiceClient.getContainerClient('media-assets');
  
  try {
    let count = 0;
    for await (const blob of containerClient.listBlobsFlat()) {
      console.log(`  - ${blob.name} (${(blob.properties.contentLength / 1024 / 1024).toFixed(2)} MB)`);
      count++;
      if (count >= 20) {
        console.log('  ... (showing first 20 blobs)');
        break;
      }
    }
    if (count === 0) {
      console.log('  (empty)');
    }
  } catch (error) {
    console.error('❌ Error listing blobs:', error.message);
  }
}

listBlobs().catch(console.error);
