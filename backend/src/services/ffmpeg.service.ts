// src/services/ffmpeg.service.ts
// FFmpeg Media Processing Pipeline for Agile Intel v3.0
// NEW in v3.0 — processes webinar recordings into 12 derivative assets

import ffmpeg from 'fluent-ffmpeg';
import path from 'path';
import fs from 'fs';
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
    this.tempDir = process.env.TEMP_DIR || '/tmp/media-processing';
    ffmpeg.setFfmpegPath(this.ffmpegPath);
    if (!fs.existsSync(this.tempDir)) fs.mkdirSync(this.tempDir, { recursive: true });
  }

  async processWebinarRecording(
    sourceBlob: string, webinarId: string,
    metadata: { title: string; presenter: string; date: string }
  ): Promise<{ assets: MediaAsset[] }> {
    const localSource = path.join(this.tempDir, `${webinarId}-raw.mp4`);
    const assets: MediaAsset[] = [];

    await this.downloadBlob(sourceBlob, localSource);

    assets.push(await this.transcodeWithBranding(localSource, webinarId, metadata));
    assets.push(...await this.generateHLS(localSource, webinarId));
    assets.push(...await this.generateHighlightClips(localSource, webinarId));
    assets.push(await this.extractAudio(localSource, webinarId));
    assets.push(...await this.generateThumbnails(localSource, webinarId));
    assets.push(await this.generateSocialTeaser(localSource, webinarId));

    this.cleanupTemp(webinarId);
    return { assets };
  }

  async transcodeWithBranding(source: string, id: string, meta: any): Promise<MediaAsset> {
    const output = path.join(this.tempDir, `${id}-branded.mp4`);
    return new Promise((resolve, reject) => {
      ffmpeg(source)
        .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11')
        .videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-preset', 'medium', '-crf', '23', '-movflags', '+faststart'])
        .output(output)
        .on('end', async () => {
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/full-replay.mp4`);
          resolve({
            type: 'full_replay', blobUrl, fileSize: fs.statSync(output).size,
            duration: 0, resolution: '1920x1080', format: 'mp4'
          });
        })
        .on('error', reject).run();
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
        ffmpeg(source)
          .outputOptions([
            `-vf`, `scale=-2:${v.height}`, `-b:v`, v.bitrate,
            '-codec:a', 'aac', '-b:a', '128k',
            '-hls_time', '10', '-hls_playlist_type', 'vod',
            '-hls_segment_filename', `${outDir}/seg_%03d.ts`,
          ])
          .output(path.join(outDir, 'playlist.m3u8'))
          .on('end', () => resolve()).on('error', reject).run();
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
    const output = path.join(this.tempDir, `${id}-podcast.mp3`);
    return new Promise((resolve, reject) => {
      ffmpeg(source).noVideo().audioCodec('libmp3lame').audioChannels(2).audioBitrate('192k')
        .audioFilters('loudnorm=I=-16:TP=-1.5:LRA=11').output(output)
        .on('end', async () => {
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/podcast.mp3`);
          resolve({
            type: 'podcast', blobUrl, fileSize: fs.statSync(output).size,
            duration: 0, resolution: 'audio', format: 'mp3'
          });
        }).on('error', reject).run();
    });
  }

  async generateThumbnails(source: string, id: string): Promise<MediaAsset[]> {
    const thumbDir = path.join(this.tempDir, `${id}-thumbs`);
    fs.mkdirSync(thumbDir, { recursive: true });
    const timestamps = ['00:00:30', '00:05:00', '00:15:00', '00:25:00'];
    const assets: MediaAsset[] = [];
    for (let i = 0; i < timestamps.length; i++) {
      const output = path.join(thumbDir, `thumb_${i}.jpg`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(source).seekInput(timestamps[i]).frames(1)
          .outputOptions(['-vf', 'scale=1280:720'])
          .output(output).on('end', () => resolve()).on('error', reject).run();
      });
      const blobUrl = await this.uploadBlob(output, `webinars/${id}/thumbnails/thumb_${i}.jpg`);
      assets.push({
        type: 'thumbnail', blobUrl, fileSize: 0,
        duration: 0, resolution: '1280x720', format: 'jpg'
      });
    }
    return assets;
  }

  async generateSocialTeaser(source: string, id: string): Promise<MediaAsset> {
    const output = path.join(this.tempDir, `${id}-teaser.mp4`);
    return new Promise((resolve, reject) => {
      ffmpeg(source).seekInput('00:02:00').duration(30)
        .videoFilters(['crop=ih:ih', 'scale=1080:1080'])
        .videoCodec('libx264').audioCodec('aac')
        .outputOptions(['-preset', 'fast', '-crf', '22', '-movflags', '+faststart'])
        .output(output)
        .on('end', async () => {
          const blobUrl = await this.uploadBlob(output, `webinars/${id}/social-teaser.mp4`);
          resolve({
            type: 'social_teaser', blobUrl, fileSize: 0,
            duration: 30, resolution: '1080x1080', format: 'mp4'
          });
        }).on('error', reject).run();
    });
  }

  async generateHighlightClips(source: string, id: string): Promise<MediaAsset[]> {
    const chapters = [
      { start: '00:00:00', duration: 180, label: 'intro' },
      { start: '00:05:00', duration: 300, label: 'core-demo' },
      { start: '00:15:00', duration: 300, label: 'ai-agents' },
      { start: '00:25:00', duration: 180, label: 'qa' },
    ];
    const assets: MediaAsset[] = [];
    for (const ch of chapters) {
      const output = path.join(this.tempDir, `${id}-clip-${ch.label}.mp4`);
      await new Promise<void>((resolve, reject) => {
        ffmpeg(source).seekInput(ch.start).duration(ch.duration)
          .videoCodec('libx264').audioCodec('aac')
          .outputOptions(['-preset', 'fast', '-crf', '23', '-movflags', '+faststart'])
          .output(output).on('end', () => resolve()).on('error', reject).run();
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
    const blockBlob = mediaContainer.getBlockBlobClient(blobPath);
    await blockBlob.downloadToFile(localPath);
  }

  cleanupTemp(id: string): void {
    const patterns = ['-raw.mp4', '-branded.mp4', '-podcast.mp3', '-teaser.mp4'];
    patterns.forEach(p => {
      const f = path.join(this.tempDir, `${id}${p}`);
      if (fs.existsSync(f)) fs.unlinkSync(f);
    });
  }
}

interface MediaAsset {
  type: string; blobUrl: string; fileSize: number;
  duration: number; resolution: string; format: string;
}
