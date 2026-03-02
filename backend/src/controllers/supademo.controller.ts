// src/controllers/supademo.controller.ts
// HTTP request handlers for webhook events and demo management APIs

import { Request, Response } from 'express';
import { SupademoService } from '../services/supademo.service';
import { WebhookEvent } from '../models/demo-engagement.model';

export class SupademoController {
  private service: SupademoService;

  constructor() {
    this.service = new SupademoService();
  }

  // ---------------------------------------------------------------------------
  // WEBHOOK HANDLER — POST /api/webhooks/supademo
  // ---------------------------------------------------------------------------

  async handleWebhook(req: Request, res: Response): Promise<void> {
    try {
      const { event, data } = req.body as WebhookEvent;
      console.log(`📨 Webhook: ${event}`);

      switch (event) {
        case 'demo.viewed':
          await this.service.trackDemoView({
            supademoId: data.demo_id,
            demoId: data.demo_id,
            prospectEmail: data.viewer?.email,
            prospectName: data.viewer?.name,
            companyName: data.viewer?.company,
            referralSource: data.referrer,
            userAgent: data.user_agent,
            ipAddress: data.ip_address,
          });
          break;

        case 'demo.completed':
          await this.service.trackDemoView({
            supademoId: data.demo_id,
            demoId: data.demo_id,
            prospectEmail: data.viewer?.email,
            prospectName: data.viewer?.name,
            companyName: data.viewer?.company,
            timeSpent: data.time_spent,
            completionPercentage: 100,
            stepsViewed: data.steps_viewed,
            referralSource: data.referrer,
            userAgent: data.user_agent,
            ipAddress: data.ip_address,
          });
          break;

        case 'demo.step_viewed':
          if (data.step_number && data.total_steps) {
            const pct = (data.step_number / data.total_steps) * 100;
            await this.service.trackDemoView({
              supademoId: data.demo_id,
              demoId: data.demo_id,
              prospectEmail: data.viewer?.email,
              timeSpent: data.time_spent,
              completionPercentage: pct,
              stepsViewed: data.step_number,
            });
          }
          break;

        default:
          console.warn(`Unknown webhook event: ${event}`);
      }

      res.status(200).json({ success: true, event });
    } catch (error: any) {
      console.error('[Controller] Webhook error:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // LEAD CAPTURE — POST /api/leads/capture
  // Used by landing pages to submit form data
  // ---------------------------------------------------------------------------

  async captureLead(req: Request, res: Response): Promise<void> {
    try {
      const { email, company, role, name, source, page, utmSource, utmMedium, utmCampaign } = req.body;

      if (!email) {
        res.status(400).json({ error: 'Email is required' });
        return;
      }

      // Track as a demo view with landing page attribution
      await this.service.trackDemoView({
        supademoId: 'agile-intel-core', // default demo
        demoId: 'agile-intel-core',
        prospectEmail: email,
        prospectName: name,
        companyName: company,
        prospectRole: role,
        referralSource: source || 'landing_page',
        landingPage: page,
        utmSource,
        utmMedium,
        utmCampaign,
      });

      res.status(200).json({ success: true, message: 'Lead captured' });
    } catch (error: any) {
      console.error('[Controller] Lead capture error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // ANALYTICS — GET /api/demos/:demoId/analytics
  // ---------------------------------------------------------------------------

  async getAnalytics(req: Request, res: Response): Promise<void> {
    try {
      const { demoId } = req.params;
      const { startDate, endDate } = req.query;

      const analytics = await this.service.getDemoAnalytics(
        demoId,
        startDate ? new Date(startDate as string) : undefined,
        endDate ? new Date(endDate as string) : undefined
      );

      res.json(analytics);
    } catch (error: any) {
      console.error('[Controller] Analytics error:', error);
      res.status(500).json({ error: error.message });
    }
  }

  // ---------------------------------------------------------------------------
  // DEMO LIST — GET /api/demos
  // ---------------------------------------------------------------------------

  async listDemos(_req: Request, res: Response): Promise<void> {
    try {
      const demos = await this.service.listDemos();
      res.json(demos);
    } catch (error: any) {
      console.error('[Controller] List demos error:', error);
      res.status(500).json({ error: error.message });
    }
  }
}
