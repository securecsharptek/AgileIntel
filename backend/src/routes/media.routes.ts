// src/routes/media.routes.ts — NEW in v3.0
import express from 'express';
import { MediaController } from '../controllers/media.controller';
const router = express.Router();
const controller = new MediaController();
router.post('/media/process-webinar', (req, res) => controller.processWebinar(req, res));
router.get('/media/assets/:webinarId', (req, res) => controller.getAssets(req, res));
router.post('/media/generate-thumbnail', (req, res) => controller.generateThumbnail(req, res));
export default router;
