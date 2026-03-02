// src/services/hubspot.service.ts
// HubSpot CRM integration — contacts, tasks, and lists

import axios, { AxiosInstance } from 'axios';
import { supademoConfig } from '../config/supademo.config';
import { HubSpotContactData } from '../models/demo-engagement.model';

interface TaskData {
  email: string;
  taskType: 'CALL' | 'EMAIL' | 'TODO';
  subject: string;
  notes: string;
  dueDate: Date;
  priority: 'HIGH' | 'MEDIUM' | 'LOW';
}

export class HubSpotService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: 'https://api.hubapi.com',
      headers: {
        Authorization: `Bearer ${supademoConfig.hubspot.apiKey}`,
        'Content-Type': 'application/json',
      },
    });
  }

  /**
   * Create or update a HubSpot contact with demo engagement data
   */
  async createOrUpdateContact(data: HubSpotContactData): Promise<{ id: string }> {
    try {
      const properties: Record<string, any> = {
        email: data.email,
        demo_viewed: data.demo_viewed ? 'true' : 'false',
        demo_name: data.demo_name,
        demo_type: data.demo_type,
        demo_last_viewed_date: data.demo_last_viewed_date,
      };

      if (data.firstname) properties.firstname = data.firstname;
      if (data.lastname) properties.lastname = data.lastname;
      if (data.company) properties.company = data.company;
      if (data.jobtitle) properties.jobtitle = data.jobtitle;
      if (data.demo_time_spent) properties.demo_time_spent = data.demo_time_spent;
      if (data.demo_completion_rate) properties.demo_completion_rate = data.demo_completion_rate;
      if (data.demo_lead_score) properties.demo_lead_score = data.demo_lead_score;
      if (data.is_government_prospect) properties.is_government_prospect = 'true';
      if (data.lead_magnet_downloaded) properties.lead_magnet_downloaded = data.lead_magnet_downloaded;
      if (data.landing_page_source) properties.landing_page_source = data.landing_page_source;

      // Try to create; if contact exists, update
      try {
        const response = await this.client.post('/crm/v3/objects/contacts', {
          properties,
        });
        console.log(`[HubSpot] Created contact: ${data.email}`);
        return { id: response.data.id };
      } catch (createError: any) {
        if (createError.response?.status === 409) {
          // Contact exists — update
          const existingId = createError.response.data?.message?.match(/ID: (\d+)/)?.[1];
          if (existingId) {
            await this.client.patch(`/crm/v3/objects/contacts/${existingId}`, {
              properties,
            });
            console.log(`[HubSpot] Updated contact: ${data.email}`);
            return { id: existingId };
          }
        }
        throw createError;
      }
    } catch (error: any) {
      console.error('[HubSpot] Contact sync error:', error.message);
      throw error;
    }
  }

  /**
   * Create a follow-up task for sales rep
   */
  async createTask(taskData: TaskData): Promise<{ id: string }> {
    try {
      const response = await this.client.post('/crm/v3/objects/tasks', {
        properties: {
          hs_task_subject: taskData.subject,
          hs_task_body: taskData.notes,
          hs_task_type: taskData.taskType,
          hs_task_priority: taskData.priority,
          hs_timestamp: taskData.dueDate.toISOString(),
        },
      });
      console.log(`[HubSpot] Created task: ${taskData.subject}`);
      return { id: response.data.id };
    } catch (error: any) {
      console.error('[HubSpot] Task creation error:', error.message);
      throw error;
    }
  }

  /**
   * Add contact to a HubSpot static list
   */
  async addToList(email: string, listId: string): Promise<void> {
    try {
      await this.client.post(`/contacts/v1/lists/${listId}/add`, {
        emails: [email],
      });
      console.log(`[HubSpot] Added ${email} to list ${listId}`);
    } catch (error: any) {
      console.error('[HubSpot] List add error:', error.message);
    }
  }
}
