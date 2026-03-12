// src/services/queue.service.ts
// Background Job Queue using Bull + Redis

import Queue from 'bull';
import Redis from 'ioredis';
import { FFmpegService } from './ffmpeg.service';
import sql from 'mssql';

// Parse Redis URL or use individual config
let redisClient: Redis | null = null;
let queueEnabled = true;

const redisUrl = process.env.REDIS_URL;
if (redisUrl && redisUrl !== 'redis://disabled') {
  // Create Redis client with Azure-compatible TLS settings (same as working test script)
  try {
    redisClient = new Redis(redisUrl, {
      tls: {
        rejectUnauthorized: false, // Required for Azure Redis
      },
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      lazyConnect: false,
    });
    console.log(`[Queue] Redis client created from URL`);
  } catch (error: any) {
    console.error('[Queue] Failed to create Redis client:', error.message);
    queueEnabled = false;
    redisClient = null;
  }
} else if (process.env.REDIS_HOST) {
  // Fallback to individual config variables
  try {
    redisClient = new Redis({
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      tls: process.env.REDIS_TLS === 'true' ? { 
        rejectUnauthorized: false
      } : undefined,
      maxRetriesPerRequest: null,
    });
  } catch (error: any) {
    console.error('[Queue] Failed to create Redis client:', error.message);
    queueEnabled = false;
    redisClient = null;
  }
} else {
  // Redis not configured - disable queue
  console.warn('[Queue] ⚠️  Redis not configured. Video processing will run synchronously.');
  queueEnabled = false;
  redisClient = null;
}

// Create video processing queue using the Redis client
export const videoProcessingQueue = redisClient ? new Queue('video-processing', {
  createClient: (type) => {
    // Bull needs separate clients for different types (client, subscriber, bclient)
    // Clone the connection settings for each type
    return redisClient!.duplicate();
  },
  settings: {
    lockDuration: 3600000, // 1 hour - prevents job from being marked as stalled during long FFmpeg operations
    stalledInterval: 60000, // Check for stalled jobs every 60 seconds (default is 30s)
    maxStalledCount: 2, // Only mark as stalled after 2 checks (gives 2 minutes of no progress)
  },
}) : null;

// Database connection pool
const poolPromise = new sql.ConnectionPool({
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
}).connect();

// Job data interface
export interface VideoProcessingJobData {
  jobId: string;
  sourceBlob: string;
  webinarId: string;
  title?: string;
  presenter?: string;
  date?: string;
}

// Process video jobs (only if queue is enabled)
if (videoProcessingQueue) {
  videoProcessingQueue.process(async (job) => {
  const { jobId, sourceBlob, webinarId, title, presenter, date } = job.data as VideoProcessingJobData;
  
  console.log(`[Queue] Processing job ${jobId} for webinar ${webinarId}`);
  
  // Update job status in database
  const pool = await poolPromise;
  await pool.request()
    .input('jobId', sql.UniqueIdentifier, jobId)
    .input('status', sql.NVarChar, 'processing')
    .query(`
      UPDATE ProcessingJobs 
      SET Status = @status, StartedAt = GETUTCDATE()
      WHERE JobId = @jobId
    `);

  try {
    // Process the video
    const ffmpegService = new FFmpegService();
    const result = await ffmpegService.processWebinarRecording(
      sourceBlob,
      webinarId,
      { title, presenter, date }
    );

    // Update job status to completed
    await pool.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('status', sql.NVarChar, 'completed')
      .input('assetsCreated', sql.Int, result.assets.length)
      .query(`
        UPDATE ProcessingJobs 
        SET Status = @status, CompletedAt = GETUTCDATE(), AssetsCreated = @assetsCreated
        WHERE JobId = @jobId
      `);

    console.log(`[Queue] Job ${jobId} completed successfully - ${result.assets.length} assets created`);
    
    return { success: true, assets: result.assets.length, webinarId };
  } catch (error: any) {
    console.error(`[Queue] Job ${jobId} failed:`, error.message);

    // Update job status to failed
    await pool.request()
      .input('jobId', sql.UniqueIdentifier, jobId)
      .input('status', sql.NVarChar, 'failed')
      .input('errorMessage', sql.NVarChar, error.message)
      .query(`
        UPDATE ProcessingJobs 
        SET Status = @status, CompletedAt = GETUTCDATE(), ErrorMessage = @errorMessage
        WHERE JobId = @jobId
      `);

    throw error; // Bull will mark job as failed
  }
});

  // Queue event listeners for monitoring
  videoProcessingQueue.on('completed', (job, result) => {
    console.log(`[Queue] ✅ Job ${job.id} completed:`, result);
  });

  videoProcessingQueue.on('failed', (job, err) => {
    console.error(`[Queue] ❌ Job ${job?.id} failed:`, err.message);
  });

  videoProcessingQueue.on('progress', (job, progress) => {
    console.log(`[Queue] 📊 Job ${job.id} progress: ${progress}%`);
  });

  console.log('[Queue] Video processing queue initialized (async mode)');
} else {
  console.log('[Queue] Running in synchronous mode (Redis unavailable)');
}
console.log('[Queue] Video processing queue initialized');
