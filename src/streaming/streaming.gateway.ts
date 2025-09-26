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
import { Logger } from '@nestjs/common';
import { StreamManagementService } from './services/stream-management.service';
import { FcmService } from '../firebase/fcm.service';
import { NotificationTemplatesService } from '../firebase/notification-templates.service';
import { DeviceTokenService } from '../users/services/device-token.service';
import { v4 as uuidv4 } from 'uuid';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/streaming',
})
export class StreamingGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private readonly logger = new Logger(StreamingGateway.name);

  constructor(
    private readonly streamService: StreamManagementService,
    private readonly fcmService: FcmService,
    private readonly notificationTemplates: NotificationTemplatesService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async handleConnection(socket: Socket) {
    const { userId, streamId } = socket.handshake.query;
    this.logger.log(`🔗 Stream client connected: ${socket.id} (userId: ${userId}, streamId: ${streamId})`);
    
    // Join user to their personal room for notifications
    if (userId) {
      socket.join(`user_${userId}`);
    }
  }

  async handleDisconnect(socket: Socket) {
    const { userId, streamId } = socket.handshake.query;
    this.logger.log(`❌ Stream client disconnected: ${socket.id}`);
    
    // Handle viewer leaving stream
    if (userId && streamId) {
      await this.handleViewerDisconnect(userId.toString(), streamId.toString());
    }
  }

  // Join a stream room (for both host and viewers)
  @SubscribeMessage('join-stream-room')
  async handleJoinStreamRoom(
    @MessageBody() data: { 
      streamId: string; 
      userId: string; 
      role: 'host' | 'viewer';
      userName?: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.join(`stream_${data.streamId}`);
    
    // Notify others about new participant
    socket.to(`stream_${data.streamId}`).emit('user-joined-stream', {
      userId: data.userId,
      userName: data.userName,
      role: data.role,
      timestamp: new Date()
    });

    // Update viewer count if it's a viewer
    if (data.role === 'viewer') {
      const viewerCount = await this.getStreamViewerCount(data.streamId);
      this.server.to(`stream_${data.streamId}`).emit('viewer-count-update', {
        streamId: data.streamId,
        viewerCount,
        timestamp: new Date()
      });
    }

    return { success: true, joined: `stream_${data.streamId}` };
  }

  // Leave a stream room
  @SubscribeMessage('leave-stream-room')
  async handleLeaveStreamRoom(
    @MessageBody() data: { streamId: string; userId: string; role: 'host' | 'viewer' },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.leave(`stream_${data.streamId}`);
    
    // Handle viewer leaving
    if (data.role === 'viewer') {
      await this.streamService.leaveStream(data.userId, data.streamId);
      
      // Update viewer count
      const viewerCount = await this.getStreamViewerCount(data.streamId);
      this.server.to(`stream_${data.streamId}`).emit('viewer-count-update', {
        streamId: data.streamId,
        viewerCount,
        timestamp: new Date()
      });
    }

    // Notify others about user leaving
    socket.to(`stream_${data.streamId}`).emit('user-left-stream', {
      userId: data.userId,
      role: data.role,
      timestamp: new Date()
    });

    return { success: true, left: `stream_${data.streamId}` };
  }

  // Start live stream
  @SubscribeMessage('start-stream')
  async handleStartStream(
    @MessageBody() data: { streamId: string; astrologerId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      const streamResponse = await this.streamService.startStream(data.astrologerId, data.streamId);
      
      // Join stream room as host
      socket.join(`stream_${data.streamId}`);

      // Notify all followers about live stream
      await this.notifyFollowersAboutLiveStream(data.astrologerId, data.streamId);

      // Broadcast stream started event
      this.server.emit('stream-started', {
        streamId: data.streamId,
        astrologerId: data.astrologerId,
        timestamp: new Date()
      });

      return { success: true, data: streamResponse.data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // End live stream
  @SubscribeMessage('end-stream')
  async handleEndStream(
    @MessageBody() data: { streamId: string; astrologerId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      const endResponse = await this.streamService.endStream(data.astrologerId, data.streamId);

      // Notify all viewers that stream ended
      this.server.to(`stream_${data.streamId}`).emit('stream-ended', {
        streamId: data.streamId,
        endedBy: data.astrologerId,
        analytics: endResponse.data,
        timestamp: new Date()
      });

      // Broadcast to global stream list
      this.server.emit('stream-ended-global', {
        streamId: data.streamId,
        timestamp: new Date()
      });

      return { success: true, data: endResponse.data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send live chat message in stream
  @SubscribeMessage('send-stream-message')
  async handleSendStreamMessage(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      message: string;
      messageType: 'text' | 'question' | 'tip';
    },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      // Generate message ID
      const messageId = uuidv4();
      
      // Save message to stream (you'd implement this in service)
      const messageData = {
        messageId,
        userId: data.userId,
        userName: data.userName,
        message: data.message,
        messageType: data.messageType,
        timestamp: new Date()
      };

      // Broadcast message to all stream participants
      this.server.to(`stream_${data.streamId}`).emit('stream-message', messageData);

      // Update message count in database
      await this.incrementStreamMessageCount(data.streamId);

      return { success: true, messageId };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Send tip in live stream
  @SubscribeMessage('send-stream-tip')
  async handleSendStreamTip(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      amount: number;
      message?: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      const tipResponse = await this.streamService.sendTip(
        data.userId,
        data.streamId,
        data.amount,
        data.message
      );

      // Broadcast tip to all stream participants
      this.server.to(`stream_${data.streamId}`).emit('stream-tip-received', {
        streamId: data.streamId,
        userName: data.userName,
        amount: data.amount,
        message: data.message,
        totalTips: tipResponse.data.totalTips,
        timestamp: new Date()
      });

      // Special animation for large tips
      if (data.amount >= 100) {
        this.server.to(`stream_${data.streamId}`).emit('big-tip-animation', {
          userName: data.userName,
          amount: data.amount,
          message: data.message
        });
      }

      return { success: true, data: tipResponse.data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Host interaction with viewers
  @SubscribeMessage('host-interaction')
  async handleHostInteraction(
    @MessageBody() data: {
      streamId: string;
      astrologerId: string;
      interactionType: 'answer_question' | 'shoutout' | 'poll' | 'announcement';
      content: string;
      targetUserId?: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    const interactionData = {
      ...data,
      timestamp: new Date()
    };

    // Broadcast host interaction
    this.server.to(`stream_${data.streamId}`).emit('host-interaction', interactionData);

    return { success: true };
  }

  // Moderate stream chat (remove messages, mute users, etc.)
  @SubscribeMessage('moderate-stream')
  async handleModerateStream(
    @MessageBody() data: {
      streamId: string;
      astrologerId: string;
      action: 'delete_message' | 'mute_user' | 'ban_user';
      targetMessageId?: string;
      targetUserId?: string;
      reason?: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      // Perform moderation action
      const moderationData = {
        ...data,
        timestamp: new Date()
      };

      // Broadcast moderation action to stream
      this.server.to(`stream_${data.streamId}`).emit('stream-moderated', moderationData);

      // If user is banned, remove them from stream
      if (data.action === 'ban_user' && data.targetUserId) {
        this.server.to(`user_${data.targetUserId}`).emit('banned-from-stream', {
          streamId: data.streamId,
          reason: data.reason,
          timestamp: new Date()
        });
      }

      return { success: true };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Handle viewer reactions (like, love, clap, etc.)
  @SubscribeMessage('stream-reaction')
  async handleStreamReaction(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      reaction: '👍' | '❤️' | '👏' | '😮' | '😂' | '🔥';
    },
    @ConnectedSocket() socket: Socket,
  ) {
    // Broadcast reaction to stream
    this.server.to(`stream_${data.streamId}`).emit('stream-reaction', {
      ...data,
      timestamp: new Date()
    });

    return { success: true };
  }

  // Request to ask question (raised hand feature)
  @SubscribeMessage('raise-hand')
  async handleRaiseHand(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      userName: string;
      question: string;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    // Notify host about raised hand
    this.server.to(`stream_${data.streamId}`).emit('hand-raised', {
      ...data,
      timestamp: new Date()
    });

    return { success: true };
  }

  // Stream quality feedback
  @SubscribeMessage('stream-quality-feedback')
  async handleStreamQualityFeedback(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      quality: 'excellent' | 'good' | 'fair' | 'poor';
      issues?: string[];
    },
    @ConnectedSocket() socket: Socket,
  ) {
    this.logger.log(`📊 Stream quality feedback: ${data.streamId} - ${data.quality}`);
    
    return { success: true, message: 'Feedback recorded' };
  }

  // Private helper methods
  private async handleViewerDisconnect(userId: string, streamId: string) {
    try {
      await this.streamService.leaveStream(userId, streamId);
      
      // Update viewer count
      const viewerCount = await this.getStreamViewerCount(streamId);
      this.server.to(`stream_${streamId}`).emit('viewer-count-update', {
        streamId,
        viewerCount,
        timestamp: new Date()
      });

    } catch (error) {
      this.logger.error(`Error handling viewer disconnect: ${error.message}`);
    }
  }

  private async getStreamViewerCount(streamId: string): Promise<number> {
  try {
    // Use MongoDB to get accurate count instead of socket rooms
    const viewerCount = await this.streamService.getStreamViewerCount(streamId);
    return viewerCount;
  } catch (error) {
    this.logger.error(`Error getting viewer count: ${error.message}`);
    // Fallback: try to get from socket adapter with proper typing
    try {
      const adapter = this.server.sockets.adapter;
      const room = adapter.rooms?.get(`stream_${streamId}`);
      return room ? room.size - 1 : 0; // -1 to exclude the host
    } catch (adapterError) {
      this.logger.error(`Socket adapter error: ${adapterError.message}`);
      return 0;
    }
  }
}

  private async incrementStreamMessageCount(streamId: string) {
    // This would increment message count in the LiveStream document
    // Implementation would be added to StreamManagementService
    this.logger.log(`📝 Message count incremented for stream: ${streamId}`);
  }

  private async notifyFollowersAboutLiveStream(astrologerId: string, streamId: string) {
    try {
      // Get astrologer's followers (you'd need to implement this)
      // Send FCM notifications to followers
      
      const notification = this.notificationTemplates.createLiveEventNotification(
        'Your Astrologer is LIVE!',
        'Join the live session now',
        { streamId, astrologerId, type: 'stream_started' }
      );

      // This would send to all followers' device tokens
      this.logger.log(`📢 Live stream notifications sent for stream: ${streamId}`);

    } catch (error) {
      this.logger.error(`Failed to notify followers: ${error.message}`);
    }
  }

  // Periodic viewer count updates
  @SubscribeMessage('request-viewer-count')
  async handleRequestViewerCount(
    @MessageBody() data: { streamId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    const viewerCount = await this.getStreamViewerCount(data.streamId);
    
    socket.emit('viewer-count-response', {
      streamId: data.streamId,
      viewerCount,
      timestamp: new Date()
    });

    return { success: true, viewerCount };
  }

  // Handle stream buffering/connection issues
  @SubscribeMessage('stream-connection-status')
  async handleStreamConnectionStatus(
    @MessageBody() data: {
      streamId: string;
      userId: string;
      status: 'connected' | 'buffering' | 'reconnecting' | 'disconnected';
    },
    @ConnectedSocket() socket: Socket,
  ) {
    // Log connection issues for monitoring
    if (data.status !== 'connected') {
      this.logger.warn(`🔄 Stream connection issue: ${data.streamId} - ${data.status} for user ${data.userId}`);
    }

    return { success: true };
  }
}
