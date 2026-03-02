// src/controllers/copilot.controller.ts — NEW in v3.0
import { Request, Response } from 'express';
import { CopilotService } from '../services/copilot.service';

export class CopilotController {
  private copilotService: CopilotService;
  constructor() { this.copilotService = new CopilotService(); }

  async generateBlog(req: Request, res: Response): Promise<void> {
    try { const draft = await this.copilotService.generateBlogDraft(req.body.topic, req.body.keywords, req.body.targetLength); res.json({ success: true, draft }); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }
  async generateEmail(req: Request, res: Response): Promise<void> {
    try { const draft = await this.copilotService.generateSalesEmail(req.body); res.json({ success: true, draft }); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }
  async summarizeMeeting(req: Request, res: Response): Promise<void> {
    try { const summary = await this.copilotService.generateMeetingSummary(req.body.meetingId); res.json({ success: true, summary }); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }
  async queryAgent(req: Request, res: Response): Promise<void> {
    try { const result = await this.copilotService.queryLeadIntelligence(req.body.query); res.json({ success: true, result }); }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }
}
