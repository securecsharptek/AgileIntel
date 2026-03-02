// src/services/supademo.service.ts
// Core business logic — demo tracking, lead scoring, CRM sync, notifications

import axios from 'axios';
import sql from 'mssql';
import { supademoConfig } from '../config/supademo.config';
import { HubSpotService } from './hubspot.service';
import {
  DemoEngagement,
  LeadScore,
  SlackNotification,
  DemoAnalyticsResult,
} from '../models/demo-engagement.model';

// Database connection pool (initialized once)
const poolPromise = new sql.ConnectionPool({
  server: process.env.AZURE_SQL_SERVER || '',
  database: process.env.AZURE_SQL_DATABASE || '',
  user: process.env.AZURE_SQL_USER || '',
  password: process.env.AZURE_SQL_PASSWORD || '',
  options: { encrypt: true, trustServerCertificate: false },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
}).connect();

export class SupademoService {
  private hubspotService: HubSpotService;

  constructor() {
    this.hubspotService = new HubSpotService();
  }

  // ---------------------------------------------------------------------------
  // DEMO VIEW TRACKING
  // ---------------------------------------------------------------------------

  async trackDemoView(engagement: DemoEngagement): Promise<string> {
    const pool = await poolPromise;

    try {
      // Resolve internal DemoId from Supademo's demo ID
      const demoResult = await pool.request()
        .input('supademoId', sql.NVarChar, engagement.supademoId)
        .query(`
          SELECT DemoId, DemoName, DemoType
          FROM SupademoDemos
          WHERE SupademoDemoId = @supademoId
        `);

      if (demoResult.recordset.length === 0) {
        throw new Error(`Demo not found: ${engagement.supademoId}`);
      }

      const demo = demoResult.recordset[0];
      const isGov = this.isGovernmentEmail(engagement.prospectEmail);

      // Insert engagement record
      const insertResult = await pool.request()
        .input('demoId', sql.UniqueIdentifier, demo.DemoId)
        .input('prospectEmail', sql.NVarChar, engagement.prospectEmail)
        .input('prospectName', sql.NVarChar, engagement.prospectName)
        .input('companyName', sql.NVarChar, engagement.companyName)
        .input('prospectRole', sql.NVarChar, engagement.prospectRole)
        .input('timeSpent', sql.Int, engagement.timeSpent)
        .input('completionPercentage', sql.Decimal(5, 2), engagement.completionPercentage)
        .input('stepsViewed', sql.Int, engagement.stepsViewed)
        .input('isGov', sql.Bit, isGov)
        .input('referralSource', sql.NVarChar, engagement.referralSource)
        .input('landingPage', sql.NVarChar, engagement.landingPage)
        .input('utmSource', sql.NVarChar, engagement.utmSource)
        .input('utmMedium', sql.NVarChar, engagement.utmMedium)
        .input('utmCampaign', sql.NVarChar, engagement.utmCampaign)
        .input('userAgent', sql.NVarChar, engagement.userAgent)
        .input('ipAddress', sql.NVarChar, engagement.ipAddress)
        .query(`
          INSERT INTO DemoEngagements (
            DemoId, ProspectEmail, ProspectName, CompanyName, ProspectRole,
            TimeSpent, CompletionPercentage, StepsViewed, IsGovernmentProspect,
            ReferralSource, LandingPage, UTMSource, UTMMedium, UTMCampaign,
            UserAgent, IPAddress
          )
          OUTPUT INSERTED.EngagementId
          VALUES (
            @demoId, @prospectEmail, @prospectName, @companyName, @prospectRole,
            @timeSpent, @completionPercentage, @stepsViewed, @isGov,
            @referralSource, @landingPage, @utmSource, @utmMedium, @utmCampaign,
            @userAgent, @ipAddress
          )
        `);

      const engagementId = insertResult.recordset[0].EngagementId;

      // Calculate lead score if we have metrics
      if (engagement.timeSpent || engagement.completionPercentage || engagement.stepsViewed) {
        await this.calculateLeadScore(engagementId, engagement, isGov);
      }

      // Sync to HubSpot if email provided
      if (engagement.prospectEmail && supademoConfig.hubspot.syncOnView) {
        await this.syncToHubSpot(engagementId, engagement, demo, isGov);
      }

      return engagementId;
    } catch (error) {
      console.error('[SupademoService] Error tracking demo view:', error);
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // LEAD SCORING
  // ---------------------------------------------------------------------------

  async calculateLeadScore(
    engagementId: string,
    engagement: DemoEngagement,
    isGovernment: boolean
  ): Promise<LeadScore> {
    const pool = await poolPromise;
    const { timeWeight, completionWeight, stepsWeight, highIntentThreshold, govHighIntentThreshold } =
      supademoConfig.leadScoring;

    // Normalize metrics to 0-100 scale
    const timeScore = Math.min(((engagement.timeSpent || 0) / 600) * 100, 100);       // 10 min = max
    const completionScore = engagement.completionPercentage || 0;                       // Already 0-100
    const stepsScore = Math.min(((engagement.stepsViewed || 0) / 10) * 100, 100);      // 10 steps = max

    // Weighted score
    const score = Math.round(
      timeScore * timeWeight +
      completionScore * completionWeight +
      stepsScore * stepsWeight
    );

    const threshold = isGovernment ? govHighIntentThreshold : highIntentThreshold;
    const isHighIntent = score >= threshold;

    // Persist
    await pool.request()
      .input('engagementId', sql.UniqueIdentifier, engagementId)
      .input('leadScore', sql.Int, score)
      .input('isHighIntent', sql.Bit, isHighIntent)
      .query(`
        UPDATE DemoEngagements
        SET LeadScore = @leadScore, IsHighIntent = @isHighIntent
        WHERE EngagementId = @engagementId
      `);

    // Trigger high-intent flow
    if (isHighIntent) {
      await this.handleHighIntentLead(engagementId, engagement, score, isGovernment);
    }

    return {
      engagementId,
      score,
      isHighIntent,
      isGovernmentProspect: isGovernment,
      breakdown: { timeScore, completionScore, stepsScore },
    };
  }

  // ---------------------------------------------------------------------------
  // HIGH-INTENT LEAD HANDLING
  // ---------------------------------------------------------------------------

  async handleHighIntentLead(
    engagementId: string,
    engagement: DemoEngagement,
    score: number,
    isGovernment: boolean
  ): Promise<void> {
    console.log(`🔥 High-intent lead: ${engagement.prospectEmail} (Score: ${score}${isGovernment ? ', GOV' : ''})`);

    // Create HubSpot follow-up task
    if (supademoConfig.hubspot.createTaskForHighIntent && engagement.prospectEmail) {
      const specialist = isGovernment ? 'federal sales specialist' : 'sales representative';
      await this.hubspotService.createTask({
        email: engagement.prospectEmail,
        taskType: 'CALL',
        subject: `${isGovernment ? '🏛️ GOV ' : ''}High-intent demo lead: ${engagement.prospectName || engagement.prospectEmail}`,
        notes: [
          `Prospect engaged with demo (Score: ${score}/100)`,
          `Company: ${engagement.companyName || 'Unknown'}`,
          `Demo: ${engagement.supademoId}`,
          isGovernment ? 'GOVERNMENT PROSPECT — Route to federal team' : '',
          `Follow up within 24 hours.`,
        ].filter(Boolean).join('\n'),
        dueDate: new Date(Date.now() + 86400000), // +24 hours
        priority: score >= 75 ? 'HIGH' : 'MEDIUM',
      });

      // Add to appropriate list
      const listId = isGovernment
        ? supademoConfig.hubspot.govProspectsListId
        : supademoConfig.hubspot.hotLeadsListId;
      if (listId) {
        await this.hubspotService.addToList(engagement.prospectEmail, listId);
      }
    }

    // Slack notification
    if (supademoConfig.slack.enabled) {
      await this.sendSlackNotification({
        email: engagement.prospectEmail,
        name: engagement.prospectName,
        company: engagement.companyName,
        score,
        demoType: engagement.supademoId,
        isGovernment,
      });
    }
  }

  // ---------------------------------------------------------------------------
  // GOVERNMENT DETECTION
  // ---------------------------------------------------------------------------

  isGovernmentEmail(email?: string): boolean {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase() || '';
    return supademoConfig.governmentDomains.some((suffix) => domain.endsWith(suffix));
  }

  // ---------------------------------------------------------------------------
  // HUBSPOT SYNC
  // ---------------------------------------------------------------------------

  async syncToHubSpot(
    engagementId: string,
    engagement: DemoEngagement,
    demo: any,
    isGovernment: boolean
  ): Promise<void> {
    const pool = await poolPromise;

    try {
      const nameParts = (engagement.prospectName || '').split(' ');
      const contact = await this.hubspotService.createOrUpdateContact({
        email: engagement.prospectEmail!,
        firstname: nameParts[0],
        lastname: nameParts.slice(1).join(' '),
        company: engagement.companyName,
        jobtitle: engagement.prospectRole,
        demo_viewed: true,
        demo_name: demo.DemoName,
        demo_type: demo.DemoType,
        demo_last_viewed_date: new Date().toISOString(),
        demo_time_spent: engagement.timeSpent,
        demo_completion_rate: engagement.completionPercentage,
        is_government_prospect: isGovernment,
        landing_page_source: engagement.landingPage,
      });

      await pool.request()
        .input('engagementId', sql.UniqueIdentifier, engagementId)
        .input('hubspotContactId', sql.NVarChar, contact.id)
        .query(`
          UPDATE DemoEngagements
          SET HubSpotContactId = @hubspotContactId, HubSpotSyncedAt = GETUTCDATE()
          WHERE EngagementId = @engagementId
        `);

      console.log(`[HubSpot] Synced: ${engagement.prospectEmail}`);
    } catch (error) {
      console.error('[HubSpot] Sync error (non-blocking):', error);
      // Non-blocking — engagement tracking succeeds even if HubSpot fails
    }
  }

  // ---------------------------------------------------------------------------
  // SLACK NOTIFICATIONS
  // ---------------------------------------------------------------------------

  async sendSlackNotification(data: SlackNotification): Promise<void> {
    try {
      const emoji = data.isGovernment ? '🏛️' : '🔥';
      const label = data.isGovernment ? 'GOV High-Intent Demo Lead' : 'High-Intent Demo Lead';

      await axios.post(supademoConfig.slack.webhookUrl, {
        text: `${emoji} *${label}*`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: [
                `*${emoji} ${label} Detected*`,
                '',
                `*Email:* ${data.email || 'Unknown'}`,
                `*Name:* ${data.name || 'Unknown'}`,
                `*Company:* ${data.company || 'Unknown'}`,
                `*Lead Score:* ${data.score}/100`,
                `*Demo:* ${data.demoType}`,
                data.isGovernment ? '*🏛️ GOVERNMENT PROSPECT*' : '',
              ].filter(Boolean).join('\n'),
            },
          },
          {
            type: 'actions',
            elements: [
              {
                type: 'button',
                text: { type: 'plain_text', text: 'View in HubSpot' },
                url: `https://app.hubspot.com/contacts/search?query=${encodeURIComponent(data.email || '')}`,
                style: 'primary',
              },
            ],
          },
        ],
      });
    } catch (error) {
      console.error('[Slack] Notification error:', error);
    }
  }

  // ---------------------------------------------------------------------------
  // ANALYTICS
  // ---------------------------------------------------------------------------

  async getDemoAnalytics(
    demoId?: string,
    startDate?: Date,
    endDate?: Date
  ): Promise<DemoAnalyticsResult> {
    const pool = await poolPromise;
    const request = pool.request();

    let whereClause = 'WHERE 1=1';
    if (demoId) {
      request.input('demoId', sql.UniqueIdentifier, demoId);
      whereClause += ' AND DemoId = @demoId';
    }
    if (startDate) {
      request.input('startDate', sql.DateTime2, startDate);
      whereClause += ' AND ViewedAt >= @startDate';
    }
    if (endDate) {
      request.input('endDate', sql.DateTime2, endDate);
      whereClause += ' AND ViewedAt <= @endDate';
    }

    const result = await request.query(`
      SELECT
        COUNT(*) as TotalViews,
        COUNT(DISTINCT ProspectEmail) as UniqueViewers,
        AVG(TimeSpent) as AvgTimeSpent,
        AVG(CompletionPercentage) as AvgCompletionRate,
        SUM(CASE WHEN IsHighIntent = 1 THEN 1 ELSE 0 END) as HighIntentLeads,
        SUM(CASE WHEN IsGovernmentProspect = 1 THEN 1 ELSE 0 END) as GovernmentLeads,
        AVG(LeadScore) as AvgLeadScore
      FROM DemoEngagements
      ${whereClause}
    `);

    const row = result.recordset[0];
    return {
      totalViews: row.TotalViews,
      uniqueViewers: row.UniqueViewers,
      avgTimeSpent: row.AvgTimeSpent || 0,
      avgCompletionRate: row.AvgCompletionRate || 0,
      highIntentLeads: row.HighIntentLeads,
      governmentLeads: row.GovernmentLeads,
      avgLeadScore: row.AvgLeadScore || 0,
      topReferralSources: [],
      topLandingPages: [],
    };
  }

  async listDemos(): Promise<any[]> {
    const pool = await poolPromise;
    const result = await pool.request().query(`
      SELECT
        d.DemoId, d.SupademoDemoId, d.DemoName, d.DemoType,
        d.DemoURL, d.EmbedCode, d.IsActive,
        COUNT(e.EngagementId) as TotalViews,
        AVG(e.CompletionPercentage) as AvgCompletionRate
      FROM SupademoDemos d
      LEFT JOIN DemoEngagements e ON d.DemoId = e.DemoId
      WHERE d.IsActive = 1
      GROUP BY d.DemoId, d.SupademoDemoId, d.DemoName, d.DemoType,
               d.DemoURL, d.EmbedCode, d.IsActive
      ORDER BY d.DemoName
    `);
    return result.recordset;
  }
}
