import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';

@Injectable()
export class ZohoDeskService {
  private readonly logger = new Logger(ZohoDeskService.name);
  private axiosInstance: AxiosInstance;

  private clientId: string;
  private clientSecret: string;
  private refreshToken: string;
  private orgId: string;
  private apiDomain: string;

  private accessToken: string | null = null;
  private tokenExpiresAt = 0;
  private isRefreshing = false;
  private refreshPromise: Promise<void> | null = null;

  constructor(private configService: ConfigService) {
    this.clientId = this.configService.get<string>('ZOHO_CLIENT_ID') || '';
    this.clientSecret = this.configService.get<string>('ZOHO_CLIENT_SECRET') || '';
    this.refreshToken = this.configService.get<string>('ZOHO_REFRESH_TOKEN') || '';
    this.orgId = this.configService.get<string>('ZOHO_ORG_ID') || '';
    this.apiDomain = this.configService.get<string>('ZOHO_API_DOMAIN') || 'https://desk.zoho.in';

    if (!this.clientId || !this.clientSecret || !this.refreshToken || !this.orgId) {
      throw new Error('Missing required Zoho Desk configuration');
    }

    this.axiosInstance = axios.create({
      baseURL: `${this.apiDomain}/api/v1`,
      headers: {
        orgId: this.orgId,
      },
    });

    this.refreshAccessToken();
  }

  private async ensureValidToken(): Promise<void> {
    const now = Date.now();
    if (this.accessToken && this.tokenExpiresAt > now) return;

    if (this.isRefreshing && this.refreshPromise) {
      await this.refreshPromise;
      return;
    }

    await this.refreshAccessToken();
  }

  private async refreshAccessToken(): Promise<void> {
    if (this.isRefreshing) {
      return this.refreshPromise || Promise.resolve();
    }

    this.isRefreshing = true;
    this.refreshPromise = (async () => {
      try {
        this.logger.log('🔄 Refreshing Zoho Desk access token...');

        const response = await axios.post(
          'https://accounts.zoho.in/oauth/v2/token',
          null,
          {
            params: {
              refresh_token: this.refreshToken,
              client_id: this.clientId,
              client_secret: this.clientSecret,
              grant_type: 'refresh_token',
            },
          },
        );

        const { access_token, expires_in } = response.data;

        this.accessToken = access_token;
        this.tokenExpiresAt = Date.now() + (expires_in - 300) * 1000;
        this.axiosInstance.defaults.headers.common.Authorization = `Zoho-oauthtoken ${access_token}`;

        this.logger.log('✅ Zoho Desk access token refreshed successfully');
      } catch (error: any) {
        this.logger.error('❌ Failed to refresh Zoho access token:', error.message);
        throw error;
      } finally {
        this.isRefreshing = false;
        this.refreshPromise = null;
      }
    })();

    return this.refreshPromise;
  }

  // ---------- CONTACT HELPERS (synthetic email) ----------

private buildSyntheticEmail(name: string, phone: string): string {
  const safePhone = (phone || '').replace(/\D/g, '');
  const localPart =
    (name || 'user')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '') || 'user';
  return `${localPart}.${safePhone}@support-vaidiktalk.local`;
}

/**
 * Raw contacts list (no params, since your API rejects them)
 */
private async listContactsRaw(): Promise<any[]> {
  await this.ensureValidToken();
  const res = await this.axiosInstance.get('/contacts');
  const data = res.data?.data;
  if (!Array.isArray(data)) {
    this.logger.error('Zoho /contacts returned unexpected data:', res.data);
    return [];
  }
  return data;
}

async findOrCreateContact(name: string, phone: string): Promise<any> {
  await this.ensureValidToken();
  const targetEmail = this.buildSyntheticEmail(name, phone);

  // 1) try to find
  const contacts = await this.listContactsRaw();
  const existing = contacts.find((c: any) => c.email === targetEmail);

  if (existing) {
    this.logger.log(`Found existing Zoho contact for ${targetEmail}: ${existing.id}`);
    return existing;
  }

  // 2) create new
  const created = await this.createContact(name, phone);
  if (!created || !created.id) {
    this.logger.error('Failed to create Zoho contact, response:', created);
    throw new Error('Could not create Zoho contact');
  }
  this.logger.log(`Created new Zoho contact ${created.id} for ${targetEmail}`);
  return created;
}

async createContact(name: string, phone: string): Promise<any> {
  await this.ensureValidToken();

  const email = this.buildSyntheticEmail(name, phone);

  const payload: any = {
    lastName: name || 'User',
    email,
    phone,
  };

  const res = await this.axiosInstance.post('/contacts', payload);
  const data = res.data?.data;
  if (!Array.isArray(data) || !data[0]) {
    this.logger.error('Unexpected Zoho createContact response:', res.data);
    return null;
  }
  return data[0];
}

/**
 * Create ticket *with* ensured contact
 */
async createTicketWithContact(
  name: string,
  phone: string,
  subject: string,
  description: string,
  departmentId: string,
  otherFields: any = {},
) {
  const contact = await this.findOrCreateContact(name, phone);

  if (!contact || !contact.id) {
    this.logger.error('createTicketWithContact: contact is invalid:', contact);
    throw new Error('Zoho contact not available for ticket creation');
  }

  const payload = {
    subject,
    description,
    contactId: contact.id,
    departmentId,
    ...otherFields,
  };

  return this.createTicket(payload);
}



  // ---------- TICKETS / COMMENTS ----------

  async createTicket(payload: any): Promise<any> {
    await this.ensureValidToken();
    try {
      const response = await this.axiosInstance.post('/tickets', payload);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.tokenExpiresAt = 0;
        await this.ensureValidToken();
        const response = await this.axiosInstance.post('/tickets', payload);
        return response.data;
      }
      throw error;
    }
  }

  async updateTicket(ticketId: string, payload: any): Promise<any> {
    await this.ensureValidToken();
    try {
      const response = await this.axiosInstance.patch(`/tickets/${ticketId}`, payload);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.tokenExpiresAt = 0;
        await this.ensureValidToken();
        const response = await this.axiosInstance.patch(`/tickets/${ticketId}`, payload);
        return response.data;
      }
      throw error;
    }
  }

  async getTicket(ticketId: string): Promise<any> {
    await this.ensureValidToken();
    try {
      const response = await this.axiosInstance.get(`/tickets/${ticketId}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.tokenExpiresAt = 0;
        await this.ensureValidToken();
        const response = await this.axiosInstance.get(`/tickets/${ticketId}`);
        return response.data;
      }
      throw error;
    }
  }

  async addComment(ticketId: string, content: string, isPublic = true): Promise<any> {
    await this.ensureValidToken();
    try {
      const response = await this.axiosInstance.post(`/tickets/${ticketId}/comments`, {
        content,
        isPublic,
      });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 401) {
        this.tokenExpiresAt = 0;
        await this.ensureValidToken();
        const response = await this.axiosInstance.post(`/tickets/${ticketId}/comments`, {
          content,
          isPublic,
        });
        return response.data;
      }
      throw error;
    }
  }
}
