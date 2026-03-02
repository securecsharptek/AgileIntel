// src/models/demo-engagement.model.ts
// Data models for the Supademo integration

export interface DemoEngagement {
  demoId: string;
  supademoId: string;
  prospectEmail?: string;
  prospectName?: string;
  companyName?: string;
  prospectRole?: string;
  timeSpent?: number;          // seconds
  completionPercentage?: number;
  stepsViewed?: number;
  referralSource?: string;
  landingPage?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface LeadScore {
  engagementId: string;
  score: number;               // 0-100
  isHighIntent: boolean;       // score >= threshold
  isGovernmentProspect: boolean;
  breakdown: {
    timeScore: number;
    completionScore: number;
    stepsScore: number;
  };
}

export interface HubSpotContactData {
  email: string;
  firstname?: string;
  lastname?: string;
  company?: string;
  jobtitle?: string;
  demo_viewed: boolean;
  demo_name: string;
  demo_type: string;
  demo_last_viewed_date: string;
  demo_time_spent?: number;
  demo_completion_rate?: number;
  demo_lead_score?: number;
  is_government_prospect?: boolean;
  lead_magnet_downloaded?: string;
  landing_page_source?: string;
}

export interface SlackNotification {
  email?: string;
  name?: string;
  company?: string;
  score: number;
  demoType: string;
  isGovernment: boolean;
}

export interface DemoAnalyticsResult {
  totalViews: number;
  uniqueViewers: number;
  avgTimeSpent: number;
  avgCompletionRate: number;
  highIntentLeads: number;
  governmentLeads: number;
  avgLeadScore: number;
  topReferralSources: { source: string; count: number }[];
  topLandingPages: { page: string; count: number }[];
}

export interface WebhookEvent {
  event: 'demo.viewed' | 'demo.completed' | 'demo.step_viewed';
  data: {
    demo_id: string;
    viewer?: {
      email?: string;
      name?: string;
      company?: string;
    };
    time_spent?: number;
    steps_viewed?: number;
    step_number?: number;
    total_steps?: number;
    referrer?: string;
    user_agent?: string;
    ip_address?: string;
  };
}
