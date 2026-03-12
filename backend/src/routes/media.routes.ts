// src/routes/media.routes.ts — NEW in v3.0
import express from 'express';
import { MediaController } from '../controllers/media.controller';
const router = express.Router();
const controller = new MediaController();

// Video processing (async with queue)
router.post('/media/process-webinar', (req, res) => controller.processWebinar(req, res));

// Job status endpoints
// NOTE: These endpoints are DORMANT until Redis async queue is enabled.
// Currently, video processing runs synchronously and these endpoints return 503 or empty results.
// To activate: Fix Redis authentication in Azure Portal → Enable access key authentication.
router.get('/media/job-status/:jobId', (req, res) => controller.getJobStatus(req, res));
router.get('/media/jobs', (req, res) => controller.listJobs(req, res));

// Asset management
router.get('/media/assets/:webinarId', (req, res) => controller.getAssets(req, res));
router.post('/media/generate-thumbnail', (req, res) => controller.generateThumbnail(req, res));

// Video engagement tracking
router.post('/media/engagement', (req, res) => controller.trackVideoEngagement(req, res));

export default router;
