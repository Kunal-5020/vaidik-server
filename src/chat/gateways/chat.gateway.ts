// src/chat/gateways/chat.gateway.ts

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
import { Logger } from '@nestjs/common';
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

  private readonly logger = new Logger(ChatGateway.name);
  private activeUsers = new Map<string, { socketId: string; userId: string; role: string; sessionId?: string }>();

  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService,
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Chat client disconnected: ${client.id}`);
    
    // Find and remove user, update online status
    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.socketId === client.id) {
        // Update online status to offline
        if (userData.sessionId) {
          this.chatSessionService.updateOnlineStatus(
            userData.sessionId,
            userId,
            userData.role as 'user' | 'astrologer',
            false
          );

          // Notify other party user went offline
          client.to(userData.sessionId).emit('user_status_changed', {
            userId,
            isOnline: false,
            lastSeen: new Date()
          });
        }

        this.activeUsers.delete(userId);
        break;
      }
    }
  }

  // ===== JOIN SESSION =====
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
      sessionId
    });

    // Update online status
    await this.chatSessionService.updateOnlineStatus(sessionId, userId, role, true);

    // Notify other party
    client.to(sessionId).emit('user_joined', {
      userId,
      role,
      isOnline: true,
      timestamp: new Date(),
    });

    this.logger.log(`User ${userId} joined session ${sessionId}`);

    return { success: true, message: 'Joined session successfully' };
  }

  // ===== SEND MESSAGE =====
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
    fileS3Key?: string;
    fileSize?: number;
    fileName?: string;
    thumbnailUrl?: string;
    duration?: number;
    replyTo?: string;
    quotedMessage?: any;
  }
) {
  try {
    const message = await this.chatMessageService.sendMessage(data);

    await this.chatSessionService.updateLastMessage(
      data.sessionId,
      data.type === 'text' ? data.content : `[${data.type}]`,
      data.type,
      data.senderId
    );

    // ✅ FIXED: Cast to any for optional fields
    const messageData = message.toObject();

    this.server.to(data.sessionId).emit('new_message', {
      messageId: message.messageId,
      sessionId: message.sessionId,
      senderId: message.senderId,
      senderModel: message.senderModel,
      receiverId: message.receiverId,
      type: message.type,
      content: message.content,
      fileUrl: message.fileUrl,
      thumbnailUrl: messageData.thumbnailUrl,
      duration: messageData.duration,
      deliveryStatus: messageData.deliveryStatus,
      replyTo: messageData.replyTo,
      quotedMessage: messageData.quotedMessage,
      sentAt: message.sentAt,
    });

    return { success: true, message: 'Message sent', messageId: message.messageId };
  } catch (error: any) {
    this.logger.error(`Send message error: ${error.message}`);
    return { success: false, message: error.message };
  }
}

  // ✅ NEW: Message delivered
  @SubscribeMessage('message_delivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: string[]; sessionId: string }
  ) {
    try {
      await this.chatMessageService.markAsDelivered(data.messageIds);

      // Notify sender
      client.to(data.sessionId).emit('messages_delivered', {
        messageIds: data.messageIds,
        deliveredAt: new Date()
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== MARK AS READ =====
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

  // ✅ NEW: React to message
  @SubscribeMessage('react_message')
  async handleReactMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      userId: string;
      userModel: 'User' | 'Astrologer';
      emoji: string;
    }
  ) {
    try {
      const message = await this.chatMessageService.addReaction(
        data.messageId,
        data.userId,
        data.userModel,
        data.emoji
      );

      // Notify all clients
      this.server.to(data.sessionId).emit('message_reacted', {
        messageId: data.messageId,
        userId: data.userId,
        emoji: data.emoji,
        reactedAt: new Date()
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ✅ NEW: Remove reaction
  @SubscribeMessage('remove_reaction')
  async handleRemoveReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      userId: string;
    }
  ) {
    try {
      await this.chatMessageService.removeReaction(data.messageId, data.userId);

      // Notify all clients
      this.server.to(data.sessionId).emit('reaction_removed', {
        messageId: data.messageId,
        userId: data.userId
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ✅ NEW: Star/Unstar message
  @SubscribeMessage('toggle_star')
  async handleToggleStar(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      userId: string;
    }
  ) {
    try {
      const isStarred = await this.chatMessageService.toggleStar(data.messageId, data.userId);

      return { success: true, isStarred };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ✅ NEW: Edit message
  @SubscribeMessage('edit_message')
async handleEditMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    messageId: string;
    sessionId: string;
    senderId: string;
    newContent: string;
  }
) {
  try {
    const message = await this.chatMessageService.editMessage(
      data.messageId,
      data.senderId,
      data.newContent
    );

    const messageData = message.toObject();

    this.server.to(data.sessionId).emit('message_edited', {
      messageId: data.messageId,
      newContent: data.newContent,
      editedAt: messageData.editedAt
    });

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

  // ✅ NEW: Delete message
  @SubscribeMessage('delete_message')
  async handleDeleteMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      senderId: string;
      deleteFor: 'sender' | 'everyone';
    }
  ) {
    try {
      await this.chatMessageService.deleteMessage(
        data.messageId,
        data.senderId,
        data.deleteFor
      );

      if (data.deleteFor === 'everyone') {
        // Notify all clients
        this.server.to(data.sessionId).emit('message_deleted', {
          messageId: data.messageId,
          deletedAt: new Date()
        });
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== TYPING INDICATOR =====
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

  // ✅ NEW: Online/Offline status update
  @SubscribeMessage('update_status')
  async handleUpdateStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      userId: string;
      role: 'user' | 'astrologer';
      isOnline: boolean;
    }
  ) {
    await this.chatSessionService.updateOnlineStatus(
      data.sessionId,
      data.userId,
      data.role,
      data.isOnline
    );

    // Notify other party
    client.to(data.sessionId).emit('user_status_changed', {
      userId: data.userId,
      isOnline: data.isOnline,
      lastSeen: data.isOnline ? null : new Date()
    });

    return { success: true };
  }

  // ===== LEAVE SESSION =====
  @SubscribeMessage('leave_session')
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; role: 'user' | 'astrologer' }
  ) {
    client.leave(data.sessionId);

    // Update online status
    await this.chatSessionService.updateOnlineStatus(data.sessionId, data.userId, data.role, false);

    // Remove from active users
    this.activeUsers.delete(data.userId);

    client.to(data.sessionId).emit('user_left', {
      userId: data.userId,
      lastSeen: new Date(),
      timestamp: new Date(),
    });

    return { success: true, message: 'Left session successfully' };
  }

  // ===== END SESSION =====
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

      // Notify all clients
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
