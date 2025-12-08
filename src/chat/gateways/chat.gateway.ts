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
import { NotificationService } from '../../notifications/services/notification.service';

interface AuthSocket extends Socket {
  handshake: Socket['handshake'] & {
    auth?: {
      token?: string;
      userId?: string;
      role?: string;
    };
  };
}

// Shared shape for incoming chat requests (new + continuation)
export interface IncomingChatRequestPayload {
  sessionId: string;
  orderId: string;
  userId: string;
  ratePerMinute: number;
  requestExpiresIn: number; // e.g. 3 * 60 * 1000
  sound?: string;
  vibration?: boolean;
  // Continuation-specific fields
  isContinuation?: boolean;
  previousSessionId?: string;
}

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
    private chatMessageService: ChatMessageService,
    private notificationService: NotificationService,
  ) {}

  handleConnection(client: AuthSocket) {
  this.logger.log(`Chat client connected: ${client.id}`);
  
  // ✅ AUTO-REGISTER if role is 'Astrologer'
  const { userId, role } = client.handshake.auth || {};
  
  if (role === 'Astrologer' && userId) {
    this.astrologerSockets.set(userId, client.id);
    this.logger.log(`✅ Astrologer auto-registered: ${userId} | Socket: ${client.id}`);
  }
}


  handleDisconnect(client: AuthSocket) {
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

     const payload: IncomingChatRequestPayload = {
        sessionId: result.data.sessionId,
        orderId: result.data.orderId,
        userId: data.userId,
        ratePerMinute: data.ratePerMinute,
        requestExpiresIn: 180000,
        sound: 'ringtone.mp3',
        vibration: true,
      };
      
      if (astrologerSocketId) {
        this.server.to(astrologerSocketId).emit('incoming_chat_request', payload);
      } else {
        // If astrologer not online, emit to a global astrologer notification channel
        this.server.emit('incoming_chat_request_to_astrologer', {
          astrologerId: data.astrologerId,
          ...payload,
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

  // ===== CONTINUE CHAT (behaves like new chat request) =====
  @SubscribeMessage('continue_chat')
  async handleContinueChat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      userId: string;
      astrologerId: string;
      previousSessionId: string;
      ratePerMinute: number;
    }
  ) {
    try {
      const result = await this.chatSessionService.continueChat({
        userId: data.userId,
        astrologerId: data.astrologerId,
        previousSessionId: data.previousSessionId,
        ratePerMinute: data.ratePerMinute,
      });

      const { sessionId, orderId, ratePerMinute } = result.data;

      const astrologerSocketId = this.astrologerSockets.get(data.astrologerId);

      const payload: IncomingChatRequestPayload = {
        sessionId,
        orderId,
        userId: data.userId,
        ratePerMinute,
        requestExpiresIn: 180000,
        sound: 'ringtone.mp3',
        vibration: true,
        isContinuation: true,
        previousSessionId: data.previousSessionId,
      };

      if (astrologerSocketId) {
        // Same event name as initiate_chat, with extra flags
        this.server.to(astrologerSocketId).emit('incoming_chat_request', payload);
      } else {
        // Fallback channel for offline astrologer clients
        this.server.emit('incoming_chat_request_to_astrologer', {
          astrologerId: data.astrologerId,
          ...payload,
        });
      }

      // Optional: notify user that continuation request is sent
      client.emit('chat_continuation_initiated', {
        sessionId,
        orderId,
        previousSessionId: data.previousSessionId,
        status: result.data.status,
      });

      return result;
    } catch (error: any) {
      this.logger.error(`Continue chat error: ${error.message}`);
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
  @MessageBody() payload: any
) {
  try {
    const data = Array.isArray(payload) ? payload[0] : payload;
    
    this.logger.log(`🚀 start_chat from ${client.id}`);
    this.logger.log(`🔍 Data: ${JSON.stringify(data)}`);

    if (!data || !data.sessionId || !data.userId || !data.role) {
      this.logger.error('❌ Missing required start_chat fields');
      return { success: false, message: 'Missing required fields' };
    }

    this.logger.log(`⏳ Calling chatSessionService.startSession for ${data.sessionId}`);
    const result = await this.chatSessionService.startSession(data.sessionId);
    this.logger.log(`✅ startSession returned: ${JSON.stringify(result)}`);

    client.join(data.sessionId);

    this.activeUsers.set(data.userId, {
      socketId: client.id,
      userId: data.userId,
      role: data.role,
      sessionId: data.sessionId
    });

    await this.chatSessionService.updateOnlineStatus(data.sessionId, data.userId, data.role, true);

    // ✅ Send kundli if user provides details
    if (result.data.sendKundliMessage && data.kundliDetails) {
      const session = await this.chatSessionService.getSession(data.sessionId);
      
      if (!session) {
        throw new BadRequestException('Session not found');
      }
      
      this.logger.log(`📜 Creating kundli message for session ${data.sessionId}`);
      
      const kundliMessage = await this.chatMessageService.sendKundliDetailsMessage(
        data.sessionId,
        session.astrologerId.toString(),
        data.userId,
        session.orderId,
        data.kundliDetails
      );

      this.server.to(data.sessionId).emit('chat_message', {
        messageId: kundliMessage.messageId,
        sessionId: kundliMessage.sessionId,
        senderId: kundliMessage.senderId,
        senderModel: kundliMessage.senderModel,
        type: 'kundli_details',
        content: kundliMessage.content,
        message: kundliMessage.content,
        kundliDetails: kundliMessage.kundliDetails,
        isVisibleToUser: false,
        isVisibleToAstrologer: true,
        deliveryStatus: 'sent',
        sentAt: kundliMessage.sentAt,
        automatic: true,
        threadId: data.sessionId,
      });

      this.logger.log(`✅ Kundli message emitted for session ${data.sessionId}`);
    }

    // ✅ Emit timer_start
    this.logger.log(`⏰ Emitting timer_start for session ${data.sessionId}`);
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

    this.logger.log(`✅ start_chat completed successfully for ${data.sessionId}`);
    return { success: true, message: 'Chat started' };
  } catch (error: any) {
    this.logger.error(`❌ Start chat error: ${error.message}`);
    this.logger.error(`❌ Stack: ${error.stack}`);
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

// ===== SEND MESSAGE - BROADCAST TO ALL IN ROOM =====
@SubscribeMessage('send_message')
async handleSendMessage(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any
) {
  try {
    const data = Array.isArray(payload) ? payload[0] : payload;

    this.logger.log(`📤 send_message from ${client.id}`);
    this.logger.log(`🔍 SessionId: ${data.sessionId}`);
    this.logger.log(`🔍 Content: ${data.content?.substring(0, 50)}`);

    // Basic validation
    if (!data?.sessionId || !data?.senderId || !data?.receiverId) {
      this.logger.error('❌ Missing required fields');
      return { success: false, message: 'Missing required fields' };
    }

    const messageContent = data.content || data.message || '';
    if (!messageContent.trim()) {
      this.logger.error('❌ Empty message content');
      return { success: false, message: 'Message content is required' };
    }

    // ===== SESSION STATE ENFORCEMENT =====
    const session = await this.chatSessionService.getSession(data.sessionId);
    if (!session) {
      this.logger.error(`❌ Session not found: ${data.sessionId}`);
      return { success: false, message: 'Session not found' };
    }

    const now = new Date();

    // Determine real role based on session participants
    const currentUserId: string =
      (client as any).data?.userId || data.senderId;

    const isUser = session.userId.toString() === currentUserId;
    const isAstrologer = session.astrologerId.toString() === currentUserId;

    if (!isUser && !isAstrologer) {
      this.logger.error(
        `❌ Sender ${currentUserId} is not part of session ${data.sessionId}`,
      );
      return { success: false, message: 'Not allowed in this session' };
    }

    const type = data.type || 'text';

    // 1) Active session: allow both sides
    if (session.status === 'active') {
      // allowed
    } else if (session.status === 'ended') {
      // 2) Ended session: allow only astrologer within grace window
      const withinGrace =
        session.postSessionWindowEndsAt &&
        now <= new Date(session.postSessionWindowEndsAt);

      if (!(isAstrologer && withinGrace)) {
        this.logger.warn(
          `🚫 Message blocked after end: session=${data.sessionId}, sender=${currentUserId}`,
        );
        return {
          success: false,
          message: 'Session has ended. Please continue chat to send messages.',
        };
      }

      // Optional: in grace window, allow only text messages
      if (type !== 'text') {
        this.logger.warn(
          `🚫 Non-text message blocked in grace window: session=${data.sessionId}, sender=${currentUserId}`,
        );
        return {
          success: false,
          message: 'Only text messages are allowed after session end.',
        };
      }
    } else {
      // 3) Any other status: waiting/pending/etc – block messaging
      this.logger.warn(
        `🚫 Message blocked; session not active: session=${data.sessionId}, status=${session.status}`,
      );
      return {
        success: false,
        message: 'Session is not active. Please wait for acceptance or continue chat.',
      };
    }

    // ===== SAVE MESSAGE AFTER ALL CHECKS =====
    const message = await this.chatMessageService.sendMessage({
      sessionId: data.sessionId,
      senderId: data.senderId,
      senderModel: data.senderModel || (isUser ? 'User' : 'Astrologer'),
      receiverId: data.receiverId,
      receiverModel: data.receiverModel || (isUser ? 'Astrologer' : 'User'),
      orderId: data.orderId,
      type,
      content: messageContent,
      fileUrl: data.fileUrl,
      fileDuration: data.fileDuration,
      fileName: data.fileName,
    });

    // ✅ CRITICAL: Check who's in the room
    const socketsInRoom = await this.server.in(data.sessionId).allSockets();
    this.logger.log(`📊 Room ${data.sessionId} has ${socketsInRoom.size} sockets`);
    this.logger.log(`📊 Socket IDs: ${Array.from(socketsInRoom).join(', ')}`);

    // ✅ INTERNAL NOTIFICATION: if receiver is not in this chat room, send push/in-app
    const receiverActive = this.activeUsers.get(data.receiverId);
    const receiverInRoom = receiverActive && socketsInRoom.has(receiverActive.socketId);

    if (!receiverInRoom) {
      this.notificationService
        .sendNotification({
          recipientId: data.receiverId,
          recipientModel: (data.receiverModel || 'Astrologer') as 'User' | 'Astrologer',
          type: 'chat_message',
          title: 'New chat message',
          message: messageContent.substring(0, 80),
          data: {
            mode: 'chat',
            sessionId: data.sessionId,
            orderId: data.orderId,
            senderId: data.senderId,
            receiverId: data.receiverId,
          },
          priority: 'high',
        })
        .catch(err =>
          this.logger.error(`Internal chat notification error: ${err.message}`),
        );
    }

    // ✅ Broadcast to ALL in room (including sender)
    this.server.to(data.sessionId).emit('chat_message', {
      messageId: message.messageId,
      sessionId: message.sessionId.toString(),
      senderId: message.senderId.toString(),
      senderModel: message.senderModel,
      receiverId: message.receiverId.toString(),
      receiverModel: message.receiverModel,
      type: message.type,
      content: message.content,
      message: message.content,
      fileUrl: message.fileUrl,
      fileDuration: message.fileDuration,
      deliveryStatus: 'sent',
      sentAt: message.sentAt,
      threadId: data.sessionId,
      tempId: data.tempId,
    });

    this.logger.log(`✅ Message broadcasted to ${socketsInRoom.size} sockets`);

    return {
      success: true,
      messageId: message.messageId,
    };
  } catch (error: any) {
    this.logger.error(`❌ Send message error: ${error.message}`);
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

// ===== JOIN SESSION WITH AUTO-KUNDLI =====
@SubscribeMessage('join_session')
async handleJoinSession(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any
) {
  try {
    const data = Array.isArray(payload) ? payload[0] : payload;
    
    this.logger.log(`📍 join_session from ${client.id}`);
    this.logger.log(`🔍 SessionId: ${data.sessionId}, Role: ${data.role}, UserId: ${data.userId}`);
    
    // Join room
    client.join(data.sessionId);
    
    // Check room population
    const socketsInRoom = await this.server.in(data.sessionId).allSockets();
    this.logger.log(`👥 Room ${data.sessionId} now has ${socketsInRoom.size} sockets`);

    // Store user
    this.activeUsers.set(data.userId, {
      socketId: client.id,
      userId: data.userId,
      role: data.role,
      sessionId: data.sessionId
    });

    await this.chatSessionService.updateOnlineStatus(
      data.sessionId, 
      data.userId, 
      data.role, 
      true
    );

    // Emit to others
    client.to(data.sessionId).emit('user_joined', {
      userId: data.userId,
      role: data.role,
      isOnline: true,
      timestamp: new Date()
    });

    // ✅ AUTO-SEND KUNDLI if user joins with kundli details
    if (data.role === 'user' && data.kundliDetails) {
      this.logger.log(`📜 User has kundli details, sending to session ${data.sessionId}`);
      
      try {
        const session = await this.chatSessionService.getSession(data.sessionId);
        
        if (!session) {
          this.logger.error('❌ Session not found for kundli');
          return { success: true, message: 'Joined but session not found' };
        }
        
        // ✅ Save kundli message to database
        const kundliMessage = await this.chatMessageService.sendKundliDetailsMessage(
          data.sessionId,
          session.astrologerId.toString(),
          data.userId,
          session.orderId,
          data.kundliDetails
        );

        // ✅ Broadcast to ALL in room (including sender)
        this.server.to(data.sessionId).emit('chat_message', {
          messageId: kundliMessage.messageId,
          sessionId: kundliMessage.sessionId,
          senderId: data.userId,
          senderModel: 'User',
          receiverId: session.astrologerId.toString(),
          receiverModel: 'Astrologer',
          type: 'kundli_details',
          content: '📜 User Kundli Details',
          message: '📜 User Kundli Details',
          kundliDetails: {
            name: data.kundliDetails.name,
            dob: data.kundliDetails.dob,
            birthTime: data.kundliDetails.birthTime,
            birthPlace: data.kundliDetails.birthPlace,
            gender: data.kundliDetails.gender,
          },
          deliveryStatus: 'sent',
          sentAt: kundliMessage.sentAt || new Date(),
          threadId: data.sessionId,
          automatic: true,
        });

        this.logger.log(`✅ Kundli message broadcasted to ${socketsInRoom.size} sockets`);
      } catch (kundliError) {
        this.logger.error(`❌ Kundli send error: ${kundliError.message}`);
      }
    }

    return { success: true, message: 'Joined session successfully' };
  } catch (error: any) {
    this.logger.error(`❌ Join session error: ${error.message}`);
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
 /**
 * ✅ FIXED: END CHAT (WebSocket)
 */
@SubscribeMessage('end_chat')
async handleEndChat(
  @ConnectedSocket() client: Socket,
  @MessageBody() payload: any,
) {
  try {
    // ✅ Handle array or object payload
    const data = Array.isArray(payload) ? payload[0] : payload;
    
    this.logger.log(`🔴 end_chat from ${client.id}: ${JSON.stringify(data)}`);

    // ✅ Validate sessionId
    if (!data || !data.sessionId) {
      this.logger.error('❌ Missing sessionId in end_chat');
      return { success: false, message: 'Session ID is required' };
    }

    const sessionId = data.sessionId;
    const reason = data.reason || 'user_ended';
    const userId = data.userId || (client as any).handshake?.auth?.userId;

    // ✅ Check if session exists and is not already ended
    const session = await this.chatSessionService.getSession(sessionId);
    
    if (!session) {
      this.logger.warn(`⚠️ Session ${sessionId} not found (may be already ended)`);
      return { 
        success: true, 
        message: 'Session already ended or not found',
        data: { sessionId, status: 'ended' }
      };
    }

    // ✅ If already ended, return gracefully
    if (session.status === 'ended') {
      this.logger.log(`✅ Session ${sessionId} already ended, skipping`);
      return {
        success: true,
        message: 'Session already ended',
        data: {
          sessionId,
          status: 'ended',
          billedMinutes: session.billedMinutes,
          chargeAmount: session.totalAmount,
        },
      };
    }

    // ✅ End the session
    const result = await this.chatSessionService.endSession(
      sessionId,
      userId || 'user',
      reason,
    );

    // ✅ Stop timer if exists
    if (this.sessionTimers.has(sessionId)) {
      clearInterval(this.sessionTimers.get(sessionId)!);
      this.sessionTimers.delete(sessionId);
      this.logger.log(`⏹️ Timer cleared for session ${sessionId}`);
    }

    // ✅ Notify all participants
    this.server.to(sessionId).emit('chat_ended', {
      sessionId,
      reason,
      billedMinutes: result.data.billedMinutes,
      chargeAmount: result.data.chargeAmount,
      status: 'ended',
      timestamp: new Date(),
    });

    this.logger.log(`✅ Chat ended via WebSocket: ${sessionId}`);

    return {
      success: true,
      message: 'Chat ended successfully',
      data: result.data,
    };
  } catch (error: any) {
    this.logger.error(`❌ End chat error: ${error.message}`);
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
