// src/controllers/media.controller.ts — NEW in v3.0
import { Request, Response } from 'express';
import { randomUUID } from 'crypto';
import { FFmpegService } from '../services/ffmpeg.service';
import { videoProcessingQueue, VideoProcessingJobData } from '../services/queue.service';
import sql from 'mssql';

// Database connection pool (initialized once)
const poolPromise = new sql.ConnectionPool({
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
}).connect();

export class MediaController {
  private ffmpegService: FFmpegService;
  constructor() { this.ffmpegService = new FFmpegService(); }

  async processWebinar(req: Request, res: Response): Promise<void> {
    try {
      console.log('[MediaController] 1. Request received');
      const { sourceBlob, webinarId, title, presenter, date } = req.body;
      if (!sourceBlob || !webinarId) { 
        res.status(400).json({ error: 'sourceBlob and webinarId required' }); 
        return; 
      }

      console.log('[MediaController] 2. Validation passed');

      // Check if async queue is available
      if (!videoProcessingQueue) {
        res.status(503).json({ 
          error: 'Queue unavailable', 
          message: 'Redis is not configured. Cannot process video.' 
        });
        return;
      }

      console.log('[MediaController] 3. Queue available');

      // Generate unique job ID
      const jobId = randomUUID();
      console.log(`[MediaController] 4. Generated jobId: ${jobId}`);

      // Create ProcessingJobs record
      console.log('[MediaController] 5. Getting DB pool...');
      const pool = await poolPromise;
      console.log('[MediaController] 6. Pool acquired, inserting record...');
      await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .input('webinarId', sql.NVarChar, webinarId)
        .input('sourceBlob', sql.NVarChar, sourceBlob)
        .input('status', sql.NVarChar, 'queued')
        .query(`
          INSERT INTO ProcessingJobs (JobId, WebinarId, SourceBlob, Status, QueuedAt)
          VALUES (@jobId, @webinarId, @sourceBlob, @status, GETUTCDATE())
        `);

      console.log('[MediaController] 7. DB record created, adding to queue...');

      // Add job to queue
      const jobData: VideoProcessingJobData = { 
        jobId, 
        sourceBlob, 
        webinarId, 
        title, 
        presenter, 
        date 
      };
      await videoProcessingQueue.add(jobData, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 2000 },
        timeout: 3600000, // 1 hour max
      });

      console.log(`[MediaController] 8. Job ${jobId} queued for webinar ${webinarId}`);
      console.log('[MediaController] 9. Sending response...');

      // Return 200 with job_id and queued_asset_count
      res.status(200).json({ 
        job_id: jobId,
        queued_asset_count: 12
      });
      
      console.log('[MediaController] 10. Response sent successfully');
    } catch (error: any) { 
      console.error('[MediaController] Error queuing job:', error);
      res.status(500).json({ error: error.message }); 
    }
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

  async trackVideoEngagement(req: Request, res: Response): Promise<void> {
    try {
      const { assetId, prospectEmail, watchDuration, watchPercentage, segmentsWatched, rewatchCount } = req.body;

      if (!assetId || !prospectEmail) {
        res.status(400).json({ error: 'assetId and prospectEmail are required' });
        return;
      }

      const pool = await poolPromise;
      
      // Validate AssetId is a valid GUID
      const assetIdGuid = assetId.toString();
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(assetIdGuid)) {
        res.status(400).json({ error: 'Invalid AssetId format. Must be a valid GUID.' });
        return;
      }

      await pool.request()
        .input('assetId', sql.UniqueIdentifier, assetIdGuid)
        .input('prospectEmail', sql.NVarChar, prospectEmail)
        .input('watchDuration', sql.Int, watchDuration || 0)
        .input('watchPercentage', sql.Decimal(5, 2), watchPercentage || 0)
        .input('segmentsWatched', sql.NVarChar, segmentsWatched ? segmentsWatched.toString() : '')
        .input('rewatchCount', sql.Int, rewatchCount || 0)
        .query(`
          INSERT INTO VideoEngagements (AssetId, ProspectEmail, WatchDuration, WatchPercentage, SegmentsWatched, RewatchCount)
          VALUES (@assetId, @prospectEmail, @watchDuration, @watchPercentage, @segmentsWatched, @rewatchCount)
        `);

      res.status(200).json({ success: true, message: 'Video engagement recorded successfully' });
    } catch (error: any) {
      console.error('[MediaController] Error tracking video engagement:', error);
      res.status(500).json({ error: 'Internal Server Error', details: error.message });
    }
  }

  /**
   * Get the status of an async video processing job.
   */
  async getJobStatus(req: Request, res: Response): Promise<void> {
    try {
      const { jobId } = req.params;

      // Get job status from database
      const pool = await poolPromise;
      const dbResult = await pool.request()
        .input('jobId', sql.UniqueIdentifier, jobId)
        .query(`
          SELECT JobId, WebinarId, SourceBlob, Status, QueuedAt, StartedAt, CompletedAt, 
                 AssetsCreated, ErrorMessage
          FROM ProcessingJobs 
          WHERE JobId = @jobId
        `);

      if (dbResult.recordset.length === 0) {
        res.status(404).json({ error: 'Job not found' });
        return;
      }

      const job = dbResult.recordset[0];

      res.json({
        job_id: job.JobId,
        webinar_id: job.WebinarId,
        source_blob: job.SourceBlob,
        status: job.Status,
        queued_at: job.QueuedAt,
        started_at: job.StartedAt,
        completed_at: job.CompletedAt,
        assets_created: job.AssetsCreated,
        error_message: job.ErrorMessage
      });
    } catch (error: any) {
      console.error('[MediaController] Error fetching job status:', error);
      res.status(500).json({ error: error.message });
    }
  }

  /**
   * List all video processing jobs with optional filtering.
   * 
   * NOTE: This endpoint is DORMANT until Redis is configured and async queue is enabled.
   * Currently returns empty results because synchronous processing doesn't create job records.
   * 
   * Query params:
   * - status: Filter by job status (queued, processing, completed, failed)
   * - limit: Max results to return (default: 50)
   */
  async listJobs(req: Request, res: Response): Promise<void> {
    try {
      const { status, limit = 50 } = req.query;

      const pool = await poolPromise;
      let query = `
        SELECT TOP ${parseInt(limit as string)} 
               JobId, WebinarId, Status, QueuedAt, StartedAt, CompletedAt, 
               AssetsCreated, ErrorMessage
        FROM ProcessingJobs
      `;

      if (status) {
        query += ` WHERE Status = @status`;
      }

      query += ` ORDER BY QueuedAt DESC`;

      const request = pool.request();
      if (status) {
        request.input('status', sql.NVarChar, status as string);
      }

      const result = await request.query(query);

      res.json({
        jobs: result.recordset,
        count: result.recordset.length
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  }
}
