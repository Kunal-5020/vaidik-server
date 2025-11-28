// src/admin/features/notifications/gateways/admin-notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';

@WebSocketGateway({
  namespace: '/admin-notifications',
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminNotificationGateway.name);
  private connectedAdmins: Map<string, Socket> = new Map();

  handleConnection(client: Socket) {
    const adminId = client.handshake.query.adminId as string;
    
    if (adminId) {
      this.connectedAdmins.set(adminId, client);
      this.logger.log(`Admin connected: ${adminId} | Total: ${this.connectedAdmins.size}`);
      
      client.emit('connected', {
        message: 'Connected to admin notification server',
        adminId,
      });
    }
  }

  handleDisconnect(client: Socket) {
    const adminId = client.handshake.query.adminId as string;
    
    if (adminId) {
      this.connectedAdmins.delete(adminId);
      this.logger.log(`Admin disconnected: ${adminId} | Total: ${this.connectedAdmins.size}`);
    }
  }

  /**
   * Send notification to specific admin
   */
  sendToAdmin(adminId: string, event: string, data: any) {
    const client = this.connectedAdmins.get(adminId);
    if (client) {
      client.emit(event, data);
      this.logger.debug(`Sent ${event} to admin ${adminId}`);
    }
  }

  /**
   * Broadcast to all connected admins
   */
  broadcastToAllAdmins(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`Broadcast ${event} to ${this.connectedAdmins.size} admins`);
  }

  /**
   * Send real-time notification about new order
   */
  notifyNewOrder(orderData: any) {
    this.broadcastToAllAdmins('new_order', {
      type: 'new_order',
      data: orderData,
      timestamp: new Date(),
    });
  }

  /**
   * Send real-time notification about new refund request
   */
  notifyNewRefundRequest(refundData: any) {
    this.broadcastToAllAdmins('new_refund_request', {
      type: 'new_refund_request',
      data: refundData,
      timestamp: new Date(),
    });
  }

  /**
   * Send real-time notification about new payout request
   */
  notifyNewPayoutRequest(payoutData: any) {
    this.broadcastToAllAdmins('new_payout_request', {
      type: 'new_payout_request',
      data: payoutData,
      timestamp: new Date(),
    });
  }

  /**
   * Get count of connected admins
   */
  getConnectedAdminsCount(): number {
    return this.connectedAdmins.size;
  }

  @SubscribeMessage('ping')
  handlePing(client: Socket): void {
    client.emit('pong', { timestamp: new Date() });
  }
}
