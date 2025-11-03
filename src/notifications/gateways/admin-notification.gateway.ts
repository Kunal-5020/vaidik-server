// notifications/gateways/admin-notification.gateway.ts (FIXED)
import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: 'admin-notifications', // Admin portal namespace
  cors: {
    origin: 'http://localhost:3000', // Your admin portal URL
    credentials: true,
  },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminNotificationGateway.name);
  
  // Track connected admins: Map<adminId, Set<socketId>>
  private connectedAdmins: Map<string, Set<string>> = new Map();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`❌ Admin connection rejected - No token`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync(token);
      const adminId = payload.sub || payload._id;

      // Store admin info
      client.data.adminId = adminId;

      // Track connection (FIXED: Proper null check)
      if (!this.connectedAdmins.has(adminId)) {
        this.connectedAdmins.set(adminId, new Set());
      }
      const adminSockets = this.connectedAdmins.get(adminId);
      if (adminSockets) {
        adminSockets.add(client.id);
      }

      // Join admin room for broadcasts
      client.join('admin-room');

      this.logger.log(`✅ Admin connected: ${adminId} (Socket: ${client.id})`);
      this.logger.log(`📊 Total connected admins: ${this.connectedAdmins.size}`);

      // Send connection success
      client.emit('connection-success', {
        message: 'Connected to admin notification system',
        adminId,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`❌ Admin authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const adminId = client.data.adminId;
    
    if (adminId && this.connectedAdmins.has(adminId)) {
      const adminSockets = this.connectedAdmins.get(adminId);
      
      // FIXED: Proper null check
      if (adminSockets) {
        adminSockets.delete(client.id);

        if (adminSockets.size === 0) {
          this.connectedAdmins.delete(adminId);
        }
      }
    }

    this.logger.log(`👋 Admin disconnected: ${adminId} (Socket: ${client.id})`);
    this.logger.log(`📊 Remaining admins: ${this.connectedAdmins.size}`);
  }

  // Send to all admins
  sendToAllAdmins(notification: any) {
    this.server.to('admin-room').emit('new-notification', notification);
    this.logger.log(`📢 Notification sent to all admins (${this.connectedAdmins.size} connected)`);
  }

  // Send to specific admin
  sendToAdmin(adminId: string, notification: any) {
    const adminSockets = this.connectedAdmins.get(adminId);
    
    if (adminSockets && adminSockets.size > 0) {
      adminSockets.forEach(socketId => {
        this.server.to(socketId).emit('new-notification', notification);
      });
      this.logger.log(`📤 Notification sent to admin ${adminId} (${adminSockets.size} devices)`);
    }
  }

  // Broadcast system alert (high priority)
  broadcastSystemAlert(alert: any) {
    this.server.to('admin-room').emit('system-alert', {
      ...alert,
      priority: 'urgent',
      timestamp: new Date(),
    });
    this.logger.warn(`🚨 SYSTEM ALERT: ${alert.message}`);
  }

  // Real-time dashboard stats update
  updateDashboardStats(stats: any) {
    this.server.to('admin-room').emit('dashboard-stats-update', stats);
  }

  // Send real-time event to admins (orders, calls, etc.)
  sendRealtimeEvent(eventType: string, eventData: any) {
    this.server.to('admin-room').emit('realtime-event', {
      eventType,
      data: eventData,
      timestamp: new Date(),
    });
    this.logger.log(`📡 Realtime event sent to admins: ${eventType}`);
  }

  // Check if any admin is online
  isAnyAdminOnline(): boolean {
    return this.connectedAdmins.size > 0;
  }

  // Get connected admins count
  getConnectedAdminsCount(): number {
    return this.connectedAdmins.size;
  }

  // Subscribe to specific event types
  @SubscribeMessage('subscribe-to-event')
  handleSubscribeToEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() eventType: string
  ) {
    client.join(`event:${eventType}`);
    this.logger.log(`Admin ${client.data.adminId} subscribed to ${eventType} events`);
    return { success: true, subscribedTo: eventType };
  }

  // Unsubscribe from events
  @SubscribeMessage('unsubscribe-from-event')
  handleUnsubscribeFromEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() eventType: string
  ) {
    client.leave(`event:${eventType}`);
    this.logger.log(`Admin ${client.data.adminId} unsubscribed from ${eventType} events`);
    return { success: true, unsubscribedFrom: eventType };
  }
}
