// src/notifications/gateways/web-notification.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@WebSocketGateway({
  namespace: 'notifications',
  cors: {
    origin: process.env.WEB_URL || 'http://localhost:3000',
    credentials: true,
  },
})
export class WebNotificationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WebNotificationGateway.name);
  private connectedClients: Map<string, { socketId: string; userId: string; userType: 'user' | 'astrologer' }> = new Map();

  constructor(private jwtService: JwtService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token || client.handshake.headers?.authorization?.replace('Bearer ', '');

      if (!token) {
        this.logger.warn(`⚠️ [Web] Connection rejected: No token`);
        client.disconnect();
        return;
      }

      const decoded = this.jwtService.verify(token);
      const userId = decoded.id || decoded._id;
      const userType = decoded.role === 'astrologer' ? 'astrologer' : 'user';

      // Join user-specific room
      client.join(`${userType}_${userId}`);

      this.connectedClients.set(client.id, {
        socketId: client.id,
        userId,
        userType,
      });

      this.logger.log(`✅ [Web] ${userType} connected: ${userId} (${client.id})`);

      // Send connection confirmation
      client.emit('connected', {
        socketId: client.id,
        userId,
        userType,
        timestamp: new Date(),
      });
    } catch (error) {
      this.logger.error(`❌ [Web] Auth failed: ${error.message}`);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    const clientData = this.connectedClients.get(client.id);
    if (clientData) {
      this.logger.log(`🔌 [Web] Disconnected: ${clientData.userType} ${clientData.userId}`);
      this.connectedClients.delete(client.id);
    }
  }

  /**
   * Send notification to specific user (web)
   */
  sendToUser(userId: string, userType: 'user' | 'astrologer', event: string, data: any) {
    const room = `${userType}_${userId}`;
    this.server.to(room).emit(event, data);
    this.logger.debug(`📤 [Web] Sent '${event}' to ${room}`);
  }

  /**
   * Send to all connected web clients
   */
  broadcast(event: string, data: any) {
    this.server.emit(event, data);
    this.logger.debug(`📡 [Web] Broadcast '${event}' to all clients`);
  }

  getConnectedCount(): number {
    return this.connectedClients.size;
  }

  isUserConnected(userId: string, userType: 'user' | 'astrologer'): boolean {
    return Array.from(this.connectedClients.values()).some(
      (client) => client.userId === userId && client.userType === userType
    );
  }

  @SubscribeMessage('ping')
  handlePing(@ConnectedSocket() client: Socket) {
    client.emit('pong', { timestamp: new Date() });
  }
}
