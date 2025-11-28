import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { SupportTicket, SupportTicketDocument } from '../schemas/support-ticket.schema';

@Controller('webhooks/zoho')
export class ZohoWebhookController {
  constructor(
    @InjectModel(SupportTicket.name) private ticketModel: Model<SupportTicketDocument>,
  ) {}

  // Zoho Desk webhook for ticket updates
  @Post('ticket-update')
  @HttpCode(HttpStatus.OK)
  async handleTicketUpdate(@Body() payload: any) {
    try {
      const { ticketId, status } = payload;

      if (!ticketId) {
        return { success: false, message: 'Missing ticketId' };
      }

      // Map Zoho status to our status
      const statusMapping: Record<string, string> = {
        'Open': 'open',
        'In Progress': 'in_progress',
        'On Hold': 'in_progress',
        'Escalated': 'in_progress',
        'Closed': 'closed',
      };

      const mappedStatus = statusMapping[status] || 'open';

      // Update ticket in our database
      await this.ticketModel.updateOne(
        { zohoTicketId: ticketId },
        {
          status: mappedStatus,
          updatedAt: new Date(),
        },
      );

      return { success: true };
    } catch (error) {
      console.error('Zoho webhook error:', error);
      return { success: false, message: error.message };
    }
  }
}
