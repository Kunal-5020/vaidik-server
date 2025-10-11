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
import { UseGuards } from '@nestjs/common';
import { ChatSessionService } from '../services/chat-session.service';
import { ChatMessageService } from '../services/chat-message.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/chat',
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeUsers = new Map<string, { socketId: string; userId: string; role: string }>();

  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
  ) {}

  handleConnection(client: Socket) {
    console.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
    // Remove from active users
    for (const [key, value] of this.activeUsers.entries()) {
      if (value.socketId === client.id) {
        this.activeUsers.delete(key);
        break;
      }
    }
  }

  // Join chat session room
  @SubscribeMessage('join_session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; role: 'user' | 'astrologer' }
  ) {
    const { sessionId, userId, role } = data;

    // Join room
    client.join(sessionId);

    // Track active user
    this.activeUsers.set(userId, {
      socketId: client.id,
      userId,
      role,
    });

    // Notify other party
    client.to(sessionId).emit('user_joined', {
      userId,
      role,
      timestamp: new Date(),
    });

    console.log(`User ${userId} joined session ${sessionId}`);

    return { success: true, message: 'Joined session successfully' };
  }

  // Send message
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      senderId: string;
      senderModel: 'User' | 'Astrologer';
      receiverId: string;
      receiverModel: 'User' | 'Astrologer';
      type: string;
      content: string;
      fileUrl?: string;
    }
  ) {
    try {
      // Save message to database
      const message = await this.chatMessageService.sendMessage(data);

      // Update session message count
      await this.chatSessionService.updateMessageCount(data.sessionId);

      // Emit to all clients in the session
      this.server.to(data.sessionId).emit('new_message', {
        messageId: message.messageId,
        sessionId: message.sessionId,
        senderId: message.senderId,
        senderModel: message.senderModel,
        type: message.type,
        content: message.content,
        fileUrl: message.fileUrl,
        sentAt: message.sentAt,
      });

      return { success: true, message: 'Message sent successfully', messageId: message.messageId };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Typing indicator
  @SubscribeMessage('typing')
  handleTyping(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; isTyping: boolean }
  ) {
    client.to(data.sessionId).emit('user_typing', {
      userId: data.userId,
      isTyping: data.isTyping,
    });
  }

  // Mark messages as read
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: string[]; userId: string; sessionId: string }
  ) {
    try {
      await this.chatMessageService.markAsRead(data.messageIds, data.userId);

      // Notify sender
      client.to(data.sessionId).emit('messages_read', {
        messageIds: data.messageIds,
        readBy: data.userId,
        readAt: new Date(),
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Leave session
  @SubscribeMessage('leave_session')
  handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string }
  ) {
    client.leave(data.sessionId);
    this.activeUsers.delete(data.userId);

    client.to(data.sessionId).emit('user_left', {
      userId: data.userId,
      timestamp: new Date(),
    });

    return { success: true, message: 'Left session successfully' };
  }

  // End chat session
  @SubscribeMessage('end_session')
  async handleEndSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; endedBy: string; reason?: string }
  ) {
    try {
      const session = await this.chatSessionService.endSession(
        data.sessionId,
        data.endedBy,
        data.reason
      );

      // Notify all clients in the session
      this.server.to(data.sessionId).emit('session_ended', {
        sessionId: session.sessionId,
        endedBy: session.endedBy,
        endTime: session.endTime,
        duration: session.duration,
        totalAmount: session.totalAmount,
      });

      return { success: true, message: 'Session ended successfully' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
