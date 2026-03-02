-- ============================================================================
-- Supademo Integration Database Schema v2.0
-- Platform: Azure SQL Database
-- Target: www.agileintel.io
-- ============================================================================

-- Table: SupademoDemos — Catalog of interactive demos
CREATE TABLE SupademoDemos (
    DemoId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    SupademoDemoId NVARCHAR(255) NOT NULL UNIQUE,
    DemoName NVARCHAR(255) NOT NULL,
    DemoType NVARCHAR(100) NOT NULL, -- core_platform | ai_agents | security | government
    DemoURL NVARCHAR(500) NOT NULL,
    EmbedCode NVARCHAR(MAX),
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    INDEX IX_SupademoDemos_DemoType (DemoType),
    INDEX IX_SupademoDemos_IsActive (IsActive)
);

-- Table: DemoEngagements — Individual prospect interactions
CREATE TABLE DemoEngagements (
    EngagementId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DemoId UNIQUEIDENTIFIER FOREIGN KEY REFERENCES SupademoDemos(DemoId),

    -- Prospect Information
    ProspectEmail NVARCHAR(255),
    ProspectName NVARCHAR(255),
    CompanyName NVARCHAR(255),
    ProspectRole NVARCHAR(100),

    -- Engagement Metrics (from Supademo webhook)
    ViewedAt DATETIME2 DEFAULT GETUTCDATE(),
    CompletedAt DATETIME2 NULL,
    TimeSpent INT NULL,                    -- seconds
    CompletionPercentage DECIMAL(5,2) NULL,
    StepsViewed INT NULL,

    -- Lead Scoring
    LeadScore INT NULL,                    -- 0-100
    IsHighIntent BIT DEFAULT 0,            -- score >= 50
    IsGovernmentProspect BIT DEFAULT 0,    -- .gov/.mil detection

    -- CRM Integration
    HubSpotContactId NVARCHAR(100) NULL,
    HubSpotSyncedAt DATETIME2 NULL,

    -- Source Tracking
    ReferralSource NVARCHAR(255) NULL,     -- website | email | partner | social
    LandingPage NVARCHAR(500) NULL,        -- which landing page drove this view
    UTMSource NVARCHAR(100) NULL,
    UTMMedium NVARCHAR(100) NULL,
    UTMCampaign NVARCHAR(100) NULL,
    UserAgent NVARCHAR(500) NULL,
    IPAddress NVARCHAR(50) NULL,

    INDEX IX_DemoEngagements_ProspectEmail (ProspectEmail),
    INDEX IX_DemoEngagements_ViewedAt (ViewedAt DESC),
    INDEX IX_DemoEngagements_LeadScore (LeadScore DESC),
    INDEX IX_DemoEngagements_IsHighIntent (IsHighIntent) WHERE IsHighIntent = 1,
    INDEX IX_DemoEngagements_IsGovProspect (IsGovernmentProspect) WHERE IsGovernmentProspect = 1,
    INDEX IX_DemoEngagements_LandingPage (LandingPage)
);

-- Table: DemoAnalytics — Aggregated daily metrics per demo
CREATE TABLE DemoAnalytics (
    AnalyticsId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    DemoId UNIQUEIDENTIFIER FOREIGN KEY REFERENCES SupademoDemos(DemoId),
    Date DATE NOT NULL,

    TotalViews INT DEFAULT 0,
    UniqueViewers INT DEFAULT 0,
    AvgTimeSpent INT DEFAULT 0,
    AvgCompletionRate DECIMAL(5,2) DEFAULT 0,
    HighIntentLeads INT DEFAULT 0,
    GovernmentLeads INT DEFAULT 0,

    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),

    UNIQUE (DemoId, Date)
);

-- Table: MarketingCampaigns — Track inbound campaign performance
CREATE TABLE MarketingCampaigns (
    CampaignId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CampaignName NVARCHAR(255) NOT NULL,
    CampaignType NVARCHAR(100) NOT NULL,   -- email | blog | webinar | whitepaper | social
    StartDate DATE NOT NULL,
    EndDate DATE NULL,
    Status NVARCHAR(50) DEFAULT 'draft',   -- draft | active | paused | completed

    -- Performance Metrics
    Impressions INT DEFAULT 0,
    Clicks INT DEFAULT 0,
    LeadsGenerated INT DEFAULT 0,
    DealsInfluenced INT DEFAULT 0,
    RevenueInfluenced DECIMAL(12,2) DEFAULT 0,

    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),
    UpdatedAt DATETIME2 DEFAULT GETUTCDATE(),

    INDEX IX_MarketingCampaigns_Status (Status),
    INDEX IX_MarketingCampaigns_Type (CampaignType)
);

-- Table: LeadMagnets — White papers, guides, and downloadable assets
CREATE TABLE LeadMagnets (
    MagnetId UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    MagnetName NVARCHAR(255) NOT NULL,
    MagnetType NVARCHAR(100) NOT NULL,     -- whitepaper | guide | calculator | checklist
    DownloadURL NVARCHAR(500) NOT NULL,
    LandingPageURL NVARCHAR(500),
    TotalDownloads INT DEFAULT 0,
    IsActive BIT DEFAULT 1,
    CreatedAt DATETIME2 DEFAULT GETUTCDATE(),

    INDEX IX_LeadMagnets_Type (MagnetType)
);

-- Seed: Initial demo records
INSERT INTO SupademoDemos (SupademoDemoId, DemoName, DemoType, DemoURL, EmbedCode) VALUES
('agile-intel-core', 'Agile Intel Core Platform', 'core_platform',
 'https://app.supademo.com/demo/agile-intel-core',
 '<iframe src="https://app.supademo.com/embed/agile-intel-core" width="100%" height="600px" frameborder="0" allowfullscreen></iframe>'),
('agile-intel-ai-agents', 'AI Agents Deep Dive', 'ai_agents',
 'https://app.supademo.com/demo/agile-intel-ai-agents',
 '<iframe src="https://app.supademo.com/embed/agile-intel-ai-agents" width="100%" height="600px" frameborder="0" allowfullscreen></iframe>'),
('agile-intel-security', 'Enterprise Security & FedRAMP', 'security',
 'https://app.supademo.com/demo/agile-intel-security',
 '<iframe src="https://app.supademo.com/embed/agile-intel-security" width="100%" height="600px" frameborder="0" allowfullscreen></iframe>'),
('agile-intel-government', 'Government/FedRAMP Compliance', 'government',
 'https://app.supademo.com/demo/agile-intel-government',
 '<iframe src="https://app.supademo.com/embed/agile-intel-government" width="100%" height="600px" frameborder="0" allowfullscreen></iframe>');

-- Seed: Lead magnets
INSERT INTO LeadMagnets (MagnetName, MagnetType, DownloadURL, LandingPageURL) VALUES
('AI-Powered Sprint Management: The Complete Guide', 'whitepaper',
 '/assets/whitepapers/ai-sprint-management-guide.pdf', '/ai-agents-guide'),
('Government Agency Guide to FedRAMP-Compliant Agile Tools', 'whitepaper',
 '/assets/whitepapers/fedramp-agile-guide.pdf', '/government-agile-guide'),
('37 AI Agents ROI Calculator', 'calculator',
 '/assets/tools/roi-calculator.html', '/roi-calculator');

PRINT '✅ Supademo integration schema v2.0 created successfully!';
