// notifications/gateways/mobile-notification.gateway.ts (FIXED)
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
  namespace: 'notifications', // Mobile app namespace
  cors: {
    origin: '*', // Mobile apps
    credentials: true,
  },
})
export class MobileNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MobileNotificationGateway.name);
  
  // Track connected users: Map<userId, Set<socketId>>
  private connectedUsers: Map<string, Set<string>> = new Map();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      // Extract token from handshake
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        this.logger.warn(`❌ Mobile connection rejected - No token`);
        client.disconnect();
        return;
      }

      // Verify JWT
      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload._id;
      const userType = payload.userType || (payload.astrologerId ? 'Astrologer' : 'User');

      // Store user info in socket
      client.data.userId = userId;
      client.data.userType = userType;

      // Track connection (FIXED: Proper null check)
      if (!this.connectedUsers.has(userId)) {
        this.connectedUsers.set(userId, new Set());
      }
      const userSockets = this.connectedUsers.get(userId);
      if (userSockets) {
        userSockets.add(client.id);
      }

      // Join user's personal room
      client.join(`user:${userId}`);

      this.logger.log(`✅ ${userType} connected: ${userId} (Socket: ${client.id})`);
      this.logger.log(`📊 Total connected mobile users: ${this.connectedUsers.size}`);

      // Send connection success
      client.emit('connection-success', {
        message: 'Connected to notification system',
        userId,
        userType,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`❌ Mobile authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    
    if (userId && this.connectedUsers.has(userId)) {
      const userSockets = this.connectedUsers.get(userId);
      
      // FIXED: Proper null check
      if (userSockets) {
        userSockets.delete(client.id);

        if (userSockets.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
    }

    this.logger.log(`👋 User disconnected: ${userId} (Socket: ${client.id})`);
    this.logger.log(`📊 Remaining mobile users: ${this.connectedUsers.size}`);
  }

  // Send notification to specific user
  sendToUser(userId: string, notification: any): boolean {
    const userSockets = this.connectedUsers.get(userId);
    
    if (userSockets && userSockets.size > 0) {
      this.server.to(`user:${userId}`).emit('new-notification', notification);
      this.logger.log(`📤 Notification sent via Socket to user ${userId} (${userSockets.size} devices)`);
      return true; // Successfully sent via Socket
    }
    
    this.logger.log(`⏭️ User ${userId} not connected - will use FCM`);
    return false; // User offline, use FCM
  }

  // Broadcast to all connected users
  broadcastToAll(notification: any) {
    this.server.emit('new-notification', notification);
    this.logger.log(`📢 Broadcast notification to all mobile users (${this.connectedUsers.size} users)`);
  }

  // Check if user is online (FIXED: Proper null check)
  isUserOnline(userId: string): boolean {
    const userSockets = this.connectedUsers.get(userId);
    return this.connectedUsers.has(userId) && userSockets !== undefined && userSockets.size > 0;
  }

  // Get connected users count
  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  // Mark notification as received (client confirms)
  @SubscribeMessage('notification-received')
  handleNotificationReceived(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string }
  ) {
    this.logger.log(`✅ User ${client.data.userId} received notification ${data.notificationId}`);
    return { success: true };
  }

  // Mark notification as read
  @SubscribeMessage('mark-as-read')
  handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationIds: string[] }
  ) {
    this.logger.log(`📖 User ${client.data.userId} marked ${data.notificationIds.length} notifications as read`);
    return { success: true };
  }
}
