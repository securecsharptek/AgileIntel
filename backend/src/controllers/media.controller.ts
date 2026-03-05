// src/controllers/media.controller.ts — NEW in v3.0
import { Request, Response } from 'express';
import { FFmpegService } from '../services/ffmpeg.service';

export class MediaController {
  private ffmpegService: FFmpegService;
  constructor() { this.ffmpegService = new FFmpegService(); }

  async processWebinar(req: Request, res: Response): Promise<void> {
    try {
      const { sourceBlob, webinarId, title, presenter, date } = req.body;
      if (!sourceBlob || !webinarId) { res.status(400).json({ error: 'sourceBlob and webinarId required' }); return; }
      const result = await this.ffmpegService.processWebinarRecording(sourceBlob, webinarId, { title, presenter, date });
      res.json({ success: true, assets: result.assets.length, webinarId });
    } catch (error: any) { res.status(500).json({ error: error.message }); }
  }

  async getAssets(req: Request, res: Response): Promise<void> {
    try {
      const { webinarId } = req.params;
      const assets = await this.ffmpegService.getWebinarAssets(webinarId);
      res.json({ webinarId, assets });
    }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }

  async generateThumbnail(req: Request, res: Response): Promise<void> {
    try {
      const { sourceBlob, webinarId, timestamp } = req.body;
      if (!sourceBlob || !webinarId) { res.status(400).json({ error: 'sourceBlob and webinarId required' }); return; }

      const thumbnailUrl = await this.ffmpegService.generateSingleThumbnail(sourceBlob, webinarId, timestamp || '00:00:00');
      res.json({ success: true, thumbnailUrl });
    }
    catch (error: any) { res.status(500).json({ error: error.message }); }
  }
}
