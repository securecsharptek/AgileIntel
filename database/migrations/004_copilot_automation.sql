-- Migration 004: Microsoft Copilot Automation Tables — Agile Intel v3.0
CREATE TABLE CopilotDrafts (
    DraftId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DraftType NVARCHAR(50) NOT NULL,
    Topic NVARCHAR(255) NOT NULL,
    Content NVARCHAR(MAX) NOT NULL,
    WordCount INT DEFAULT 0,
    Status NVARCHAR(30) DEFAULT 'draft',
    ReviewedBy NVARCHAR(100) NULL,
    PublishedAt DATETIME2 NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_Drafts_Type (DraftType),
    INDEX IX_Drafts_Status (Status)
);

CREATE TABLE CopilotAgentLogs (
    LogId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    AgentId NVARCHAR(100) NOT NULL,
    UserQuery NVARCHAR(MAX) NOT NULL,
    AgentResponse NVARCHAR(MAX) NOT NULL,
    Confidence DECIMAL(5,2) DEFAULT 0,
    ResponseTime INT DEFAULT 0,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_AgentLogs_AgentId (AgentId)
);

CREATE TABLE MeetingSummaries (
    SummaryId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    MeetingId NVARCHAR(255) NOT NULL,
    Summary NVARCHAR(MAX) NOT NULL,
    ActionItems NVARCHAR(MAX) NULL,
    NextSteps NVARCHAR(MAX) NULL,
    DealId NVARCHAR(100) NULL,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    INDEX IX_Summaries_MeetingId (MeetingId)
);
PRINT 'Migration 004: Copilot automation tables created.';
