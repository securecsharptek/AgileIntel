// src/services/copilot.service.ts
// Microsoft Copilot Automation for Agile Intel v3.0
// NEW in v3.0 — content generation, sales outreach, meeting summaries, agent queries

import axios, { AxiosInstance } from 'axios';
import sql from 'mssql';

export class CopilotService {
  private graphClient: AxiosInstance;
  private studioClient: AxiosInstance;

  constructor() {
    this.graphClient = axios.create({
      baseURL: 'https://graph.microsoft.com/v1.0',
      headers: {
        Authorization: `Bearer ${process.env.COPILOT_GRAPH_TOKEN}`,
        'Content-Type': 'application/json',
      },
    });
    this.studioClient = axios.create({
      baseURL: process.env.COPILOT_STUDIO_ENDPOINT || '',
      headers: {
        'api-key': process.env.COPILOT_STUDIO_API_KEY || '',
        'Content-Type': 'application/json',
      },
    });
  }

  async generateBlogDraft(
    topic: string, keywords: string[], targetLength: number = 1500
  ): Promise<CopilotDraft> {
    const prompt = `Write a ${targetLength}-word blog post for Agile Intel (www.agileintel.io), an AI-powered sprint management SaaS. Topic: ${topic}. Keywords: ${keywords.join(', ')}. Tone: Professional, data-driven. Include CTA to /demo-request.`;
    const response = await this.graphClient.post('/me/copilot/generate', {
      prompt, type: 'blog_post', maxTokens: targetLength * 2,
    });
    return {
      type: 'blog_post', topic, content: response.data.content,
      wordCount: response.data.content.split(' ').length,
      generatedAt: new Date().toISOString(),
    };
  }

  async generateSalesEmail(prospectData: {
    name: string; company: string; demoType: string;
    completionRate: number; timeSpent: number; score: number;
  }): Promise<CopilotDraft> {
    const prompt = `Draft a personalized sales follow-up email for Agile Intel. Prospect: ${prospectData.name} at ${prospectData.company}. They viewed the ${prospectData.demoType} demo, completing ${prospectData.completionRate}% in ${Math.round(prospectData.timeSpent / 60)} minutes (score: ${prospectData.score}/100). Reference specific features. Include meeting CTA. Under 200 words.`;
    const response = await this.graphClient.post('/me/copilot/generate', {
      prompt, type: 'sales_email', maxTokens: 500,
    });
    return {
      type: 'sales_email', topic: `Follow-up: ${prospectData.company}`,
      content: response.data.content,
      wordCount: response.data.content.split(' ').length,
      generatedAt: new Date().toISOString(),
    };
  }

  async generateMeetingSummary(meetingId: string): Promise<MeetingSummary> {
    const transcript = await this.graphClient.get(
      `/me/onlineMeetings/${meetingId}/transcripts`
    );
    const summary = await this.graphClient.post('/me/copilot/summarize', {
      content: transcript.data.value[0]?.content || '',
      type: 'meeting_summary', extractActions: true,
    });
    return {
      meetingId, summary: summary.data.summary,
      actionItems: summary.data.actionItems || [],
      nextSteps: summary.data.nextSteps || [],
      generatedAt: new Date().toISOString(),
    };
  }

  async queryLeadIntelligence(query: string): Promise<AgentResponse> {
    const response = await this.studioClient.post('/agents/lead-intel/query', {
      message: query,
      context: { platform: 'agileintel', dataSource: 'azure_sql' },
    });
    return {
      reply: response.data.reply,
      sources: response.data.sources || [],
      confidence: response.data.confidence || 0,
    };
  }
}

interface CopilotDraft {
  type: string; topic: string; content: string;
  wordCount: number; generatedAt: string;
}
interface MeetingSummary {
  meetingId: string; summary: string;
  actionItems: string[]; nextSteps: string[];
  generatedAt: string;
}
interface AgentResponse {
  reply: string; sources: string[]; confidence: number;
}
