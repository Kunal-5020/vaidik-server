import { 
  WebSocketGateway, 
  SubscribeMessage, 
  MessageBody, 
  ConnectedSocket, 
  OnGatewayConnection, 
  OnGatewayDisconnect, 
  WebSocketServer 
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ChatSessionService } from './services/chat-session.service';
import { MessageService } from './services/message.service';
import { SendMessageDto } from './dto/send-message.dto';
import { FcmService } from '../firebase/fcm.service';
import { NotificationTemplatesService } from '../firebase/notification-templates.service';
import { DeviceTokenService } from '../users/services/device-token.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly chatSessionService: ChatSessionService,
    private readonly messageService: MessageService,
    private readonly fcmService: FcmService,
    private readonly notificationTemplates: NotificationTemplatesService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async handleConnection(socket: Socket) {
    const { userId } = socket.handshake.query;
    console.log(`🟢 Client connected: ${socket.id} (userId: ${userId})`);
  }

  async handleDisconnect(socket: Socket) {
    console.log(`🔴 Client disconnected: ${socket.id}`);
  }

  @SubscribeMessage('join-session')
  async handleJoinSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.join(data.sessionId);
    this.server.to(data.sessionId).emit('system-message', {
      event: 'user-join',
      socketId: socket.id,
      sessionId: data.sessionId,
    });
    return { joined: data.sessionId };
  }

  @SubscribeMessage('leave-session')
  async handleLeaveSession(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.leave(data.sessionId);
    this.server.to(data.sessionId).emit('system-message', {
      event: 'user-leave',
      socketId: socket.id,
      sessionId: data.sessionId,
    });
    return { left: data.sessionId };
  }

  @SubscribeMessage('send-message')
  async handleSendMessage(
    @MessageBody() payload: SendMessageDto,
    @ConnectedSocket() socket: Socket,
  ) {
    // Save the message to DB using MessageService
    const message = await this.messageService.saveMessage(payload);

    // Emit message event to session room (real-time delivery)
    this.server.to(payload.sessionId).emit('receive-message', message);

    // Send push notification to offline users
    await this.sendMessageNotification(payload, message);

    // Confirm message sent back to sender
    return message;
  }

  @SubscribeMessage('fetch-messages')
  async handleFetchMessages(
    @MessageBody() data: { sessionId: string },
    @ConnectedSocket() socket: Socket
  ) {
    const messages = await this.messageService.getMessagesForSession(data.sessionId);
    return messages;
  }

  @SubscribeMessage('mark-read')
  async handleMarkRead(
    @MessageBody() data: { sessionId: string; userId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    await this.messageService.markMessagesAsRead(
      data.sessionId,
      data.userId
    );
    this.server.to(data.sessionId).emit('messages-read', { userId: data.userId });
    return { status: 'ok' };
  }

  // AstroTalk-style typing indicators
  @SubscribeMessage('typing-start')
  async handleTypingStart(
    @MessageBody() data: { sessionId: string; userId: string; userName: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.to(data.sessionId).emit('typing-start', {
      userId: data.userId,
      userName: data.userName
    });
    return { status: 'typing-start-sent' };
  }

  @SubscribeMessage('typing-stop')
  async handleTypingStop(
    @MessageBody() data: { sessionId: string; userId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.to(data.sessionId).emit('typing-stop', {
      userId: data.userId
    });
    return { status: 'typing-stop-sent' };
  }

  // User presence (online/offline status)
  @SubscribeMessage('user-status')
  async handleUserStatus(
    @MessageBody() data: { userId: string; status: 'online' | 'offline' | 'typing' },
    @ConnectedSocket() socket: Socket,
  ) {
    // Broadcast user status to all sessions they're part of
    socket.broadcast.emit('user-status-update', {
      userId: data.userId,
      status: data.status,
      timestamp: new Date()
    });
    return { status: 'status-updated' };
  }

  // Audio message support (for AstroTalk-like audio messages)
@SubscribeMessage('send-audio-message')
async handleSendAudioMessage(
  @MessageBody() payload: {
    sessionId: string;
    senderId: string;
    role: 'user' | 'astrologer';
    audioUrl: string;
    duration: number; // in seconds
  },
  @ConnectedSocket() socket: Socket,
) {
  // Create audio message payload with correct typing
  const audioMessagePayload: SendMessageDto = {
    sessionId: payload.sessionId,
    senderId: payload.senderId,
    role: payload.role,
    content: `🎵 Audio message (${payload.duration}s)`,
    type: 'audio' as any, // Type casting to fix TS error
    mediaUrl: payload.audioUrl,
    duration: payload.duration
  };

  // Save audio message to DB
  const message = await this.messageService.saveMessage(audioMessagePayload);

  // Emit audio message to session participants
  this.server.to(payload.sessionId).emit('receive-audio-message', {
    ...message,
    audioUrl: payload.audioUrl,
    duration: payload.duration
  });

  // Send push notification
  await this.sendAudioMessageNotification(payload, message);

  return message;
}

  // Image message support (for AstroTalk-like image sharing)
  @SubscribeMessage('send-image-message')
  async handleSendImageMessage(
  @MessageBody() payload: {
    sessionId: string;
    senderId: string;
    role: 'user' | 'astrologer';
    imageUrl: string;
    caption?: string;
  },
  @ConnectedSocket() socket: Socket,
  ) {
  // Create image message payload with correct typing
  const imageMessagePayload: SendMessageDto = {
    sessionId: payload.sessionId,
    senderId: payload.senderId,
    role: payload.role,
    content: payload.caption || '📷 Image',
    type: 'image', // This should work fine
    mediaUrl: payload.imageUrl
  };

  // Save image message to DB
  const message = await this.messageService.saveMessage(imageMessagePayload);

  // Emit image message to session participants
  this.server.to(payload.sessionId).emit('receive-image-message', {
    ...message,
    imageUrl: payload.imageUrl,
    caption: payload.caption
  });

  // Send push notification
  await this.sendImageMessageNotification(payload, message);

  return message;
}

  // Private method: Send FCM notification for text messages
  private async sendMessageNotification(payload: SendMessageDto, message: any) {
    try {
      // Get session details to find recipient
      const session = await this.chatSessionService.getSession(payload.sessionId);
      
      // Determine recipient (if sender is user, recipient is astrologer and vice versa)
      const recipientId = payload.role === 'user' 
        ? session.astrologerId.toString()
        : session.userId.toString();

      // Check if user has normal notifications enabled
      const shouldSend = await this.deviceTokenService.shouldSendNotification(recipientId, 'normal');
      if (!shouldSend) {
        console.log(`📱 Normal notifications disabled for user: ${recipientId}`);
        return;
      }

      // Get recipient's device tokens
      const deviceTokens = await this.deviceTokenService.getUserDeviceTokens(recipientId);
      
      if (deviceTokens.length === 0) {
        console.log(`📱 No device tokens found for user: ${recipientId}`);
        return;
      }

      // Get sender name (you might want to fetch this from user/astrologer collection)
      const senderName = payload.role === 'user' ? 'User' : 'Astrologer';

      // Create notification
      const notification = this.notificationTemplates.createChatMessageNotification(
        senderName,
        payload.content,
        payload.sessionId
      );

      // Send FCM notification
      await this.fcmService.sendToMultipleDevices(deviceTokens, notification);

    } catch (error) {
      console.error('❌ Failed to send message notification:', error);
    }
  }

  // Private method: Send FCM notification for audio messages
  private async sendAudioMessageNotification(payload: any, message: any) {
    try {
      const session = await this.chatSessionService.getSession(payload.sessionId);
      const recipientId = payload.role === 'user' 
        ? session.astrologerId.toString()
        : session.userId.toString();

      const shouldSend = await this.deviceTokenService.shouldSendNotification(recipientId, 'normal');
      if (!shouldSend) return;

      const deviceTokens = await this.deviceTokenService.getUserDeviceTokens(recipientId);
      if (deviceTokens.length === 0) return;

      const senderName = payload.role === 'user' ? 'User' : 'Astrologer';
      
      const notification = this.notificationTemplates.createChatMessageNotification(
        senderName,
        `🎵 Audio message (${payload.duration}s)`,
        payload.sessionId
      );

      await this.fcmService.sendToMultipleDevices(deviceTokens, notification);

    } catch (error) {
      console.error('❌ Failed to send audio message notification:', error);
    }
  }

  // Private method: Send FCM notification for image messages
  private async sendImageMessageNotification(payload: any, message: any) {
    try {
      const session = await this.chatSessionService.getSession(payload.sessionId);
      const recipientId = payload.role === 'user' 
        ? session.astrologerId.toString()
        : session.userId.toString();

      const shouldSend = await this.deviceTokenService.shouldSendNotification(recipientId, 'normal');
      if (!shouldSend) return;

      const deviceTokens = await this.deviceTokenService.getUserDeviceTokens(recipientId);
      if (deviceTokens.length === 0) return;

      const senderName = payload.role === 'user' ? 'User' : 'Astrologer';
      
      const notification = this.notificationTemplates.createChatMessageNotification(
        senderName,
        payload.caption || '📷 Image',
        payload.sessionId
      );

      await this.fcmService.sendToMultipleDevices(deviceTokens, notification);

    } catch (error) {
      console.error('❌ Failed to send image message notification:', error);
    }
  }
}
