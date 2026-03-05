const path = require('path');

const commandRecords = [];

const mockFfmpeg = jest.fn((source) => {
  const handlers = {};
  const record = { source, calls: {} };
  commandRecords.push(record);

  const cmd = {
    audioFilters: jest.fn(() => cmd),
    videoCodec: jest.fn(() => cmd),
    audioCodec: jest.fn(() => cmd),
    outputOptions: jest.fn(() => cmd),
    output: jest.fn((v) => { record.calls.output = v; return cmd; }),
    on: jest.fn((event, cb) => { handlers[event] = cb; return cmd; }),
    run: jest.fn(() => { setImmediate(() => handlers.end && handlers.end()); return cmd; }),
    noVideo: jest.fn(() => cmd),
    audioChannels: jest.fn(() => cmd),
    audioBitrate: jest.fn(() => cmd),
    seekInput: jest.fn(() => cmd),
    frames: jest.fn(() => cmd),
    duration: jest.fn(() => cmd),
    videoFilters: jest.fn(() => cmd),
  };

  return cmd;
});
mockFfmpeg.setFfmpegPath = jest.fn();

const mockFs = {
  existsSync: jest.fn(() => true),
  mkdirSync: jest.fn(),
  statSync: jest.fn(() => ({ size: 1234 })),
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

describe('FFmpegService integration-style orchestrator', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.AZURE_BLOB_CONNECTION_STRING = 'UseDevelopmentStorage=true';
    process.env.FFMPEG_PATH = '/custom/ffmpeg';
    process.env.TEMP_DIR = '/tmp/test-media';

    mockFfmpeg.mockClear();
    mockFfmpeg.setFfmpegPath.mockClear();
    commandRecords.length = 0;
    mockGetBlockBlobClient.mockReset();

    mockGetBlockBlobClient.mockImplementation((blobPath) => ({
      url: `https://blob.local/${blobPath}`,
      uploadFile: jest.fn().mockResolvedValue(undefined),
      downloadToFile: jest.fn().mockResolvedValue(undefined),
    }));
  });

  test('processWebinarRecording builds expected asset structure from sample.mp4', async () => {
    const FFmpegService = loadServiceClass();
    const service = new FFmpegService();

    const result = await service.processWebinarRecording(
      'sample.mp4',
      'webinar-200',
      { title: 'Week 2', presenter: 'Architect', date: '2026-03-01' }
    );

    expect(result).toBeDefined();
    expect(Array.isArray(result.assets)).toBe(true);
    expect(result.assets).toHaveLength(15);

    const types = result.assets.map((a) => a.type);
    expect(types).toContain('full_replay');
    expect(types).toContain('podcast');
    expect(types).toContain('social_teaser');
    expect(types.filter((t) => t.startsWith('hls_'))).toHaveLength(4);
    expect(types.filter((t) => t.startsWith('clip_'))).toHaveLength(4);
    expect(types.filter((t) => t === 'thumbnail')).toHaveLength(4);

    expect(result.assets.every((a) => a.blobUrl.startsWith('https://blob.local/'))).toBe(true);
    expect(commandRecords).toHaveLength(15);

    const hlsUploads = mockGetBlockBlobClient.mock.calls
      .map((c) => c[0])
      .filter((blobPath) => blobPath.includes('/hls/'));
    expect(hlsUploads).toHaveLength(4);

    const masterPlaylistUpload = mockGetBlockBlobClient.mock.calls
      .map((c) => c[0])
      .find((blobPath) => /\/hls\/master\.m3u8$/.test(blobPath));
    expect(masterPlaylistUpload).toBeUndefined();

    const rawTempFile = path.join('/tmp/test-media', 'webinar-200-raw.mp4');
    expect(mockFs.unlinkSync).toHaveBeenCalledWith(rawTempFile);
  });
});

