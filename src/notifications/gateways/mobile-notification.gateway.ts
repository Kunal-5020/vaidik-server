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
  namespace: 'notifications',
  cors: { origin: '*', credentials: true },
})
export class MobileNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MobileNotificationGateway.name);

  private connectedUsers: Map<string, Set<string>> = new Map();
  private userDeviceSockets: Map<string, Map<string, string>> = new Map();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers.authorization?.split(' ')[1];
      if (!token) {
        this.logger.warn('❌ No token - connection rejected');
        client.disconnect();
        return;
      }

      const payload = await this.jwtService.verifyAsync(token);
      const userId = payload.sub || payload._id;
      const userType = payload.userType || (payload.astrologerId ? 'Astrologer' : 'User');

      client.data.userId = userId;
      client.data.userType = userType;

      const deviceId = client.handshake.auth.deviceId || client.handshake.query.deviceId;
      client.data.deviceId = deviceId;

      if (!this.connectedUsers.has(userId)) this.connectedUsers.set(userId, new Set());
      if (!this.userDeviceSockets.has(userId)) this.userDeviceSockets.set(userId, new Map());

      this.userDeviceSockets.get(userId)!.set(deviceId!, client.id);
      this.connectedUsers.get(userId)?.add(client.id);

      client.join(`user:${userId}`);

      this.logger.log(`✅ ${userType} connected: ${userId} (Device: ${deviceId}; Socket: ${client.id})`);
      client.emit('connection-success', { message: 'Connected to notification system', userId, userType, deviceId, timestamp: new Date() });
    } catch (error) {
      this.logger.error(`❌ Mobile authentication failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId = client.data.userId;
    const deviceId = client.data.deviceId;

    if (userId && deviceId && this.userDeviceSockets.has(userId)) {
      const deviceMap = this.userDeviceSockets.get(userId);
      deviceMap?.delete(deviceId);
      if (deviceMap && deviceMap.size === 0) this.userDeviceSockets.delete(userId);
    }

    if (userId && this.connectedUsers.has(userId)) {
      const userSockets = this.connectedUsers.get(userId);
      userSockets?.delete(client.id);
      if (userSockets && userSockets.size === 0) this.connectedUsers.delete(userId);
    }

    this.logger.log(`👋 User disconnected: ${userId} (Device: ${deviceId}; Socket: ${client.id})`);
  }

  sendToUser(userId: string, notification: any): boolean {
    const sockets = this.connectedUsers.get(userId);
    if (sockets && sockets.size > 0) {
      this.server.to(`user:${userId}`).emit('new-notification', notification);
      this.logger.log(`📤 Broadcast notification sent to all devices of user ${userId}`);
      return true;
    }
    return false;
  }

  sendToUserDevice(userId: string, deviceId: string, notification: any): boolean {
    const deviceMap = this.userDeviceSockets.get(userId);
    if (deviceMap) {
      const socketId = deviceMap.get(deviceId);
      if (socketId) {
        this.server.to(socketId).emit('new-notification', notification);
        this.logger.log(`📤 Notification sent to user ${userId} device ${deviceId} (Socket ${socketId})`);
        return true;
      }
    }
    this.logger.log(`⏭️ Device ${deviceId} of user ${userId} not connected; fallback to FCM`);
    return false;
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return sockets !== undefined && sockets.size > 0;
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  @SubscribeMessage('notification-received')
  handleNotificationReceived(@ConnectedSocket() client: Socket, @MessageBody() data: { notificationId: string }) {
    this.logger.log(`✅ Notification received by user ${client.data.userId}: ${data.notificationId}`);
    return { success: true };
  }

  @SubscribeMessage('mark-as-read')
  handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() data: { notificationIds: string[] }) {
    this.logger.log(`📖 User ${client.data.userId} marked notifications as read: ${data.notificationIds.length}`);
    return { success: true };
  }
}
