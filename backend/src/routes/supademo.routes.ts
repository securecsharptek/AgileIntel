// src/routes/supademo.routes.ts
// Express route definitions for Supademo integration

import express from 'express';
import { SupademoController } from '../controllers/supademo.controller';
import { validateSupademoWebhook } from '../middleware/webhook-auth.middleware';

const router = express.Router();
const controller = new SupademoController();

// Webhook — public endpoint, validated via HMAC signature
router.post(
  '/webhooks/supademo',
  validateSupademoWebhook,
  (req, res) => controller.handleWebhook(req, res)
);

// Lead capture — used by landing page forms
router.post('/leads/capture', (req, res) => controller.captureLead(req, res));

// Demo management — protected (add your auth middleware)
router.get('/demos', (req, res) => controller.listDemos(req, res));
router.get('/demos/:demoId/analytics', (req, res) => controller.getAnalytics(req, res));

// Health check
router.get('/health', (_req, res) => {
  res.json({ status: 'healthy', service: 'supademo-integration', version: '2.0.0' });
});

export default router;
