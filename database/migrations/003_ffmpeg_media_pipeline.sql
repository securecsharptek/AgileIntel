-- Migration 003: FFmpeg Media Pipeline Tables — Agile Intel v3.0
-- Idempotent: Safe to re-run

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'MediaAssets')
BEGIN
  CREATE TABLE MediaAssets (
    AssetId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WebinarId NVARCHAR(100) NOT NULL,
    AssetType NVARCHAR(50) NOT NULL,
    BlobURL NVARCHAR(500) NOT NULL,
    FileSize BIGINT DEFAULT 0,
    Duration INT DEFAULT 0,
    Resolution NVARCHAR(20),
    Format NVARCHAR(20),
    ProcessedAt DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_MediaAssets_WebinarId (WebinarId),
    INDEX IX_MediaAssets_AssetType (AssetType)
  );
END;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'VideoEngagements')
BEGIN
  CREATE TABLE VideoEngagements (
    VideoEngagementId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AssetId UNIQUEIDENTIFIER FOREIGN KEY REFERENCES MediaAssets(AssetId),
    ProspectEmail NVARCHAR(255),
    WatchDuration INT DEFAULT 0,
    WatchPercentage DECIMAL(5,2) DEFAULT 0,
    SegmentsWatched NVARCHAR(MAX),
    RewatchCount INT DEFAULT 0,
    DeviceType NVARCHAR(50),
    ViewedAt DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_VideoEng_Email (ProspectEmail),
    INDEX IX_VideoEng_AssetId (AssetId)
  );
END;
GO

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ProcessingJobs')
BEGIN
  CREATE TABLE ProcessingJobs (
    JobId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    WebinarId NVARCHAR(100) NOT NULL,
    Status NVARCHAR(30) DEFAULT 'queued',
    SourceBlob NVARCHAR(500) NOT NULL,
    AssetsCreated INT DEFAULT 0,
    ErrorMessage NVARCHAR(MAX) NULL,
    QueuedAt DATETIME2 DEFAULT GETUTCDATE(),
    StartedAt DATETIME2 NULL,
    CompletedAt DATETIME2 NULL,
    INDEX IX_Jobs_Status (Status),
    INDEX IX_Jobs_WebinarId (WebinarId)
  );
END;
GO

PRINT 'Migration 003: FFmpeg media pipeline tables created or verified.';
