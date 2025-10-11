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
import { CallSessionService } from '../services/call-session.service';
import { CallBillingService } from '../services/call-billing.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
  namespace: '/call',
})
export class CallGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private activeUsers = new Map<string, { socketId: string; userId: string; role: string }>();

  constructor(
    private callSessionService: CallSessionService,
    private callBillingService: CallBillingService
  ) {}

  handleConnection(client: Socket) {
    console.log(`Call client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    console.log(`Call client disconnected: ${client.id}`);
    for (const [key, value] of this.activeUsers.entries()) {
      if (value.socketId === client.id) {
        this.activeUsers.delete(key);
        break;
      }
    }
  }

  // Initiate call
  @SubscribeMessage('initiate_call')
  async handleInitiateCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: {
      sessionId: string;
      callerId: string;
      receiverId: string;
      callerName: string;
      callType: 'audio' | 'video';
    }
  ) {
    try {
      // Update session status to ringing
      await this.callSessionService.updateStatus(data.sessionId, 'ringing');

      // Send incoming call notification to receiver
      const receiverSocket = this.getSocketByUserId(data.receiverId);
      if (receiverSocket) {
        this.server.to(receiverSocket).emit('incoming_call', {
          sessionId: data.sessionId,
          callerId: data.callerId,
          callerName: data.callerName,
          callType: data.callType,
          timestamp: new Date(),
        });
      }

      return { success: true, message: 'Call initiated' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Accept call
  @SubscribeMessage('accept_call')
  async handleAcceptCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; receiverId: string }
  ) {
    try {
      // Update session status to active
      const session = await this.callSessionService.updateStatus(data.sessionId, 'active');

      // Notify caller that call was accepted
      this.server.emit('call_accepted', {
        sessionId: data.sessionId,
        receiverId: data.receiverId,
        timestamp: new Date(),
      });

      return { success: true, message: 'Call accepted', session };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // Reject call
  @SubscribeMessage('reject_call')
  async handleRejectCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; receiverId: string; reason?: string }
  ) {
    try {
      // Update session status to rejected
      await this.callSessionService.updateStatus(data.sessionId, 'rejected');

      // End the session
      await this.callSessionService.endSession(data.sessionId, data.receiverId, data.reason || 'rejected');

      // Notify caller
      this.server.emit('call_rejected', {
        sessionId: data.sessionId,
        receiverId: data.receiverId,
        reason: data.reason,
        timestamp: new Date(),
      });

      return { success: true, message: 'Call rejected' };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // End call
  @SubscribeMessage('end_call')
  async handleEndCall(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; endedBy: string; reason: string }
  ) {
    try {
      const session = await this.callSessionService.endSession(
        data.sessionId,
        data.endedBy,
        data.reason
      );

      // Notify all participants
      this.server.emit('call_ended', {
        sessionId: session.sessionId,
        endedBy: session.endedBy,
        endTime: session.endTime,
        duration: session.duration,
        totalAmount: session.totalAmount,
      });

      return { success: true, message: 'Call ended', session };
    } catch (error: any) {
      return { success: false, message: error.message };
    }
  }

  // User joined room
  @SubscribeMessage('join_room')
  handleJoinRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; role: 'user' | 'astrologer' }
  ) {
    client.join(data.sessionId);
    this.activeUsers.set(data.userId, {
      socketId: client.id,
      userId: data.userId,
      role: data.role,
    });

    client.to(data.sessionId).emit('user_joined_room', {
      userId: data.userId,
      role: data.role,
    });

    return { success: true };
  }

  // User left room
  @SubscribeMessage('leave_room')
  handleLeaveRoom(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string }
  ) {
    client.leave(data.sessionId);
    this.activeUsers.delete(data.userId);

    client.to(data.sessionId).emit('user_left_room', {
      userId: data.userId,
    });

    return { success: true };
  }

  // Network quality update
  @SubscribeMessage('network_quality')
  handleNetworkQuality(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { sessionId: string; userId: string; quality: number }
  ) {
    client.to(data.sessionId).emit('network_quality_update', {
      userId: data.userId,
      quality: data.quality,
    });
  }

  // Helper method to get socket by user ID
  private getSocketByUserId(userId: string): string | undefined {
    return this.activeUsers.get(userId)?.socketId;
  }

  // Add this to CallGateway class

@SubscribeMessage('update_metrics')
async handleUpdateMetrics(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: {
    sessionId: string;
    userId: string;
    networkQuality: number;
    reconnected?: boolean;
  }
) {
  try {
    const session = await this.callSessionService.getSession(data.sessionId);
    if (!session) return { success: false };

    // Update metrics
    if (data.networkQuality !== undefined) {
      if (data.userId === session.userId.toString()) {
        session.callMetrics.userNetworkQuality = data.networkQuality;
      } else {
        session.callMetrics.astrologerNetworkQuality = data.networkQuality;
      }
    }

    if (data.reconnected) {
      session.callMetrics.reconnectionCount += 1;
    }

    await session.save();

    return { success: true };
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

// Real-time billing update
@SubscribeMessage('get_current_billing')
async handleGetCurrentBilling(
  @ConnectedSocket() client: Socket,
  @MessageBody() data: { sessionId: string }
) {
  try {
    const billing = await this.callBillingService.calculateRealTimeBilling(data.sessionId);
    return billing;
  } catch (error: any) {
    return { success: false, message: error.message };
  }
}

}
