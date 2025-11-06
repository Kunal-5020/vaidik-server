// src/admin/gateways/admin-notification.gateway.ts (MOVED & UPDATED)
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
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Admin, AdminDocument } from '../schemas/admin.schema';

@WebSocketGateway({
  namespace: 'admin-notifications',
  cors: {
    origin: process.env.ADMIN_PORTAL_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class AdminNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AdminNotificationGateway.name);
  private connectedAdmins: Map<string, Set<string>> = new Map();

  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
    @InjectModel(Admin.name) private adminModel: Model<AdminDocument>,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || 
                   client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`❌ Admin connection rejected - No token`);
        client.disconnect();
        return;
      }

      this.logger.log('🔐 Verifying admin token...');

      let payload: any;
      try {
        payload = await this.jwtService.verifyAsync(token, {
          secret: this.configService.get<string>('JWT_SECRET'),
        });
      } catch (error) {
        this.logger.error(`❌ Token verification failed:`, {
          error: (error as any).message,
        });
        client.disconnect();
        return;
      }

      if (!payload.isAdmin) {
        this.logger.warn('❌ Token is not an admin token');
        client.disconnect();
        return;
      }

      const adminId = payload._id;

      if (!adminId) {
        this.logger.warn('❌ No admin ID in token');
        client.disconnect();
        return;
      }

      this.logger.log('📋 Looking up admin in database...');
      
      const admin = await this.adminModel
        .findById(adminId)
        .select('_id status lockedUntil roleId')
        .lean()
        .exec() as AdminDocument | null;

      if (!admin) {
        this.logger.warn(`❌ Admin not found in database: ${adminId}`);
        client.disconnect();
        return;
      }

      if (admin.status !== 'active') {
        this.logger.warn(`❌ Admin account is not active: ${admin.status}`);
        client.disconnect();
        return;
      }

      if (admin.lockedUntil && new Date(admin.lockedUntil) > new Date()) {
        this.logger.warn(`❌ Admin account is locked`);
        client.disconnect();
        return;
      }

      client.data.adminId = adminId;
      client.data.admin = admin;

      if (!this.connectedAdmins.has(adminId)) {
        this.connectedAdmins.set(adminId, new Set());
      }
      const adminSockets = this.connectedAdmins.get(adminId);
      if (adminSockets) {
        adminSockets.add(client.id);
      }

      client.join('admin-room');

      this.logger.log(`✅ Admin connected: ${adminId} (Socket: ${client.id})`);
      this.logger.log(`📊 Total connected admins: ${this.connectedAdmins.size}`);

      client.emit('connection-success', {
        message: 'Connected to admin notification system',
        adminId,
        timestamp: new Date(),
      });

      this.adminModel
        .findByIdAndUpdate(adminId, { lastActivityAt: new Date() })
        .exec()
        .catch(err => this.logger.error('Failed to update last activity:', err));

    } catch (error) {
      this.logger.error(`❌ Admin authentication failed:`, {
        error: (error as any).message,
      });
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const adminId = client.data.adminId;
    
    if (adminId && this.connectedAdmins.has(adminId)) {
      const adminSockets = this.connectedAdmins.get(adminId);
      
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

  sendToAllAdmins(notification: any) {
    this.server.to('admin-room').emit('new-notification', notification);
    this.logger.log(`📢 Notification sent to all admins (${this.connectedAdmins.size} connected)`);
  }

  sendToAdmin(adminId: string, notification: any) {
    const adminSockets = this.connectedAdmins.get(adminId);
    
    if (adminSockets && adminSockets.size > 0) {
      adminSockets.forEach(socketId => {
        this.server.to(socketId).emit('new-notification', notification);
      });
      this.logger.log(`📤 Notification sent to admin ${adminId} (${adminSockets.size} devices)`);
    }
  }

  broadcastSystemAlert(alert: any) {
    this.server.to('admin-room').emit('system-alert', {
      ...alert,
      priority: 'urgent',
      timestamp: new Date(),
    });
    this.logger.warn(`🚨 SYSTEM ALERT: ${alert.message}`);
  }

  updateDashboardStats(stats: any) {
    this.server.to('admin-room').emit('dashboard-stats-update', stats);
  }

  sendRealtimeEvent(eventType: string, eventData: any) {
    this.server.to('admin-room').emit('realtime-event', {
      eventType,
      data: eventData,
      timestamp: new Date(),
    });
    this.logger.log(`📡 Realtime event sent to admins: ${eventType}`);
  }

  isAnyAdminOnline(): boolean {
    return this.connectedAdmins.size > 0;
  }

  getConnectedAdminsCount(): number {
    return this.connectedAdmins.size;
  }

  @SubscribeMessage('subscribe-to-event')
  handleSubscribeToEvent(
    @ConnectedSocket() client: Socket,
    @MessageBody() eventType: string
  ) {
    client.join(`event:${eventType}`);
    this.logger.log(`Admin ${client.data.adminId} subscribed to ${eventType} events`);
    return { success: true, subscribedTo: eventType };
  }

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
