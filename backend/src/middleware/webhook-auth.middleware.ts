// src/middleware/webhook-auth.middleware.ts
// Validates Supademo webhook HMAC signatures

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { supademoConfig } from '../config/supademo.config';

export const validateSupademoWebhook = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  try {
    const signature = req.headers['x-supademo-signature'] as string;
    const timestamp = req.headers['x-supademo-timestamp'] as string;

    if (!signature || !timestamp) {
      res.status(401).json({ error: 'Missing webhook signature or timestamp' });
      return;
    }

    // Reject if timestamp older than 5 minutes (replay protection)
    const currentTime = Math.floor(Date.now() / 1000);
    const requestTime = parseInt(timestamp, 10);
    if (Math.abs(currentTime - requestTime) > 300) {
      res.status(401).json({ error: 'Webhook timestamp expired' });
      return;
    }

    // Verify HMAC-SHA256 signature
    const payload = JSON.stringify(req.body);
    const expectedSignature = crypto
      .createHmac('sha256', supademoConfig.webhookSecret)
      .update(`${timestamp}.${payload}`)
      .digest('hex');

    if (!crypto.timingSafeEqual(
      Buffer.from(signature, 'hex'),
      Buffer.from(expectedSignature, 'hex')
    )) {
      res.status(401).json({ error: 'Invalid webhook signature' });
      return;
    }

    next();
  } catch (error) {
    console.error('[Webhook Auth] Verification error:', error);
    res.status(500).json({ error: 'Webhook authentication failed' });
  }
};
