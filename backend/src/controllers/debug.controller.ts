// src/controllers/debug.controller.ts — NEW debug controller
import { Request, Response } from 'express';
import { BlobServiceClient } from '@azure/storage-blob';

export default class DebugController {
    private containerClient;

    constructor() {
        const connectionString = (process.env.AZURE_BLOB_CONNECTION_STRING || '').trim();
        if (!connectionString) {
            throw new Error('AZURE_BLOB_CONNECTION_STRING is not set');
        }
        const blobService = BlobServiceClient.fromConnectionString(connectionString);
        this.containerClient = blobService.getContainerClient('media-assets');
    }

    async listBlobs(req: Request, res: Response): Promise<void> {
        try {
            const blobs = [] as string[];
            for await (const blob of this.containerClient.listBlobsFlat()) {
                const url = this.containerClient.getBlockBlobClient(blob.name).url;
                blobs.push(url);
            }
            res.json({ success: true, blobs });
        } catch (error: any) {
            res.status(500).json({ success: false, error: error.message });
        }
    }
}
