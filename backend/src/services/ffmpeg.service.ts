// src/services/ffmpeg.service.ts
// FFmpeg Media Processing Pipeline for Agile Intel v3.0
// NEW in v3.0 — processes webinar recordings into 12 derivative assets

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
import os from 'os';
import sql from 'mssql';
import { BlobServiceClient } from '@azure/storage-blob';

const connectionString = (process.env.AZURE_BLOB_CONNECTION_STRING || '').trim();
if (!connectionString) {
  throw new Error('AZURE_BLOB_CONNECTION_STRING is not set or empty. Please verify your .env file.');
}
const blobService = BlobServiceClient.fromConnectionString(connectionString);
const mediaContainer = blobService.getContainerClient('media-assets');

export class FFmpegService {
  private ffmpegPath: string;
  private tempDir: string;

  constructor() {
    this.ffmpegPath = process.env.FFMPEG_PATH || '/usr/bin/ffmpeg';
    // On Windows, /tmp/... (from .env) is not a valid path for native Win32 executables like ffmpeg.exe.
    // Default to the OS temp dir instead.
    const defaultTemp = process.platform === 'win32'
      ? path.join(os.tmpdir(), 'media-processing')
      : '/tmp/media-processing';
    const configured = process.env.TEMP_DIR || defaultTemp;
    // If on Windows and the configured path starts with '/', convert to absolute Windows path.
    // e.g. /tmp/media-processing -> C:/tmp/media-processing
    if (process.platform === 'win32' && configured.startsWith('/')) {
      const driveLetter = process.cwd().slice(0, 2); // e.g. 'C:'
      this.tempDir = driveLetter + configured.replace(/\//g, '/');
    } else {
      this.tempDir = configured;
    }
    // Normalise to forward slashes for FFmpeg
    this.tempDir = this.tempDir.replace(/\\/g, '/');
    ffmpeg.setFfmpegPath(this.ffmpegPath);
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
    console.log(`[FFmpeg] tempDir resolved to: ${this.tempDir}`);
  }

  /** Convert a path to forward-slash form FFmpeg can understand on Windows.
   *  Also ensures paths like /tmp/... get a drive letter (e.g. C:/tmp/...) */
  private p(filePath: string): string {
    let result = filePath.replace(/\\/g, '/');
    // On Windows, if path starts with / but has no drive letter, add current drive
    if (process.platform === 'win32' && result.startsWith('/') && result[2] !== ':') {
      const drive = process.cwd().slice(0, 2); // e.g. 'C:'
      result = drive + result;
    }
    return result;
  }

  async processWebinarRecording(
    sourceBlob: string, webinarId: string,
    metadata: { title: string; presenter: string; date: string }
  ): Promise<{ assets: MediaAsset[] }> {
    const localSource = this.p(path.join(this.tempDir, `${webinarId}-raw.mp4`));
    const assets: MediaAsset[] = [];

    await this.downloadBlob(sourceBlob, localSource);

    const brandedSource = this.p(path.join(this.tempDir, `${webinarId}-branded.mp4`));

    // 1. Transcode main file first (scales 4K to 1080p, standardizes format)
    assets.push(await this.transcodeWithBranding(localSource, webinarId, metadata));

    // 2. Run everything else in parallel USING the transcoded 1080p file as the source.
    // This is 10x faster than reading the raw 4K source 5 separate times!
    const [hls, clips, audio, thumbs, teaser] = await Promise.all([
      this.generateHLS(brandedSource, webinarId),
      this.generateHighlightClips(brandedSource, webinarId),
      this.extractAudio(brandedSource, webinarId),
      this.generateThumbnails(brandedSource, webinarId),
      this.generateSocialTeaser(brandedSource, webinarId)
    ]);

    assets.push(...hls, ...clips, audio, ...thumbs, teaser);

    this.cleanupTemp(webinarId);
    return { assets };
  }

  async transcodeWithBranding(source: string, id: string, meta: any): Promise<MediaAsset> {
    const output = this.p(path.join(this.tempDir, `${id}-branded.mp4`));
    console.log(`[FFmpeg] transcodeWithBranding: ${this.p(source)} -> ${output}`);

    // Probe source file to check if it has an audio stream and pixel format
    const hasAudio = await new Promise<boolean>((resolve) => {
      ffmpeg.ffprobe(source, (err, data) => {
        if (err) { console.error('[FFmpeg] ffprobe error:', err.message); resolve(false); return; }
        const hasAudioStream = data.streams?.some(s => s.codec_type === 'audio') ?? false;
        const videoStream = data.streams?.find(s => s.codec_type === 'video');
        console.log(`[FFmpeg] Source audio detected: ${hasAudioStream}`);
        console.log(`[FFmpeg] Source pixel_fmt: ${videoStream?.pix_fmt}, codec: ${videoStream?.codec_name}, size: ${videoStream?.width}x${videoStream?.height}`);
        resolve(hasAudioStream);
      });
    });

    return new Promise((resolve, reject) => {
      let cmd = ffmpeg(this.p(source))
        .inputOptions(['-y'])            // -y is a global ffmpeg flag; must go before input
        .videoCodec('libx264')
        .size('1920x1080')
        .autoPad()
        .outputOptions(['-pix_fmt', 'yuv420p', '-preset', 'ultrafast', '-crf', '23', '-movflags', '+faststart']);

      if (hasAudio) {
        // Use straight AAC encoding — loudnorm is not universally supported on all FFmpeg builds
        cmd = cmd
          .audioCodec('aac')
          .audioBitrate('192k');
      } else {
        // No audio track — skip audio encoding entirely
        cmd = cmd.outputOptions(['-an']);
        console.log('[FFmpeg] No audio track found — encoding video only');
      }

      let lastLog = Date.now();
      cmd
        .output(output)
        .on('start', (cmdLine) => {
          console.log('[FFmpeg] Executing transcoder:\n', cmdLine);
        })
        .on('progress', (p) => {
          if (Date.now() - lastLog > 5000) {
            console.log(`[FFmpeg] Transcoding... frame=${p.frames} fps=${p.currentFps} time=${p.timemark} speed=${p.currentKbps}kbits/s`);
            lastLog = Date.now();
          }
        })
        .on('stderr', (stderrLine) => {
          // Log only key lines (not the per-frame progress)
          if (stderrLine.includes('Error') || stderrLine.includes('error') || stderrLine.includes('Invalid') || stderrLine.includes('found')) {
            console.error('[FFmpeg] stderr:', stderrLine);
          }
        })
        .on('end', async () => {
          console.log('[FFmpeg] Transcoder finished!');
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/full-replay.mp4`);
          resolve({
            type: 'full_replay', blobUrl, fileSize: fs.statSync(output).size,
            duration: 0, resolution: '1920x1080', format: 'mp4'
          });
        })
        .on('error', (err, stdout, stderr) => {
          console.error('[FFmpeg] transcodeWithBranding FAILED');
          console.error('[FFmpeg] err.message:', err.message);
          reject(new Error(`FFmpeg transcode failed: ${err.message}\n${stderr}`));
        })
        .run();
    });
  }



  async generateHLS(source: string, id: string): Promise<MediaAsset[]> {
    const hlsDir = path.join(this.tempDir, `${id}-hls`);
    fs.mkdirSync(hlsDir, { recursive: true });
    const variants = [
      { height: 1080, bitrate: '5000k', label: '1080p' },
      { height: 720, bitrate: '2500k', label: '720p' },
      { height: 480, bitrate: '1000k', label: '480p' },
      { height: 360, bitrate: '600k', label: '360p' },
    ];
    const assets: MediaAsset[] = [];
    for (const v of variants) {
      const outDir = path.join(hlsDir, v.label);
      fs.mkdirSync(outDir, { recursive: true });
      await new Promise<void>((resolve, reject) => {
        let lastLog = Date.now();
        ffmpeg(this.p(source))
          .inputOptions(['-y'])
          .outputOptions([
            `-preset`, `ultrafast`,
            `-vf`, `scale=-2:${v.height}:flags=lanczos,format=yuv420p`, `-b:v`, v.bitrate,
            '-codec:a', 'aac', '-b:a', '128k',
            '-hls_time', '10', '-hls_playlist_type', 'vod',
            '-hls_segment_filename', `${this.p(outDir)}/seg_%03d.ts`,
          ])
          .output(this.p(path.join(outDir, 'playlist.m3u8')))
          .on('start', () => console.log(`[FFmpeg] HLS ${v.label} started...`))
          .on('progress', (p) => {
            if (Date.now() - lastLog > 5000) {
              console.log(`[FFmpeg] HLS ${v.label} progress... time=${p.timemark}`);
              lastLog = Date.now();
            }
          })
          .on('end', () => resolve())
          .on('error', (err, _stdout, stderr) => {
            console.error(`[FFmpeg] HLS ${v.label} error:\n`, stderr);
            reject(new Error(`HLS ${v.label} failed: ${err.message}\n${stderr}`));
          }).run();
      });
      const blobUrl = await this.uploadBlob(
        path.join(outDir, 'playlist.m3u8'), `webinars/${id}/hls/${v.label}/playlist.m3u8`
      );
      assets.push({
        type: `hls_${v.label}`, blobUrl, fileSize: 0,
        duration: 0, resolution: `${v.height}p`, format: 'hls'
      });
    }
    return assets;
  }

  async extractAudio(source: string, id: string): Promise<MediaAsset> {
    const output = this.p(path.join(this.tempDir, `${id}-podcast.mp3`));
    // Probe for audio before extracting
    const srcHasAudio = await new Promise<boolean>((res) => {
      ffmpeg.ffprobe(source, (err, data) => {
        res(!err && (data.streams?.some(s => s.codec_type === 'audio') ?? false));
      });
    });
    if (!srcHasAudio) {
      console.warn('[FFmpeg] No audio stream found — skipping podcast extraction');
      // Return a placeholder asset so the pipeline doesn't crash
      return { type: 'podcast', blobUrl: '', fileSize: 0, duration: 0, resolution: 'audio', format: 'mp3' };
    }
    return new Promise((resolve, reject) => {
      ffmpeg(this.p(source)).noVideo().audioCodec('libmp3lame').audioChannels(2).audioBitrate('192k')
        .inputOptions(['-y'])
        .output(output)
        .on('end', async () => {
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/podcast.mp3`);
          resolve({
            type: 'podcast', blobUrl, fileSize: fs.statSync(output).size,
            duration: 0, resolution: 'audio', format: 'mp3'
          });
        })
        .on('error', (err, _stdout, stderr) => {
          console.error('[FFmpeg] podcast error:\n', stderr);
          reject(new Error(`Podcast extraction failed: ${err.message}\n${stderr}`));
        }).run();
    });
  }

  async generateThumbnails(source: string, id: string): Promise<MediaAsset[]> {
    const thumbDir = path.join(this.tempDir, `${id}-thumbs`);
    fs.mkdirSync(thumbDir, { recursive: true });

    // Get real duration
    const duration = await new Promise<number>((resolve) => {
      ffmpeg.ffprobe(source, (err, data) => resolve(err ? 0 : (data.format.duration || 0)));
    });

    // Only generate timestamps that are within the video duration
    const targetSeconds = [30, 300, 900, 1500]; // 0:30, 5:00, 15:00, 25:00
    const timestamps = targetSeconds.filter(s => s < duration).map(s => {
      const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')}`;
    });

    if (timestamps.length === 0 && duration > 0) timestamps.push('00:00:00'); // At least one thumb

    const assets: MediaAsset[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const output = this.p(path.join(thumbDir, `thumb_${i}.jpg`));
      await new Promise<void>((resolve, reject) => {
        ffmpeg(this.p(source)).seekInput(timestamps[i]).frames(1)
          .inputOptions(['-y'])
          .size('1280x720')
          .autoPad()
          .outputOptions(['-pix_fmt', 'yuv420p'])
          .output(output).on('end', () => resolve()).on('error', (err, stdout, stderr) => {
            reject(new Error(`Thumb ${timestamps[i]} failed: ${err.message}\n${stderr}`));
          }).run();
      });
      const blobUrl = await this.uploadBlob(output, `webinars/${id}/thumbnails/thumb_${i}.jpg`);
      assets.push({
        type: 'thumbnail', blobUrl, fileSize: 0,
        duration: 0, resolution: '1280x720', format: 'jpg'
      });
    }
    return assets;
  }

  async generateSingleThumbnail(sourceBlob: string, webinarId: string, timestamp: string = '00:00:00'): Promise<string> {
    const localSource = this.p(path.join(this.tempDir, `${webinarId}-raw-thumb.mp4`));
    await this.downloadBlob(sourceBlob, localSource);

    const output = this.p(path.join(this.tempDir, `${webinarId}-single-thumb-${Date.now()}.jpg`));

    // Clamp timestamp if it exceeds video duration
    const duration = await new Promise<number>((resolve) => {
      ffmpeg.ffprobe(localSource, (err, data) => resolve(err ? 0 : (data.format.duration || 0)));
    });

    let safeTimestamp = timestamp;
    if (duration > 0) {
      const parts = timestamp.split(':').map(Number);
      let seconds = 0;
      if (parts.length === 3) seconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
      else if (parts.length === 2) seconds = parts[0] * 60 + parts[1];
      else seconds = Number(timestamp) || 0;

      if (seconds >= duration) {
        const clamped = Math.max(0, Math.floor(duration - 1));
        const h = Math.floor(clamped / 3600), m = Math.floor((clamped % 3600) / 60), s = clamped % 60;
        safeTimestamp = `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
        console.log(`[FFmpeg] Clamped timestamp from ${timestamp} to ${safeTimestamp} to prevent EOF error`);
      }
    }

    await new Promise<void>((resolve, reject) => {
      ffmpeg(this.p(localSource)).seekInput(safeTimestamp).frames(1)
        .inputOptions(['-y'])
        .size('1280x720')
        .autoPad()
        .outputOptions(['-pix_fmt', 'yuv420p'])
        .output(output).on('end', () => resolve()).on('error', (err, stdout, stderr) => {
          reject(new Error(`Custom thumb generation failed: ${err.message}\n${stderr}`));
        }).run();
    });

    const blobUrl = await this.uploadBlob(output, `webinars/${webinarId}/thumbnails/custom-${Date.now()}.jpg`);

    if (fs.existsSync(localSource)) fs.unlinkSync(localSource);
    if (fs.existsSync(output)) fs.unlinkSync(output);

    return blobUrl;
  }

  async generateSocialTeaser(source: string, id: string): Promise<MediaAsset> {
    const output = this.p(path.join(this.tempDir, `${id}-teaser.mp4`));

    // Check duration first
    const duration = await new Promise<number>((resolve) => {
      ffmpeg.ffprobe(source, (err, data) => resolve(err ? 0 : (data.format.duration || 0)));
    });
    if (duration < 10) return { type: 'social_teaser', blobUrl: '', fileSize: 0, duration: 0, resolution: '1080x1080', format: 'mp4' };

    const startObj = duration > 120 ? '00:02:00' : '00:00:00';
    const clipDur = Math.min(30, duration);

    return new Promise((resolve, reject) => {
      ffmpeg(this.p(source)).seekInput(startObj).duration(clipDur)
        .videoCodec('libx264')
        .inputOptions(['-y'])
        .size('1080x1080').autoPad()
        .outputOptions(['-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '22', '-movflags', '+faststart', '-an'])
        .output(output)
        .on('end', async () => {
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/social-teaser.mp4`);
          resolve({
            type: 'social_teaser', blobUrl, fileSize: 0,
            duration: 30, resolution: '1080x1080', format: 'mp4'
          });
        })
        .on('error', (err, _stdout, stderr) => {
          console.error('[FFmpeg] social teaser error:\n', stderr);
          reject(new Error(`Social teaser failed: ${err.message}\n${stderr}`));
        }).run();
    });
  }

  async generateHighlightClips(source: string, id: string): Promise<MediaAsset[]> {
    const duration = await new Promise<number>((resolve) => {
      ffmpeg.ffprobe(source, (err, data) => resolve(err ? 0 : (data.format.duration || 0)));
    });

    const possibleChapters = [
      { startSec: 0, duration: 180, label: 'intro' },
      { startSec: 300, duration: 300, label: 'core-demo' },
      { startSec: 900, duration: 300, label: 'ai-agents' },
      { startSec: 1500, duration: 180, label: 'qa' },
    ];
    // Only generate clips that actually fit inside the video's actual duration
    const chapters = possibleChapters.filter(ch => ch.startSec < duration).map(ch => {
      const remaining = duration - ch.startSec;
      return { ...ch, duration: Math.min(ch.duration, remaining) };
    });

    const assets: MediaAsset[] = [];
    for (const ch of chapters) {
      const output = this.p(path.join(this.tempDir, `${id}-clip-${ch.label}.mp4`));
      await new Promise<void>((resolve, reject) => {
        ffmpeg(this.p(source)).seekInput(ch.startSec).duration(ch.duration)
          .videoCodec('libx264')
          .inputOptions(['-y'])
          .outputOptions(['-pix_fmt', 'yuv420p', '-preset', 'fast', '-crf', '23', '-movflags', '+faststart', '-an'])
          .output(output)
          .on('end', () => resolve())
          .on('error', (err, _stdout, stderr) => {
            console.error(`[FFmpeg] clip ${ch.label} error:\n`, stderr);
            reject(new Error(`Clip ${ch.label} failed: ${err.message}\n${stderr}`));
          }).run();
      });
      const blobUrl = await this.uploadBlob(output, `webinars/${id}/clips/${ch.label}.mp4`);
      assets.push({
        type: `clip_${ch.label}`, blobUrl, fileSize: 0,
        duration: ch.duration, resolution: '1920x1080', format: 'mp4'
      });
    }
    return assets;
  }

  async uploadBlob(localPath: string, blobPath: string): Promise<string> {
    const blockBlob = mediaContainer.getBlockBlobClient(blobPath);
    await blockBlob.uploadFile(localPath);
    return blockBlob.url;
  }

  async downloadBlob(blobPath: string, localPath: string): Promise<void> {
    // Support both full Azure Blob URLs and relative container paths
    // e.g. "https://account.blob.core.windows.net/media-assets/webinars/x.mp4"
    //   or "webinars/x.mp4"
    let relativePath = blobPath;
    const containerUrl = mediaContainer.url; // e.g. https://account.blob.core.windows.net/media-assets
    if (blobPath.startsWith('http')) {
      // Strip the container URL prefix (plus the trailing slash) to get the blob name
      relativePath = blobPath.replace(containerUrl.replace(/\/?$/, '/'), '');
    }
    console.log(`[FFmpeg] Downloading blob: "${relativePath}" → ${localPath}`);
    const blockBlob = mediaContainer.getBlockBlobClient(relativePath);
    const exists = await blockBlob.exists();
    if (!exists) {
      throw new Error(`Source blob does not exist in container: "${relativePath}"`);
    }
    await blockBlob.downloadToFile(localPath);
  }

  cleanupTemp(id: string): void {
    const patterns = ['-raw.mp4', '-branded.mp4', '-podcast.mp3', '-teaser.mp4'];
    patterns.forEach(p => {
      const f = path.join(this.tempDir, `${id}${p}`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }

  async getWebinarAssets(webinarId: string): Promise<string[]> {
    const prefix = `webinars/${webinarId}/`;
    const assets: string[] = [];
    for await (const blob of mediaContainer.listBlobsFlat({ prefix })) {
      const url = mediaContainer.getBlockBlobClient(blob.name).url;
      assets.push(url);
    }
    return assets;
  }
}

interface MediaAsset {
  type: string; blobUrl: string; fileSize: number;
  duration: number; resolution: string; format: string;
}
