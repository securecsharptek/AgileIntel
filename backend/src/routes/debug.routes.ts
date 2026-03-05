// src/routes/debug.routes.ts — NEW debug route for listing blobs
import express from 'express';
import DebugController from '../controllers/debug.controller';

const router = express.Router();
const controller = new DebugController();

// Endpoint to list all blobs in the media container
router.get('/media/debug/list-blobs', (req, res) => controller.listBlobs(req, res));

export default router;
