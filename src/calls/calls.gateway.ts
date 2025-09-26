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
import { CallsService } from './calls.service';
import { FcmService } from '../firebase/fcm.service';
import { NotificationTemplatesService } from '../firebase/notification-templates.service';
import { DeviceTokenService } from '../users/services/device-token.service';

@WebSocketGateway({
  cors: { origin: '*', credentials: true },
  namespace: '/calls',
})
export class CallsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;
  
  private readonly logger = new Logger(CallsGateway.name);

  constructor(
    private readonly callsService: CallsService,
    private readonly fcmService: FcmService,
    private readonly notificationTemplates: NotificationTemplatesService,
    private readonly deviceTokenService: DeviceTokenService,
  ) {}

  async handleConnection(socket: Socket) {
    const { userId } = socket.handshake.query;
    this.logger.log(`🔗 Call client connected: ${socket.id} (userId: ${userId})`);
    
    // Join user to their personal room for call notifications
    if (userId) {
      socket.join(`user_${userId}`);
    }
  }

  async handleDisconnect(socket: Socket) {
    this.logger.log(`❌ Call client disconnected: ${socket.id}`);
  }

  // Join a call room
  @SubscribeMessage('join-call-room')
  async handleJoinCallRoom(
    @MessageBody() data: { callId: string; userId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.join(`call_${data.callId}`);
    
    // Notify other participants that user joined the call room
    socket.to(`call_${data.callId}`).emit('user-joined-call-room', {
      userId: data.userId,
      timestamp: new Date()
    });

    return { success: true, joined: `call_${data.callId}` };
  }

  // Leave a call room
  @SubscribeMessage('leave-call-room')
  async handleLeaveCallRoom(
    @MessageBody() data: { callId: string; userId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    socket.leave(`call_${data.callId}`);
    
    // Notify other participants that user left the call room
    socket.to(`call_${data.callId}`).emit('user-left-call-room', {
      userId: data.userId,
      timestamp: new Date()
    });

    return { success: true, left: `call_${data.callId}` };
  }

  // Initiate call and notify astrologer
  @SubscribeMessage('initiate-call')
  async handleInitiateCall(
    @MessageBody() data: {
      userId: string;
      astrologerId: string;
      callType: 'audio' | 'video';
      ratePerMinute: number;
    },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      // Create call session
      const callResponse = await this.callsService.initiateCall(data.userId, {
        astrologerId: data.astrologerId,
        callType: data.callType,
        ratePerMinute: data.ratePerMinute
      });

      const callId = callResponse.data.callId;

      // Join call room
      socket.join(`call_${callId}`);

      // Notify astrologer about incoming call
      this.server.to(`user_${data.astrologerId}`).emit('incoming-call', {
        callId,
        callType: data.callType,
        callerName: 'User', // You can fetch actual user name
        ratePerMinute: data.ratePerMinute,
        timestamp: new Date()
      });

      // Send push notification to astrologer
      await this.sendCallNotification(
        data.astrologerId, 
        'Incoming Call', 
        `You have an incoming ${data.callType} call`,
        { callId, callType: data.callType }
      );

      // Set timeout for call expiry (30 seconds)
      setTimeout(async () => {
        await this.handleCallTimeout(callId);
      }, 30000);

      return { success: true, data: callResponse.data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Accept incoming call
  @SubscribeMessage('accept-call')
  async handleAcceptCall(
    @MessageBody() data: { callId: string; astrologerId: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      // Join call using call service
      const joinResponse = await this.callsService.joinCall(data.astrologerId, {
        callId: data.callId
      });

      // Join call room
      socket.join(`call_${data.callId}`);

      // Notify user that call was accepted
      this.server.to(`call_${data.callId}`).emit('call-accepted', {
        callId: data.callId,
        acceptedBy: data.astrologerId,
        timestamp: new Date(),
        channelInfo: joinResponse.data
      });

      return { success: true, data: joinResponse.data };

    } catch (error) {
      this.logger.error(`Call accept failed: ${error.message}`);
      return { success: false, error: error.message };
    }
  }

  // Decline incoming call
  @SubscribeMessage('decline-call')
  async handleDeclineCall(
    @MessageBody() data: { callId: string; astrologerId: string; reason?: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      // End call with decline reason
      await this.callsService.endCall(data.astrologerId, {
        callId: data.callId,
        endReason: 'declined'
      });

      // Notify user that call was declined
      this.server.to(`call_${data.callId}`).emit('call-declined', {
        callId: data.callId,
        declinedBy: data.astrologerId,
        reason: data.reason || 'Astrologer is busy',
        timestamp: new Date()
      });

      return { success: true, message: 'Call declined' };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // End ongoing call
  @SubscribeMessage('end-call')
  async handleEndCall(
    @MessageBody() data: { callId: string; userId: string; endReason?: string },
    @ConnectedSocket() socket: Socket,
  ) {
    try {
      const endResponse = await this.callsService.endCall(data.userId, {
        callId: data.callId,
        endReason: data.endReason || 'completed'
      });

      // Notify all participants that call ended
      this.server.to(`call_${data.callId}`).emit('call-ended', {
        callId: data.callId,
        endedBy: data.userId,
        endReason: data.endReason,
        duration: endResponse.data.duration,
        totalAmount: endResponse.data.totalAmount,
        timestamp: new Date()
      });

      return { success: true, data: endResponse.data };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Handle call quality feedback
  @SubscribeMessage('call-quality-feedback')
  async handleCallQualityFeedback(
    @MessageBody() data: {
      callId: string;
      userId: string;
      quality: 'excellent' | 'good' | 'fair' | 'poor';
      issues?: {
        networkIssues?: boolean;
        audioIssues?: boolean;
        videoIssues?: boolean;
      };
    },
    @ConnectedSocket() socket: Socket,
  ) {
    // Update call session with quality feedback
    // This would require a method in CallsService
    this.logger.log(`📊 Call quality feedback for ${data.callId}: ${data.quality}`);
    
    return { success: true, message: 'Feedback recorded' };
  }

  // Handle user connection status in call
  @SubscribeMessage('call-connection-status')
  async handleCallConnectionStatus(
    @MessageBody() data: {
      callId: string;
      userId: string;
      status: 'joined' | 'left' | 'reconnecting';
    },
    @ConnectedSocket() socket: Socket,
  ) {
    // Broadcast connection status to other participants
    socket.to(`call_${data.callId}`).emit('participant-status-update', {
      userId: data.userId,
      status: data.status,
      timestamp: new Date()
    });

    return { success: true };
  }

  // Handle call timeout (when astrologer doesn't answer)
  private async handleCallTimeout(callId: string) {
    try {
      // Check if call is still in initiated or ringing state
      const activeCall = await this.callsService.getActiveCall('system'); // You'd need to modify this
      
      if (activeCall.data && activeCall.data.callId === callId && 
          activeCall.data.status === 'initiated') {
        
        // End call due to timeout
        await this.callsService.endCall('system', {
          callId,
          endReason: 'timeout'
        });

        // Notify participants
        this.server.to(`call_${callId}`).emit('call-timeout', {
          callId,
          message: 'Call timeout - astrologer did not answer',
          timestamp: new Date()
        });
      }
    } catch (error) {
      this.logger.error(`Call timeout handling failed: ${error.message}`);
    }
  }

  // Send FCM notification for calls
  private async sendCallNotification(
    userId: string, 
    title: string, 
    body: string, 
    data: { [key: string]: string }
  ) {
    try {
      const deviceTokens = await this.deviceTokenService.getUserDeviceTokens(userId);
      
      if (deviceTokens.length === 0) {
        this.logger.log(`📱 No device tokens found for user: ${userId}`);
        return;
      }

      const notification = this.notificationTemplates.createNormalNotification(
        title,
        body,
        data
      );

      await this.fcmService.sendToMultipleDevices(deviceTokens, notification);

    } catch (error) {
      this.logger.error(`❌ Failed to send call notification: ${error.message}`);
    }
  }
}
