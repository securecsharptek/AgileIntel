const path = require('path');

const commandRecords = [];
const runOutcomes = [];

const mockFfmpeg = jest.fn((source) => {
  const handlers = {};
  const record = { source, handlers, calls: {} };
  commandRecords.push(record);

  const cmd = {
    audioFilters: jest.fn((v) => { record.calls.audioFilters = v; return cmd; }),
    videoCodec: jest.fn((v) => { record.calls.videoCodec = v; return cmd; }),
    audioCodec: jest.fn((v) => { record.calls.audioCodec = v; return cmd; }),
    outputOptions: jest.fn((v) => { record.calls.outputOptions = v; return cmd; }),
    output: jest.fn((v) => { record.calls.output = v; return cmd; }),
    on: jest.fn((event, cb) => { handlers[event] = cb; return cmd; }),
    run: jest.fn(() => {
      const outcome = runOutcomes.shift() || { type: 'end' };
      setImmediate(() => {
        if (outcome.type === 'error') {
          handlers.error && handlers.error(outcome.error || new Error('ffmpeg failed'));
        } else {
          handlers.end && handlers.end();
        }
      });
      return cmd;
    }),
    noVideo: jest.fn(() => cmd),
    audioChannels: jest.fn(() => cmd),
    audioBitrate: jest.fn(() => cmd),
    seekInput: jest.fn((v) => { record.calls.seekInput = v; return cmd; }),
    frames: jest.fn((v) => { record.calls.frames = v; return cmd; }),
    duration: jest.fn((v) => { record.calls.duration = v; return cmd; }),
    videoFilters: jest.fn((v) => { record.calls.videoFilters = v; return cmd; }),
  };

  return cmd;
});

mockFfmpeg.setFfmpegPath = jest.fn();
mockFfmpeg.__setRunOutcomes = (outcomes) => {
  runOutcomes.length = 0;
  runOutcomes.push(...outcomes);
};
mockFfmpeg.__getCommands = () => commandRecords;
mockFfmpeg.__reset = () => {
  commandRecords.length = 0;
  runOutcomes.length = 0;
  mockFfmpeg.mockClear();
  mockFfmpeg.setFfmpegPath.mockClear();
};

const mockFs = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn(),
  statSync: jest.fn(),
  unlinkSync: jest.fn(),
};

const mockGetBlockBlobClient = jest.fn();
const mockGetContainerClient = jest.fn(() => ({ getBlockBlobClient: mockGetBlockBlobClient }));
const mockFromConnectionString = jest.fn(() => ({ getContainerClient: mockGetContainerClient }));

jest.mock('fluent-ffmpeg', () => mockFfmpeg);
jest.mock('fs', () => mockFs);
jest.mock('@azure/storage-blob', () => ({
  BlobServiceClient: {
    fromConnectionString: mockFromConnectionString,
  },
}));

function loadServiceClass() {
  let FFmpegService;
  jest.isolateModules(() => {
    ({ FFmpegService } = require('../dist/services/ffmpeg.service'));
  });
  return FFmpegService;
}

function createBlobStore() {
  const blobMap = new Map();
  mockGetBlockBlobClient.mockImplementation((blobPath) => {
    if (!blobMap.has(blobPath)) {
      blobMap.set(blobPath, {
        url: `https://blob.local/${blobPath}`,
        uploadFile: jest.fn().mockResolvedValue(undefined),
        downloadToFile: jest.fn().mockResolvedValue(undefined),
      });
    }
    return blobMap.get(blobPath);
  });
  return blobMap;
}

describe('FFmpegService unit', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.AZURE_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.FFMPEG_PATH = '/custom/ffmpeg';
    process.env.TEMP_DIR = '/tmp/test-media';

    mockFfmpeg.__reset();
    mockFs.existsSync.mockReset();
    mockFs.mkdirSync.mockReset();
    mockFs.statSync.mockReset();
    mockFs.unlinkSync.mockReset();
    mockFromConnectionString.mockClear();
    mockGetContainerClient.mockClear();
    mockGetBlockBlobClient.mockReset();
    createBlobStore();
  });

  test('constructor configures ffmpeg path and creates temp dir when missing', () => {
    mockFs.existsSync.mockReturnValue(false);
    const FFmpegService = loadServiceClass();

    const service = new FFmpegService();

    expect(service).toBeTruthy();
    expect(mockFromConnectionString).toHaveBeenCalledWith('UseDevelopmentStorage=true');
    expect(mockGetContainerClient).toHaveBeenCalledWith('media-assets');
    expect(mockFfmpeg.setFfmpegPath).toHaveBeenCalledWith('/custom/ffmpeg');
    expect(mockFs.existsSync).toHaveBeenCalledWith('/tmp/test-media');
    expect(mockFs.mkdirSync).toHaveBeenCalledWith('/tmp/test-media', { recursive: true });
  });

  test('constructor skips temp dir creation when already present', () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();

    new FFmpegService();

    expect(mockFs.mkdirSync).not.toHaveBeenCalled();
  });

  test('throws on missing AZURE_BLOB_CONNECTION_STRING during module load', () => {
    delete process.env.AZURE_BLOB_CONNECTION_STRING;

    expect(() => loadServiceClass()).toThrow('AZURE_BLOB_CONNECTION_STRING is not set or empty');
  });

  test('processWebinarRecording orchestrates methods and returns combined assets', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    const downloadSpy = jest.spyOn(service, 'downloadBlob').mockResolvedValue(undefined);
    const transcodeSpy = jest.spyOn(service, 'transcodeWithBranding').mockResolvedValue({ type: 'full_replay' });
    const hlsSpy = jest.spyOn(service, 'generateHLS').mockResolvedValue([{ type: 'hls_1080p' }, { type: 'hls_720p' }]);
    const clipsSpy = jest.spyOn(service, 'generateHighlightClips').mockResolvedValue([{ type: 'clip_intro' }]);
    const audioSpy = jest.spyOn(service, 'extractAudio').mockResolvedValue({ type: 'podcast' });
    const thumbsSpy = jest.spyOn(service, 'generateThumbnails').mockResolvedValue([{ type: 'thumbnail' }]);
    const teaserSpy = jest.spyOn(service, 'generateSocialTeaser').mockResolvedValue({ type: 'social_teaser' });
    const cleanupSpy = jest.spyOn(service, 'cleanupTemp').mockImplementation(() => {});

    const result = await service.processWebinarRecording('sample.mp4', 'web-1', { title: 'T', presenter: 'P', date: '2026-03-01' });

    expect(downloadSpy).toHaveBeenCalledWith('sample.mp4', path.join('/tmp/test-media', 'web-1-raw.mp4'));
    expect(transcodeSpy).toHaveBeenCalled();
    expect(hlsSpy).toHaveBeenCalled();
    expect(clipsSpy).toHaveBeenCalled();
    expect(audioSpy).toHaveBeenCalled();
    expect(thumbsSpy).toHaveBeenCalled();
    expect(teaserSpy).toHaveBeenCalled();
    expect(cleanupSpy).toHaveBeenCalledWith('web-1');
    expect(result.assets).toHaveLength(7);
  });

  test('processWebinarRecording rejects when a stage fails and skips cleanup', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    jest.spyOn(service, 'downloadBlob').mockResolvedValue(undefined);
    jest.spyOn(service, 'transcodeWithBranding').mockRejectedValue(new Error('transcode failed'));
    const cleanupSpy = jest.spyOn(service, 'cleanupTemp').mockImplementation(() => {});

    await expect(service.processWebinarRecording('sample.mp4', 'web-2', { title: 'T', presenter: 'P', date: '2026-03-01' }))
      .rejects.toThrow('transcode failed');
    expect(cleanupSpy).not.toHaveBeenCalled();
  });

  test('transcodeWithBranding success path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 321 });
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockResolvedValue('https://blob/full-replay.mp4');

    const asset = await service.transcodeWithBranding('/tmp/in.mp4', 'w1', { title: 'x' });
    const cmd = mockFfmpeg.__getCommands()[0];

    expect(mockFfmpeg).toHaveBeenCalledWith('/tmp/in.mp4');
    expect(cmd.calls.audioFilters).toBe('loudnorm=I=-16:TP=-1.5:LRA=11');
    expect(cmd.calls.videoCodec).toBe('libx264');
    expect(cmd.calls.audioCodec).toBe('aac');
    expect(cmd.calls.outputOptions).toEqual(['-preset', 'medium', '-crf', '23', '-movflags', '+faststart']);
    expect(cmd.calls.output).toBe(path.join('/tmp/test-media', 'w1-branded.mp4'));
    expect(uploadSpy).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w1-branded.mp4'), 'webinars/w1/full-replay.mp4');
    expect(asset.type).toBe('full_replay');
    expect(asset.fileSize).toBe(321);
    expect(asset.format).toBe('mp4');
  });

  test('transcodeWithBranding failure path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('ffmpeg crash') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.transcodeWithBranding('/tmp/in.mp4', 'w2', {})).rejects.toThrow('ffmpeg crash');
  });

  test('generateHLS success with 4 variants and expected options', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockImplementation(async (_, blobPath) => `https://blob/${blobPath}`);

    const assets = await service.generateHLS('/tmp/in.mp4', 'w3');
    const cmds = mockFfmpeg.__getCommands();

    expect(assets).toHaveLength(4);
    expect(assets[0].type).toBe('hls_1080p');
    expect(assets[3].type).toBe('hls_360p');
    expect(uploadSpy).toHaveBeenCalledTimes(4);
    expect(mockFs.mkdirSync).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w3-hls'), { recursive: true });
    expect(cmds[0].calls.outputOptions).toContain('-hls_time');
    expect(cmds[0].calls.outputOptions).toContain('10');
    expect(cmds[0].calls.outputOptions).toContain('-hls_segment_filename');
    expect(cmds[0].calls.output).toContain(path.join('w3-hls', '1080p', 'playlist.m3u8'));
  });

  test('generateHLS failure when ffmpeg fails on variant generation', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('hls failed') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.generateHLS('/tmp/in.mp4', 'w4')).rejects.toThrow('hls failed');
  });

  test('extractAudio success path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFs.statSync.mockReturnValue({ size: 999 });
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockResolvedValue('https://blob/podcast.mp3');

    const asset = await service.extractAudio('/tmp/in.mp4', 'w5');
    const cmd = mockFfmpeg.__getCommands()[0];

    expect(cmd.calls.audioCodec).toBe('libmp3lame');
    expect(cmd.calls.audioFilters).toBe('loudnorm=I=-16:TP=-1.5:LRA=11');
    expect(uploadSpy).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w5-podcast.mp3'), 'webinars/w5/podcast.mp3');
    expect(asset.type).toBe('podcast');
    expect(asset.fileSize).toBe(999);
  });

  test('extractAudio failure path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('audio failed') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.extractAudio('/tmp/in.mp4', 'w6')).rejects.toThrow('audio failed');
  });

  test('generateThumbnails success generates 4 timestamped thumbnails', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockImplementation(async (_, blobPath) => `https://blob/${blobPath}`);

    const assets = await service.generateThumbnails('/tmp/in.mp4', 'w7');
    const cmds = mockFfmpeg.__getCommands();

    expect(assets).toHaveLength(4);
    expect(uploadSpy).toHaveBeenCalledTimes(4);
    expect(cmds[0].calls.seekInput).toBe('00:00:30');
    expect(cmds[1].calls.seekInput).toBe('00:05:00');
    expect(cmds[2].calls.seekInput).toBe('00:15:00');
    expect(cmds[3].calls.seekInput).toBe('00:25:00');
    expect(cmds[0].calls.frames).toBe(1);
    expect(cmds[0].calls.outputOptions).toEqual(['-vf', 'scale=1280:720']);
  });

  test('generateThumbnails failure path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('thumb failed') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.generateThumbnails('/tmp/in.mp4', 'w8')).rejects.toThrow('thumb failed');
  });

  test('generateSocialTeaser success path with 30s square output', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockResolvedValue('https://blob/teaser.mp4');

    const asset = await service.generateSocialTeaser('/tmp/in.mp4', 'w9');
    const cmd = mockFfmpeg.__getCommands()[0];

    expect(cmd.calls.seekInput).toBe('00:02:00');
    expect(cmd.calls.duration).toBe(30);
    expect(cmd.calls.videoFilters).toEqual(['crop=ih:ih', 'scale=1080:1080']);
    expect(uploadSpy).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w9-teaser.mp4'), 'webinars/w9/social-teaser.mp4');
    expect(asset.duration).toBe(30);
    expect(asset.resolution).toBe('1080x1080');
  });

  test('generateSocialTeaser failure path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('teaser failed') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.generateSocialTeaser('/tmp/in.mp4', 'w10')).rejects.toThrow('teaser failed');
  });

  test('generateHighlightClips success creates 4 chapter clips', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();
    const uploadSpy = jest.spyOn(service, 'uploadBlob').mockImplementation(async (_, blobPath) => `https://blob/${blobPath}`);

    const assets = await service.generateHighlightClips('/tmp/in.mp4', 'w11');
    const cmds = mockFfmpeg.__getCommands();

    expect(assets).toHaveLength(4);
    expect(assets[0].type).toBe('clip_intro');
    expect(assets[1].type).toBe('clip_core-demo');
    expect(assets[2].duration).toBe(300);
    expect(uploadSpy).toHaveBeenCalledTimes(4);
    expect(cmds[0].calls.seekInput).toBe('00:00:00');
    expect(cmds[1].calls.seekInput).toBe('00:05:00');
    expect(cmds[0].calls.duration).toBe(180);
    expect(cmds[1].calls.duration).toBe(300);
  });

  test('generateHighlightClips failure path', async () => {
    mockFs.existsSync.mockReturnValue(true);
    mockFfmpeg.__setRunOutcomes([{ type: 'error', error: new Error('clips failed') }]);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.generateHighlightClips('/tmp/in.mp4', 'w12')).rejects.toThrow('clips failed');
  });

  test('uploadBlob success and failure paths', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    const url = await service.uploadBlob('/tmp/a.mp4', 'webinars/w13/a.mp4');
    expect(url).toBe('https://blob.local/webinars/w13/a.mp4');

    const badBlob = {
      url: 'https://blob.local/bad',
      uploadFile: jest.fn().mockRejectedValue(new Error('upload failed')),
      downloadToFile: jest.fn().mockResolvedValue(undefined),
    };
    mockGetBlockBlobClient.mockReturnValueOnce(badBlob);

    await expect(service.uploadBlob('/tmp/b.mp4', 'webinars/w13/b.mp4')).rejects.toThrow('upload failed');
  });

  test('downloadBlob success and failure paths', async () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    await expect(service.downloadBlob('sample.mp4', '/tmp/w14-raw.mp4')).resolves.toBeUndefined();

    const badBlob = {
      url: 'https://blob.local/bad2',
      uploadFile: jest.fn().mockResolvedValue(undefined),
      downloadToFile: jest.fn().mockRejectedValue(new Error('download failed')),
    };
    mockGetBlockBlobClient.mockReturnValueOnce(badBlob);

    await expect(service.downloadBlob('sample.mp4', '/tmp/w14-raw2.mp4')).rejects.toThrow('download failed');
  });

  test('cleanupTemp removes only existing known temp files', () => {
    mockFs.existsSync.mockReturnValue(true);
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    const existing = new Set([
      path.join('/tmp/test-media', 'w15-raw.mp4'),
      path.join('/tmp/test-media', 'w15-teaser.mp4'),
    ]);
    mockFs.existsSync.mockImplementation((p) => existing.has(p));

    service.cleanupTemp('w15');

    expect(mockFs.existsSync).toHaveBeenCalledTimes(5);
    expect(mockFs.unlinkSync).toHaveBeenCalledTimes(2);
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w15-raw.mp4'));
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(path.join('/tmp/test-media', 'w15-teaser.mp4'));
  });
});

