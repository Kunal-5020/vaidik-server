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

type WebUserType = 'user' | 'astrologer';

@WebSocketGateway({
  namespace: '/notifications',
  cors: { origin: '*', credentials: true }, // keep permissive so both apps work
})
export class NotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(NotificationGateway.name);

  // Mobile tracking (same behavior as MobileNotificationGateway)
  private connectedUsers: Map<string, Set<string>> = new Map();
  private userDeviceSockets: Map<string, Map<string, string>> = new Map();

  // Web tracking (same behavior as WebNotificationGateway)
  private connectedClients: Map<
    string,
    { socketId: string; userId: string; userType: WebUserType }
  > = new Map();

  constructor(private readonly jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token =
        client.handshake.auth?.token ||
        client.handshake.headers?.authorization?.replace('Bearer ', '') ||
        client.handshake.headers?.authorization?.split(' ')?.[1];

      if (!token) {
        this.logger.warn('❌ Connection rejected: No token');
        client.disconnect();
        return;
      }

      // verifyAsync is safe for both use-cases
      const payload: any = await this.jwtService.verifyAsync(token);

      // Normalize userId across both payload shapes
      const userId: string =
        payload.userId || payload.id || payload._id || payload.sub;

      // Web expects only: 'user' | 'astrologer'
      const webUserType: WebUserType =
        payload.role === 'astrologer' || payload.userType === 'Astrologer' || payload.astrologerId
          ? 'astrologer'
          : 'user';

      client.data.userId = userId;
      client.data.userType = webUserType;

      // Detect "mobile" by deviceId presence (mobile sends it, web usually doesn't)
      const deviceIdRaw =
        client.handshake.auth?.deviceId ||
        (client.handshake.query?.deviceId as string | undefined);

      const isMobile = !!deviceIdRaw;

      if (isMobile) {
        const deviceId = String(deviceIdRaw);
        client.data.deviceId = deviceId;

        if (!this.connectedUsers.has(userId)) this.connectedUsers.set(userId, new Set());
        if (!this.userDeviceSockets.has(userId)) this.userDeviceSockets.set(userId, new Map());

        this.userDeviceSockets.get(userId)!.set(deviceId, client.id);
        this.connectedUsers.get(userId)!.add(client.id);

        // Mobile room scheme
        client.join(`user:${userId}`);

        this.logger.log(
          `✅ [Mobile] ${webUserType} connected: ${userId} (Device: ${deviceId}; Socket: ${client.id})`,
        );

        // Mobile expects this event name
        client.emit('connection-success', {
          message: 'Connected to notification system',
          userId,
          userType: webUserType,
          deviceId,
          timestamp: new Date(),
        });
      } else {
        // Web room scheme
        client.join(`${webUserType}_${userId}`);

        this.connectedClients.set(client.id, {
          socketId: client.id,
          userId,
          userType: webUserType,
        });

        this.logger.log(`✅ [Web] ${webUserType} connected: ${userId} (${client.id})`);

        // Web expects this event name
        client.emit('connected', {
          socketId: client.id,
          userId,
          userType: webUserType,
          timestamp: new Date(),
        });
      }
    } catch (error: any) {
      this.logger.error(`❌ Auth failed: ${error?.message || error}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const userId: string | undefined = client.data.userId;
    const deviceId: string | undefined = client.data.deviceId;

    // If it was a mobile socket (deviceId present), cleanup mobile maps
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

    // Cleanup web map (if it was web)
    const webClient = this.connectedClients.get(client.id);
    if (webClient) {
      this.logger.log(`🔌 [Web] Disconnected: ${webClient.userType} ${webClient.userId}`);
      this.connectedClients.delete(client.id);
      return;
    }

    this.logger.log(`👋 Disconnected: ${userId ?? 'unknown'} (Device: ${deviceId ?? 'n/a'}; Socket: ${client.id})`);
  }

  // -----------------------
  // Sending APIs (keep both)
  // -----------------------

  // Mobile-style: broadcast to all user devices
  sendToUser(userId: string, notification: any): boolean {
    const sockets = this.connectedUsers.get(userId);
    if (sockets && sockets.size > 0) {
      this.server.to(`user:${userId}`).emit('new-notification', notification);
      this.logger.log(`📤 [Mobile] Broadcast notification -> user:${userId}`);
      return true;
    }
    return false;
  }

  // Mobile-style: send to single device
  sendToUserDevice(userId: string, deviceId: string, notification: any): boolean {
    const deviceMap = this.userDeviceSockets.get(userId);
    const socketId = deviceMap?.get(deviceId);
    if (socketId) {
      this.server.to(socketId).emit('new-notification', notification);
      this.logger.log(`📤 [Mobile] Notification -> user ${userId} device ${deviceId} (${socketId})`);
      return true;
    }
    this.logger.log(`⏭️ [Mobile] Device ${deviceId} of user ${userId} not connected`);
    return false;
  }

  // Web-style: send to web room with custom event name
  sendToWebUser(userId: string, userType: WebUserType, event: string, data: any) {
    const room = `${userType}_${userId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`📤 [Web] Sent '${event}' to ${room}`);
  }

  isUserOnline(userId: string): boolean {
    const sockets = this.connectedUsers.get(userId);
    return !!sockets && sockets.size > 0;
  }

  getConnectedUsersCount(): number {
    return this.connectedUsers.size;
  }

  getConnectedWebCount(): number {
    return this.connectedClients.size;
  }

  isUserConnected(userId: string, userType: WebUserType): boolean {
  // checks ONLY web connections (deviceId-less connections)
  return Array.from(this.connectedClients.values()).some(
    (client) => client.userId === userId && client.userType === userType,
  );
}

  // -----------------------
  // Existing listeners
  // -----------------------

  @SubscribeMessage('notification-received')
  handleNotificationReceived(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationId: string },
  ) {
    this.logger.log(`✅ Notification received by user ${client.data.userId}: ${data.notificationId}`);
    return { success: true };
  }

  @SubscribeMessage('mark-as-read')
  handleMarkAsRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { notificationIds: string[] },
  ) {
    this.logger.log(
      `📖 User ${client.data.userId} marked notifications as read: ${data.notificationIds?.length ?? 0}`,
    );
    return { success: true };
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date() });
  }
}
