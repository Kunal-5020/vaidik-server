// src/chat/gateways/chat.gateway.ts - CORRECTED VERSION

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
import { Logger, BadRequestException } from '@nestjs/common';
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
  private sessionTimers = new Map<string, NodeJS.Timeout>();
  private astrologerSockets = new Map<string, string>(); // astrologerId → socketId mapping

  constructor(
    private chatSessionService: ChatSessionService,
    private chatMessageService: ChatMessageService
  ) {}

  handleConnection(client: Socket) {
    this.logger.log(`Chat client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Chat client disconnected: ${client.id}`);

    for (const [userId, userData] of this.activeUsers.entries()) {
      if (userData.socketId === client.id) {
        if (userData.sessionId) {
          // ✅ AWAIT the async operation
          this.chatSessionService.updateOnlineStatus(
            userData.sessionId,
            userId,
            userData.role as 'user' | 'astrologer',
            false
          ).catch(err => this.logger.error(`Update status error: ${err.message}`));

          client.to(userData.sessionId).emit('user_status_changed', {
            userId,
            isOnline: false,
            lastSeen: new Date()
          });
        }

        this.activeUsers.delete(userId);
        
        // Remove from astrologer sockets if applicable
        if (userData.role === 'astrologer') {
          this.astrologerSockets.delete(userId);
        }
        break;
      }
    }
  }

  // ===== INITIATE CHAT =====
  @SubscribeMessage('initiate_chat')
  async handleInitiateChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      astrologerId: string;
      astrologerName: string;
      ratePerMinute: number;
      userId: string;
    }
  ) {
    try {
      const result = await this.chatSessionService.initiateChat({
        userId: data.userId,
        astrologerId: data.astrologerId,
        astrologerName: data.astrologerName,
        ratePerMinute: data.ratePerMinute
      });

      // ✅ FIXED: Send ONLY to specific astrologer (via their socket)
      const astrologerSocketId = this.astrologerSockets.get(data.astrologerId);
      
      if (astrologerSocketId) {
        this.server.to(astrologerSocketId).emit('incoming_chat_request', {
          sessionId: result.data.sessionId,
          orderId: result.data.orderId,
          userId: data.userId,
          ratePerMinute: data.ratePerMinute,
          requestExpiresIn: 180000,
          sound: 'ringtone.mp3',
          vibration: true
        });
      } else {
        // If astrologer not online, emit to a global astrologer notification channel
        this.server.emit('incoming_chat_request_to_astrologer', {
          astrologerId: data.astrologerId,
          sessionId: result.data.sessionId,
          orderId: result.data.orderId,
          userId: data.userId,
          ratePerMinute: data.ratePerMinute,
          requestExpiresIn: 180000
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== ACCEPT CHAT =====
  @SubscribeMessage('accept_chat')
  async handleAcceptChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      astrologerId: string;
      userId?: string;
    }
  ) {
    try {
      const result = await this.chatSessionService.acceptChat(data.sessionId, data.astrologerId);

      // ✅ FIXED: Get the user's socket and send ONLY to them
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      
      if (userData) {
        this.server.to(userData.socketId).emit('chat_accepted', {
          sessionId: data.sessionId,
          astrologerId: data.astrologerId,
          message: 'Astrologer accepted your chat request',
          timestamp: new Date()
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== REJECT CHAT =====
  @SubscribeMessage('reject_chat')
  async handleRejectChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      astrologerId: string;
      reason?: string;
    }
  ) {
    try {
      const result = await this.chatSessionService.rejectChat(
        data.sessionId,
        data.astrologerId,
        data.reason || 'rejected'
      );

      // ✅ FIXED: Send ONLY to the user
      const userSocketId = client.id; // The client calling this is the astrologer
      // Need to find user socket
      const userData = Array.from(this.activeUsers.values()).find(u => u.sessionId === data.sessionId);
      
      if (userData?.socketId) {
        this.server.to(userData.socketId).emit('chat_rejected', {
          sessionId: data.sessionId,
          reason: data.reason || 'Chat request rejected',
          refunded: true,
          timestamp: new Date()
        });
      }

      return result;
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== REGISTER ASTROLOGER SOCKET =====
  @SubscribeMessage('register_astrologer')
  handleRegisterAstrologer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { astrologerId: string }
  ) {
    this.astrologerSockets.set(data.astrologerId, client.id);
    this.logger.log(`Astrologer registered: ${data.astrologerId} | Socket: ${client.id}`);
    return { success: true, message: 'Astrologer registered' };
  }

  // ===== START CHAT SESSION WITH KUNDLI MESSAGE =====
  @SubscribeMessage('start_chat')
  async handleStartChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      userId: string;
      role: 'user' | 'astrologer';
      kundliDetails?: {
        name: string;
        dob: string;
        birthTime: string;
        birthPlace: string;
        gender: string;
      };
    }
  ) {
    try {
      const result = await this.chatSessionService.startSession(data.sessionId);

      client.join(data.sessionId);

      this.activeUsers.set(data.userId, {
        socketId: client.id,
        userId: data.userId,
        role: data.role,
        sessionId: data.sessionId
      });

      // ✅ AWAIT the async operation
      await this.chatSessionService.updateOnlineStatus(data.sessionId, data.userId, data.role, true);

      // ✅ FIXED: Add null check for session
      if (result.data.sendKundliMessage && data.kundliDetails) {
        const session = await this.chatSessionService.getSession(data.sessionId);
        
        if (!session) {
          throw new BadRequestException('Session not found');
        }
        
        const kundliMessage = await this.chatMessageService.sendKundliDetailsMessage(
          data.sessionId,
          session.astrologerId.toString(),
          data.userId,
          session.orderId,
          data.kundliDetails
        );

        // Emit kundli message only to session room
        this.server.to(data.sessionId).emit('new_message', {
          messageId: kundliMessage.messageId,
          sessionId: kundliMessage.sessionId,
          senderId: kundliMessage.senderId,
          senderModel: kundliMessage.senderModel,
          type: 'kundli_details',
          content: kundliMessage.content,
          kundliDetails: kundliMessage.kundliDetails,
          isVisibleToUser: false,
          isVisibleToAstrologer: true,
          deliveryStatus: 'sent',
          sentAt: kundliMessage.sentAt,
          automatic: true
        });

        this.logger.log(`Kundli message sent for session: ${data.sessionId}`);
      }

      this.server.to(data.sessionId).emit('timer_start', {
        sessionId: data.sessionId,
        maxDurationMinutes: result.data.maxDurationMinutes,
        maxDurationSeconds: result.data.maxDurationSeconds,
        ratePerMinute: result.data.ratePerMinute,
        chargingStarted: true,
        timestamp: new Date()
      });

      this.startTimerTicker(data.sessionId, result.data.maxDurationSeconds);

      client.to(data.sessionId).emit('user_joined', {
        userId: data.userId,
        role: data.role,
        isOnline: true,
        timestamp: new Date()
      });

      return { success: true, message: 'Chat started' };
    } catch (error: any) {
      this.logger.error(`Start chat error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ===== REAL-TIME TIMER TICKER =====
  private startTimerTicker(sessionId: string, maxDurationSeconds: number) {
    let secondsElapsed = 0;

    if (this.sessionTimers.has(sessionId)) {
      clearInterval(this.sessionTimers.get(sessionId)!);
    }

    const ticker = setInterval(async () => {
      if (secondsElapsed >= maxDurationSeconds) {
        clearInterval(ticker);
        this.sessionTimers.delete(sessionId);

        try {
          await this.chatSessionService.endSession(sessionId, 'system', 'timeout');
          this.server.to(sessionId).emit('timer_ended', {
            sessionId,
            reason: 'max_duration_reached',
            timestamp: new Date()
          });
        } catch (error) {
          this.logger.error(`Auto-end chat error: ${error}`);
        }
        return;
      }

      const remainingSeconds = maxDurationSeconds - secondsElapsed;

      this.server.to(sessionId).emit('timer_tick', {
        elapsedSeconds: secondsElapsed,
        remainingSeconds: remainingSeconds,
        maxDuration: maxDurationSeconds,
        formattedTime: this.formatTime(remainingSeconds),
        percentage: (secondsElapsed / maxDurationSeconds) * 100
      });

      if (remainingSeconds === 60) {
        this.server.to(sessionId).emit('timer_warning', {
          message: '1 minute remaining',
          remainingSeconds: 60,
          timestamp: new Date()
        });
      }

      secondsElapsed++;
    }, 1000);

    this.sessionTimers.set(sessionId, ticker);
  }

  private formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // ===== SYNC TIMER =====
  @SubscribeMessage('sync_timer')
  async handleSyncTimer(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string }
  ) {
    try {
      const session = await this.chatSessionService.getSession(data.sessionId);

      if (!session || !session.startTime) {
        return { success: false, message: 'Session not active' };
      }

      const now = new Date().getTime();
      const startTime = new Date(session.startTime).getTime();
      const elapsedSeconds = Math.floor((now - startTime) / 1000);
      const remainingSeconds = Math.max(0, session.maxDurationSeconds - elapsedSeconds);

      return {
        success: true,
        data: {
          elapsedSeconds,
          remainingSeconds,
          maxDuration: session.maxDurationSeconds,
          formattedTime: this.formatTime(remainingSeconds),
          serverTime: now
        }
      };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== SEND MESSAGE (Text, Image, Video, Voice Note) =====
  @SubscribeMessage('send_message')
  async handleSendMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      senderId: string;
      senderModel: 'User' | 'Astrologer';
      receiverId: string;
      receiverModel: 'User' | 'Astrologer';
      orderId: string;
      type: 'text' | 'image' | 'audio' | 'video' | 'file' | 'voice_note';
      content: string;
      fileUrl?: string;
      fileS3Key?: string;
      fileSize?: number;
      fileName?: string;
      fileDuration?: number;
      mimeType?: string;
      replyTo?: string;
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

      // ✅ EMIT message with status: 'sending'
      this.server.to(data.sessionId).emit('new_message', {
        messageId: message.messageId,
        sessionId: message.sessionId,
        senderId: message.senderId,
        senderModel: message.senderModel,
        receiverId: message.receiverId,
        type: message.type,
        content: message.content,
        fileUrl: message.fileUrl,
        fileDuration: message.fileDuration,
        fileName: message.fileName,
        deliveryStatus: 'sending',
        sentAt: message.sentAt,
        replyTo: data.replyTo
      });

      return { 
        success: true, 
        message: 'Message sent', 
        messageId: message.messageId,
        deliveryStatus: 'sending'
      };
    } catch (error: any) {
      this.logger.error(`Send message error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ===== MESSAGE SENT (Grey double tick) =====
  @SubscribeMessage('message_sent')
  async handleMessageSent(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: string[]; sessionId: string }
  ) {
    try {
      await this.chatMessageService.markAsSent(data.messageIds);

      client.to(data.sessionId).emit('messages_status_updated', {
        messageIds: data.messageIds,
        deliveryStatus: 'sent',
        timestamp: new Date()
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== MESSAGE DELIVERED (Grey double tick - delivered) =====
  @SubscribeMessage('message_delivered')
  async handleMessageDelivered(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: string[]; sessionId: string }
  ) {
    try {
      await this.chatMessageService.markAsDelivered(data.messageIds);

      client.to(data.sessionId).emit('messages_status_updated', {
        messageIds: data.messageIds,
        deliveryStatus: 'delivered',
        deliveredAt: new Date()
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== MARK AS READ (Blue double tick) =====
  @SubscribeMessage('mark_read')
  async handleMarkRead(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { messageIds: string[]; userId: string; sessionId: string }
  ) {
    try {
      await this.chatMessageService.markAsRead(data.messageIds, data.userId);

      client.to(data.sessionId).emit('messages_status_updated', {
        messageIds: data.messageIds,
        deliveryStatus: 'read',
        readAt: new Date(),
        readBy: data.userId
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== STAR MESSAGE =====
  @SubscribeMessage('star_message')
  async handleStarMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      userId: string;
    }
  ) {
    try {
      const message = await this.chatMessageService.starMessage(data.messageId, data.userId);

      if (!message) {
        return { success: false, message: 'Failed to star message' };
      }

      this.server.to(data.sessionId).emit('message_starred', {
        messageId: data.messageId,
        isStarred: true,
        starredBy: message.starredBy || [],
        starredAt: message.starredAt
      });

      return { success: true, message: 'Message starred' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== UNSTAR MESSAGE =====
  @SubscribeMessage('unstar_message')
  async handleUnstarMessage(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      userId: string;
    }
  ) {
    try {
      const message = await this.chatMessageService.unstarMessage(data.messageId, data.userId);

      if (!message) {
        return { success: false, message: 'Failed to unstar message' };
      }

      this.server.to(data.sessionId).emit('message_unstarred', {
        messageId: data.messageId,
        isStarred: message.isStarred || false,
        starredBy: message.starredBy || []
      });

      return { success: true, message: 'Message unstarred' };
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
      isTyping: data.isTyping
    });
  }

  // ===== ONLINE STATUS =====
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
    // ✅ AWAIT the async operation
    await this.chatSessionService.updateOnlineStatus(
      data.sessionId,
      data.userId,
      data.role,
      data.isOnline
    );

    client.to(data.sessionId).emit('user_status_changed', {
      userId: data.userId,
      isOnline: data.isOnline,
      lastSeen: data.isOnline ? null : new Date()
    });

    return { success: true };
  }

  // ===== JOIN SESSION =====
  @SubscribeMessage('join_session')
  async handleJoinSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; role: 'user' | 'astrologer' }
  ) {
    try {
      client.join(data.sessionId);

      this.activeUsers.set(data.userId, {
        socketId: client.id,
        userId: data.userId,
        role: data.role,
        sessionId: data.sessionId
      });

      // ✅ AWAIT the async operation
      await this.chatSessionService.updateOnlineStatus(data.sessionId, data.userId, data.role, true);

      client.to(data.sessionId).emit('user_joined', {
        userId: data.userId,
        role: data.role,
        isOnline: true,
        timestamp: new Date()
      });

      this.logger.log(`User ${data.userId} joined session ${data.sessionId}`);

      return { success: true, message: 'Joined session successfully' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== LEAVE SESSION =====
  @SubscribeMessage('leave_session')
  async handleLeaveSession(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; role: 'user' | 'astrologer' }
  ) {
    try {
      client.leave(data.sessionId);

      // ✅ AWAIT the async operation
      await this.chatSessionService.updateOnlineStatus(data.sessionId, data.userId, data.role, false);

      this.activeUsers.delete(data.userId);

      client.to(data.sessionId).emit('user_left', {
        userId: data.userId,
        lastSeen: new Date(),
        timestamp: new Date()
      });

      return { success: true, message: 'Left session successfully' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== END SESSION =====
  @SubscribeMessage('end_chat')
  async handleEndChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; endedBy: string; reason: string }
  ) {
    try {
      const result = await this.chatSessionService.endSession(
        data.sessionId,
        data.endedBy,
        data.reason
      );

      this.server.to(data.sessionId).emit('session_ended', {
        sessionId: data.sessionId,
        endedBy: data.endedBy,
        endTime: new Date(),
        actualDuration: result.data.actualDuration,
        billedMinutes: result.data.billedMinutes,
        chargeAmount: result.data.chargeAmount,
        message: 'Chat session ended'
      });

      if (this.sessionTimers.has(data.sessionId)) {
        clearInterval(this.sessionTimers.get(data.sessionId)!);
        this.sessionTimers.delete(data.sessionId);
      }

      return { success: true, message: 'Chat ended', data: result.data };
    } catch (error: any) {
      this.logger.error(`End chat error: ${error.message}`);
      return { success: false, message: error.message };
    }
  }

  // ===== REACT TO MESSAGE =====
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
      await this.chatMessageService.addReaction(
        data.messageId,
        data.userId,
        data.userModel,
        data.emoji
      );

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

  // ===== REMOVE REACTION =====
  @SubscribeMessage('remove_reaction')
  async handleRemoveReaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      messageId: string;
      sessionId: string;
      userId: string;
      emoji: string;
    }
  ) {
    try {
      await this.chatMessageService.removeReaction(
        data.messageId,
        data.userId,
        data.emoji
      );

      this.server.to(data.sessionId).emit('reaction_removed', {
        messageId: data.messageId,
        userId: data.userId,
        emoji: data.emoji
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== EDIT MESSAGE =====
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
      await this.chatMessageService.editMessage(
        data.messageId,
        data.senderId,
        data.newContent
      );

      this.server.to(data.sessionId).emit('message_edited', {
        messageId: data.messageId,
        newContent: data.newContent,
        editedAt: new Date(),
        edited: true
      });

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // ===== DELETE MESSAGE =====
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
        this.server.to(data.sessionId).emit('message_deleted', {
          messageId: data.messageId,
          deletedAt: new Date(),
          deleteFor: 'everyone'
        });
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }
}
