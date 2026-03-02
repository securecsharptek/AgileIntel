// src/routes/copilot.routes.ts — NEW in v3.0
import express from 'express';
import { CopilotController } from '../controllers/copilot.controller';
const router = express.Router();
const controller = new CopilotController();
router.post('/copilot/generate-blog', (req, res) => controller.generateBlog(req, res));
router.post('/copilot/generate-email', (req, res) => controller.generateEmail(req, res));
router.post('/copilot/summarize-meeting', (req, res) => controller.summarizeMeeting(req, res));
router.post('/copilot/agent-query', (req, res) => controller.queryAgent(req, res));
export default router;
