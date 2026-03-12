// config/supademo.config.ts
// Unified configuration for Supademo + Marketing Integration

export interface DemoConfig {
  id: string;
  supademoId: string;
  name: string;
  embedUrl: string;
  directUrl: string;
  type: 'core_platform' | 'ai_agents' | 'security' | 'government';
}

export const supademoConfig = {
  // Supademo API credentials
  apiKey: process.env.SUPADEMO_API_KEY || '',
  workspaceId: process.env.SUPADEMO_WORKSPACE_ID || '',

  // Webhook configuration
  webhookSecret: process.env.SUPADEMO_WEBHOOK_SECRET || '',
  webhookEndpoint: '/api/webhooks/supademo',

  // Demo catalog
  demos: {
    corePlatform: {
      id: 'demo-001',
      supademoId: 'agile-intel-core',
      name: 'Agile Intel Core Platform',
      embedUrl: 'https://app.supademo.com/embed/agile-intel-core',
      directUrl: 'https://app.supademo.com/demo/agile-intel-core',
      type: 'core_platform' as const,
    },
    aiAgents: {
      id: 'demo-002',
      supademoId: 'agile-intel-ai-agents',
      name: 'AI Agents Deep Dive',
      embedUrl: 'https://app.supademo.com/embed/agile-intel-ai-agents',
      directUrl: 'https://app.supademo.com/demo/agile-intel-ai-agents',
      type: 'ai_agents' as const,
    },
    security: {
      id: 'demo-003',
      supademoId: 'agile-intel-security',
      name: 'Enterprise Security & FedRAMP',
      embedUrl: 'https://app.supademo.com/embed/agile-intel-security',
      directUrl: 'https://app.supademo.com/demo/agile-intel-security',
      type: 'security' as const,
    },
    government: {
      id: 'demo-004',
      supademoId: 'agile-intel-government',
      name: 'Government/FedRAMP Compliance',
      embedUrl: 'https://app.supademo.com/embed/agile-intel-government',
      directUrl: 'https://app.supademo.com/demo/agile-intel-government',
      type: 'government' as const,
    },
  },

  // Lead scoring weights
  leadScoring: {
    // v2.0 (3-dimension) weights - used when no video data available
    timeWeight: 0.4,         // 40% — time spent viewing
    completionWeight: 0.35,  // 35% — percentage of demo completed
    stepsWeight: 0.25,       // 25% — number of steps interacted with
    
    // v3.0 (4-dimension) weights - used when video engagement data exists
    timeWeightV3: 0.30,      // 30% — time spent viewing (reduced from 40%)
    completionWeightV3: 0.25, // 25% — percentage of demo completed (reduced from 35%)
    stepsWeightV3: 0.20,     // 20% — number of steps interacted with (reduced from 25%)
    videoWeight: 0.25,       // 25% — video engagement score (NEW in v3.0)
    
    highIntentThreshold: 50, // score >= 50 triggers high-intent flow
    govHighIntentThreshold: 70, // higher bar for government prospects
  },

  // Government detection patterns
  governmentDomains: [
    '.gov', '.mil', '.us',
    '.state.', '.city.', '.county.',
    '.fed.us', '.nsn.us',
  ],

  // HubSpot integration
  hubspot: {
    enabled: true,
    apiKey: process.env.HUBSPOT_API_KEY || '',
    portalId: process.env.HUBSPOT_PORTAL_ID || '',
    syncOnView: true,
    syncOnComplete: true,
    createTaskForHighIntent: true,
    hotLeadsListId: process.env.HUBSPOT_HOT_LEADS_LIST_ID || '',
    govProspectsListId: process.env.HUBSPOT_GOV_PROSPECTS_LIST_ID || '',
  },

  // Slack notifications
  slack: {
    enabled: !!process.env.SLACK_WEBHOOK_URL,
    webhookUrl: process.env.SLACK_WEBHOOK_URL || '',
    channel: '#sales-hot-leads',
  },

  // Landing pages
  landingPages: {
    demoRequest: '/demo-request',
    aiAgentsGuide: '/ai-agents-guide',
    govGuide: '/government-agile-guide',
    roiCalculator: '/roi-calculator',
    webinar: '/monthly-demo-webinar',
    freeTrial: '/start-trial',
  },
};
